"""Dormant and orphaned account analysis shared by CIS 1.13 and 1.14.

Source, in order of preference (as in security_platform):
  1. Fusion Inactive Users Report (ESS job), when ORACLE_FUSION_POD_URL and its credentials are set.
     This is Fusion's own view of application sign-in activity.
  2. Identity domain lastSuccessfulLoginDate, when only IDCS is configured.
Accounts holding an identity domain admin role are flagged as privileged, like the platform's
iam_dormant_privileged_account check.
"""
from .base import EXT_USER_STATE, env_int, excluded_actors, parse_time, utc_now
from .context import admin_user_ids, is_federated_user, is_service_user, user_ext, users
from .fusion_client import FusionClient

SAMPLE = 25


def _privileged_names(api, ctx):
    """Usernames (lower-case) of identity domain administrators, or an empty set if IDCS is unavailable."""
    if not getattr(api, "configured", False):
        return set()
    try:
        ids = admin_user_ids(api, ctx)["user_ids"]
        return {(u.get("userName") or "").lower() for u in users(api, ctx) if u["id"] in ids}
    except Exception:
        return set()


def _orphans(api, ctx):
    if not getattr(api, "configured", False):
        return None
    try:
        return [{"user": u.get("userName")} for u in users(api, ctx) if u.get("active") and not u.get("groups") and not is_service_user(u)]
    except Exception:
        return None


def _from_fusion(client, days, excluded, privileged):
    records, jobs = client.inactive_users(days)
    dormant, active, suspended, unknown = [], [], 0, 0
    for r in records:
        if (r["user"] or "").lower() in excluded:
            continue
        if r["suspended"]:
            suspended += 1
            continue
        if r["days_inactive"] is None:
            unknown += 1
            continue
        row = {**r, "privileged": r["user"].lower() in privileged}
        (dormant if r["days_inactive"] >= days else active).append(row)
    return {
        "source": "Fusion Inactive Users Report (ESS AseInactiveUsersJob)",
        "ess_requests": jobs,
        "report_rows": len(records),
        "already_suspended": suspended,
        "rows_without_days_inactive": unknown,
    }, dormant, None, active


def _from_idcs(api, ctx, days, excluded, privileged):
    now = utc_now()
    dormant, recent, never, active, skipped = [], [], 0, 0, 0
    for u in users(api, ctx):
        if not u.get("active"):
            continue
        name = u.get("userName") or ""
        if is_service_user(u) or name.lower() in excluded:
            skipped += 1
            continue
        active += 1
        last = parse_time(user_ext(u, EXT_USER_STATE, "lastSuccessfulLoginDate"))
        reference = last or parse_time((u.get("meta") or {}).get("created"))
        row = {
            "user": name,
            "last_sign_in": user_ext(u, EXT_USER_STATE, "lastSuccessfulLoginDate"),
            "days_inactive": (now - reference).days if reference else None,
            "suspended": False,
            "federated": is_federated_user(u),
            "privileged": name.lower() in privileged,
        }
        if reference and (now - reference).days >= days:
            dormant.append(row)
            never += last is None
        else:
            recent.append(row)
    return {
        "source": "Identity domain lastSuccessfulLoginDate",
        "active_users_evaluated": active,
        "excluded_service_or_monitoring_accounts": skipped,
        "never_signed_in": never,
    }, dormant, active, recent


def analyse(api, ctx):
    if "dormancy" in ctx:
        return ctx["dormancy"]
    days = env_int("DORMANT_DAYS", 90)
    excluded = excluded_actors()
    privileged = _privileged_names(api, ctx)
    fusion = ctx.get("fusion_client") or FusionClient()
    fusion_error = None

    info = dormant = evaluated = active = None
    if fusion.configured:
        try:
            info, dormant, evaluated, active = _from_fusion(fusion, days, excluded, privileged)
        except Exception as exc:
            fusion_error = f"{type(exc).__name__}: {exc}"
            if not getattr(api, "configured", False):
                raise
    if info is None:
        info, dormant, evaluated, active = _from_idcs(api, ctx, days, excluded, privileged)

    dormant.sort(key=lambda d: (not d["privileged"], -(d["days_inactive"] or 0)))
    orphans = _orphans(api, ctx)
    active.sort(key=lambda d: (not d["privileged"], d["days_inactive"] if d["days_inactive"] is not None else 10**6))
    ctx["dormant_all"] = dormant  # full lists, saved by the runner for the Identity risks page
    ctx["active_all"] = active
    ctx["dormancy"] = {
        **info,
        "threshold_days": days,
        "active_users_evaluated": evaluated,
        "dormant_count": len(dormant),
        "active_count": len(active),
        "dormant_privileged_count": sum(d["privileged"] for d in dormant),
        "dormant_sample": dormant[:SAMPLE],
        "no_group_membership_count": len(orphans) if orphans is not None else None,
        "no_group_membership_sample": (orphans or [])[:SAMPLE],
        **({"fusion_error": fusion_error} if fusion_error else {}),
    }
    return ctx["dormancy"]
