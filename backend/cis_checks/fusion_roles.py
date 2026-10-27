"""Fusion user-to-role assignments from the HCM REST API, shared by CIS 4.3 and 5.3.7.

Same source as security_platform (hcmRestApi userAccounts with userAccountRoles). Role codes vary
between pods (ORA_ prefix or not, data roles such as PAYROLL_MANAGER_-_VIEW_ALL_DATA), so roles are
matched by pattern after removing a leading ORA_.
"""
from datetime import timedelta

from .base import env_int, env_list, excluded_actors, parse_time, utc_now
from .fusion_client import FusionClient

# IT superuser roles (CIS 4.3; platform SUPERUSER_ROLES). Override with SUPERUSER_ROLE_PATTERNS.
SUPERUSER_PATTERNS = [
    "APPLICATION_IMPLEMENTATION_CONSULTANT",
    "APPLICATION_IMPLEMENTATION_MANAGER",
    "APPLICATION_IMPLEMENTATION_ADMIN",
    "IT_SECURITY_MANAGER",
    "APPS_SUPER_USER",
    "SYSTEM_ADMIN_JOB",
    "IDCS_ADMINISTRATOR",
]
IMPLEMENTATION_CONSULTANT = "APPLICATION_IMPLEMENTATION_CONSULTANT"

# Ghost-employee combination (CIS 5.3.7 examples 50003 / 50004; platform SoD "HR Specialist + Payroll").
HIRE_PATTERNS = ["HUMAN_RESOURCE_SPECIALIST", "HR_SPECIALIST"]
PAYROLL_PATTERNS = ["PAYROLL_MANAGER", "PAYROLL_ADMINISTRATOR", "PAYROLL_PAYMENT", "PERSONAL_PAYMENT", "BANK_ACCOUNT_SPECIALIST"]
TIMECARD_PATTERNS = ["TIME_AND_LABOR_MANAGER", "TIME_AND_LABOR_ADMINISTRATOR", "TIME_AND_LABOR_APPROVER"]


def normalise(code):
    code = (code or "").upper()
    return code[4:] if code.startswith("ORA_") else code


def matching(roles, patterns):
    return sorted({r["code"] for r in roles if any(p in normalise(r["code"]) for p in patterns)})


def superuser_patterns():
    return [p.upper() for p in env_list("SUPERUSER_ROLE_PATTERNS")] or SUPERUSER_PATTERNS


def load(ctx):
    """[{user, person_number, suspended, roles: [{code, assigned, assigned_by}]}], cached for the run.

    Raises when no Fusion pod is configured or the API fails; the runner records that as ERROR.
    """
    if "fusion_roles" in ctx:
        return ctx["fusion_roles"]
    client = ctx.get("fusion_client") or FusionClient()
    if not client.configured:
        raise RuntimeError("Fusion pod not configured: set ORACLE_FUSION_POD_URL, ORACLE_FUSION_USERNAME and ORACLE_FUSION_PASSWORD")
    users = client.user_roles()
    excluded = excluded_actors()
    ctx["fusion_roles"] = [u for u in users if (u.get("user") or "").lower() not in excluded]
    return ctx["fusion_roles"]


def recent(assigned, days):
    when = parse_time(assigned)
    return bool(when and when >= utc_now() - timedelta(days=days))


def review_window():
    return env_int("ROLE_REVIEW_DAYS", 30)
