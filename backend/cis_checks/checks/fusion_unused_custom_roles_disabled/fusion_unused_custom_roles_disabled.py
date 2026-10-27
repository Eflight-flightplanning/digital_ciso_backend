"""CIS 4.1.3: unused custom roles are disabled or monitored.

Compares the pod's role catalogue (Fusion SCIM Roles, or the HCM REST roles resource) with the role
assignments read for 4.3, 5.3.7 and 5.1.2 (userAccounts / userAccountRoles).

A custom role is one whose code does not start with ORA_ (Oracle's predefined roles all do). Duty roles
are left out: they are never assigned to users directly, only inherited through job and abstract roles.
CUSTOM_ROLE_PREFIXES (for example "XX_,ACME_") limits custom roles to those prefixes instead, for pods
whose older predefined roles lack the ORA_ prefix. UNUSED_ROLE_EXCLUDE lists role codes to leave out (for example roles kept for a planned rollout).

FAIL when a custom role is assigned to nobody. Roles held only by suspended accounts are listed as well,
for review. Whether a role's use is monitored in Risk Management (control 80001) is not visible here.
"""
from cis_checks import fusion_roles
from cis_checks.base import Check, env_list
from cis_checks.fusion_client import FusionClient

SAMPLE = 100


def is_custom(role, prefixes):
    code = (role["code"] or "").upper()
    if "DUTY" in role["category"]:
        return False
    return code.startswith(tuple(prefixes)) if prefixes else not code.startswith("ORA_")


class fusion_unused_custom_roles_disabled(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client") or FusionClient()
        if not client.configured:
            result = self.result("MANUAL", "Manual control: no Fusion pod is configured (Connections page), so roles cannot be read.")
            result["not_assessed"] = True
            return result
        catalogue, source = client.roles()
        users = fusion_roles.load(ctx)
        excluded = {c.upper() for c in env_list("UNUSED_ROLE_EXCLUDE")}
        prefixes = [p.upper() for p in env_list("CUSTOM_ROLE_PREFIXES")]

        active_holders, any_holders = {}, {}
        for u in users:
            for code in {(r["code"] or "").upper() for r in u["roles"]}:
                any_holders[code] = any_holders.get(code, 0) + 1
                if not u["suspended"]:
                    active_holders[code] = active_holders.get(code, 0) + 1

        custom = [r for r in catalogue if is_custom(r, prefixes) and r["code"].upper() not in excluded]
        unused = sorted((r for r in custom if not any_holders.get(r["code"].upper())), key=lambda r: r["code"])
        suspended_only = sorted(
            (r for r in custom if any_holders.get(r["code"].upper()) and not active_holders.get(r["code"].upper())),
            key=lambda r: r["code"],
        )

        def row(r):
            return {"role": r["code"], "name": r["name"], "category": r["category"] or None}

        evidence = {
            "source": f"{source} (role catalogue) and HCM REST userAccounts / userAccountRoles (assignments)",
            "rule": "FAIL when a custom role is assigned to nobody (duty roles left out)",
            "custom_role_test": f"code starts with {', '.join(prefixes)}" if prefixes else "code does not start with ORA_",
            "roles_in_catalogue": len(catalogue),
            "custom_roles": len(custom),
            "excluded_by_setting": sorted(excluded),
            "unused_custom_roles": len(unused),
            "unused": [row(r) for r in unused[:SAMPLE]],
            "held_only_by_suspended_users": [row(r) for r in suspended_only[:SAMPLE]],
            "not_assessed_here": "Whether role use is monitored in Risk Management (control 80001).",
        }
        if not custom:
            return self.result("PASS", f"No custom roles found among the {len(catalogue)} roles on the pod.", evidence)
        if unused:
            reason = (
                f"{len(unused)} of {len(custom)} custom role(s) are assigned to nobody and should be inactivated or monitored"
                f" (for example {', '.join(r['code'] for r in unused[:3])})."
            )
            if suspended_only:
                reason += f" {len(suspended_only)} more are held only by suspended accounts."
            return self.result("FAIL", reason, evidence)
        reason = f"All {len(custom)} custom role(s) are assigned to at least one user."
        if suspended_only:
            reason += f" {len(suspended_only)} are held only by suspended accounts; review them."
        return self.result("PASS", reason, evidence)
