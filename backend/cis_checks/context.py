"""Identity domain lookups shared between checks, cached in the run's ctx dict.

All checks in one run receive the same ctx, so each resource is fetched at most once.
"""
import json

from .base import EXT_CAPABILITIES, EXT_MFA, EXT_USER, EXT_USER_STATE, FEDERATED_NOTE, env_list

USER_ATTRIBUTES = [
    "userName",
    "active",
    "groups",
    "meta",
    f"{EXT_USER}:isFederatedUser",
    f"{EXT_USER}:serviceUser",
    f"{EXT_USER_STATE}:lastSuccessfulLoginDate",
    f"{EXT_MFA}:mfaStatus",
    f"{EXT_MFA}:preferredAuthenticationFactor",
    f"{EXT_CAPABILITIES}:canUseConsolePassword",
]

# Identity domain administrator app roles (granted on the IDCS application).
ADMIN_APP_ROLES = {
    "identity domain administrator",
    "security administrator",
    "application administrator",
    "user administrator",
    "user manager",
    "help desk administrator",
    "audit administrator",
}

CONSOLE_POLICY_HINTS = ("oci console", "security policy for oci console", "oracle cloud infrastructure console")


def _cached(ctx, key, loader):
    if key not in ctx:
        ctx[key] = loader()
    return ctx[key]


def prepare(api, ctx):
    """Run once before the checks: detect federation (sets ctx["federated"])."""
    providers = _cached(
        ctx,
        "identity_providers",
        lambda: api.list("IdentityProviders", filter="enabled eq true", attributes=["partnerName", "type", "enabled"]),
    )
    names = sorted({p.get("partnerName") or p.get("id", "?") for p in providers})
    if names:
        ctx["federated"] = {"providers": names}


def federated_note(ctx):
    fed = ctx.get("federated")
    return FEDERATED_NOTE.format(names=", ".join(fed["providers"])) if fed else ""


def users(api, ctx):
    return _cached(ctx, "users", lambda: api.list("Users", attributes=USER_ATTRIBUTES))


def user_ext(user, ext, attr, default=None):
    return (user.get(ext) or {}).get(attr, default)


def is_federated_user(user):
    return bool(user_ext(user, EXT_USER, "isFederatedUser", False))


def is_service_user(user):
    return bool(user_ext(user, EXT_USER, "serviceUser", False))


def groups_by_id(api, ctx):
    return _cached(
        ctx,
        "groups",
        lambda: {g["id"]: g for g in api.list("Groups", attributes=["displayName"])},
    )


def admin_user_ids(api, ctx):
    """Users holding an identity domain admin app role (directly or via a group), or in ADMIN_GROUPS."""

    def load():
        roles = api.list("AppRoles", filter='app.value eq "IDCSAppId"', attributes=["displayName"])
        admin_role_ids = {r["id"] for r in roles if (r.get("displayName") or "").lower() in ADMIN_APP_ROLES}
        grants = api.list("Grants", filter='app.value eq "IDCSAppId"', attributes=["grantee", "entitlement"])
        user_ids, group_ids = set(), set()
        for g in grants:
            ent = g.get("entitlement") or {}
            if ent.get("attributeName") == "appRoles" and ent.get("attributeValue") not in admin_role_ids:
                continue
            grantee = g.get("grantee") or {}
            (user_ids if grantee.get("type") == "User" else group_ids).add(grantee.get("value"))
        admin_group_names = {n.lower() for n in env_list("ADMIN_GROUPS", "Administrators,Domain_Administrators")}
        for gid, group in groups_by_id(api, ctx).items():
            if (group.get("displayName") or "").lower() in admin_group_names:
                group_ids.add(gid)
        for u in users(api, ctx):
            if any(m.get("value") in group_ids for m in u.get("groups") or []):
                user_ids.add(u["id"])
        return {"user_ids": user_ids, "group_ids": group_ids}

    return _cached(ctx, "admins", load)


def factor_settings(api, ctx):
    def load():
        body = api.get("/admin/v1/AuthenticationFactorSettings")
        items = body.get("Resources") or []
        return items[0] if items else body

    return _cached(ctx, "factor_settings", load)


def network_perimeters(api, ctx):
    return _cached(ctx, "perimeters", lambda: api.list("NetworkPerimeters", attributes=["name", "ipAddresses"]))


CONDITION_ATTRIBUTES = ["name", "attributeName", "operator", "attributeValue"]


def is_active(resource):
    """Only an explicit active=false means inactive; the API often returns null for active rules."""
    return resource.get("active") is not False


def signon_policies(api, ctx):
    """Sign-on policies with their rules and conditions resolved, in evaluation order.

    The Policies list omits each policy's rules unless they are requested (attributes=rules).
    A rule's conditionGroup is either a single Condition or a ConditionGroup (an and/or of Conditions).
    """

    def load():
        policies = api.list(
            "Policies", filter='policyType.value eq "SignOn"', attributes=["name", "active", "rules", "policyType"]
        )
        rules = {
            r["id"]: r
            for r in api.list("Rules", attributes=["name", "active", "condition", "conditionGroup", "return", "policyType"])
        }
        conditions = {c["id"]: c for c in api.list("Conditions", attributes=CONDITION_ATTRIBUTES)}
        groups = {g["id"]: g for g in api.list("ConditionGroups")}

        def condition_view(c):
            return {k: c.get(k) for k in ("name", "attributeName", "operator", "attributeValue")}

        def resolve(group_ref):
            gid, gtype = group_ref.get("value"), group_ref.get("type")
            if gtype == "ConditionGroup" and gid in groups:
                g = groups[gid]
                return {
                    "operator": g.get("operator"),
                    "conditions": [
                        condition_view(conditions[c["value"]]) if c.get("value") in conditions else {"unresolved": c.get("value")}
                        for c in g.get("conditions") or []
                    ],
                }
            if gid in conditions:
                return {"operator": None, "conditions": [condition_view(conditions[gid])]}
            return {"operator": None, "conditions": [{"unresolved": gid}]} if gid else None

        out = []
        for p in policies:
            ordered = sorted(p.get("rules") or [], key=lambda r: r.get("sequence", 0))
            resolved, unresolved = [], []
            for ref in ordered:
                rule = rules.get(ref.get("value"))
                if not rule:
                    unresolved.append(ref.get("value"))
                    continue
                group = rule.get("conditionGroup") or {}
                resolved.append(
                    {
                        "id": rule["id"],
                        "name": rule.get("name"),
                        "active": is_active(rule),
                        "sequence": ref.get("sequence"),
                        "condition": rule.get("condition"),
                        "condition_group": {k: group.get(k) for k in ("type", "value")},
                        "condition_detail": resolve(group),
                        "returns": rule.get("return") or [],
                    }
                )
            out.append({"id": p["id"], "name": p.get("name"), "active": is_active(p), "rules": resolved, "unresolved_rules": unresolved})
        return out

    return _cached(ctx, "signon_policies", load)


def rule_text(rule):
    """Everything a rule's condition says, as lower-case text, for reference matching."""
    return json.dumps([rule.get("condition"), rule.get("condition_group"), rule.get("condition_detail")]).lower()


def rule_tests_groups(rule):
    """True when one of the rule's conditions tests the user's group membership (user.groups...).

    Looks only at what each condition tests, never at the condition group's type name, because a
    rule of type "ConditionGroup" contains the word "group" whatever it checks.
    """
    detail = rule.get("condition_detail") or {}
    if any("groups" in str(c.get("attributeName", "")).lower() for c in detail.get("conditions") or []):
        return True
    return "groups" in json.dumps(rule.get("condition") or "").lower()


def rule_effect(rule):
    for r in rule.get("returns", []):
        if (r.get("name") or "").lower() == "effect":
            return str(r.get("value", "")).upper()
    return "ALLOW"


def rule_requires_mfa(rule):
    """True when the rule demands a second factor: authenticationFactor "IDP+2FA" (or "2FA"), or mfaRequired=true."""
    for r in rule.get("returns", []):
        name = (r.get("name") or "").lower()
        value = str(r.get("value", "")).upper()
        if name == "authenticationfactor" and ("2FA" in value or "MFA" in value):
            return True
        if name in ("mfarequired", "requiremfa") and value in ("TRUE", "1", "YES"):
            return True
    return False


def console_policies(policies):
    return [p for p in policies if any(h in (p.get("name") or "").lower() for h in CONSOLE_POLICY_HINTS)]
