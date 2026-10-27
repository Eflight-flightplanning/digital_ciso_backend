"""CIS 5.3.7: potential ghost employees, from Fusion role assignments (HCM REST).

CIS's example controls (50003, 50004) look for new hires created by the same user who manages
personal payments or time cards. The access that makes this possible is one user holding a hiring
role together with a payroll/payment or time-card role (security_platform's SoD rule "HR Specialist +
Payroll Manager: ghost employee risk"). FAIL when any active user has that combination; otherwise
MANUAL (partially evidenced), because payroll transactions without work evidence are not visible here."""
from cis_checks import fusion_roles
from cis_checks.base import Check

SAMPLE = 50


class fusion_ghost_employees_monitored(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client")
        if client is not None and not client.configured:
            result = self.result("MANUAL", "NOT assessed: no Fusion pod is configured (ORACLE_FUSION_*). Follow the audit procedure and record the outcome.")
            result["not_assessed"] = True
            return result
        users = fusion_roles.load(ctx)
        conflicts = []
        for u in users:
            if u["suspended"]:
                continue
            hire = fusion_roles.matching(u["roles"], fusion_roles.HIRE_PATTERNS)
            if not hire:
                continue
            pay = fusion_roles.matching(u["roles"], fusion_roles.PAYROLL_PATTERNS)
            time = fusion_roles.matching(u["roles"], fusion_roles.TIMECARD_PATTERNS)
            if pay or time:
                revocable = [
                    {"code": r["code"], "user_role_id": r.get("user_role_id")}
                    for r in u["roles"]
                    if r["code"] in set(pay) | set(time)
                ]
                conflicts.append(
                    {"user": u["user"], "guid": u.get("guid"), "hire_roles": hire, "payroll_roles": pay, "timecard_roles": time,
                     "revocable_roles": revocable}
                )
        ctx["ghost_all"] = conflicts  # full list, saved by the runner for the Identity risks page

        evidence = {
            "source": "Fusion HCM REST userAccounts / userAccountRoles",
            "hire_role_patterns": fusion_roles.HIRE_PATTERNS,
            "payroll_role_patterns": fusion_roles.PAYROLL_PATTERNS,
            "timecard_role_patterns": fusion_roles.TIMECARD_PATTERNS,
            "active_users_scanned": sum(not u["suspended"] for u in users),
            "users_with_conflict": len(conflicts),
            "hire_and_payroll": sum(bool(c["payroll_roles"]) for c in conflicts),
            "hire_and_timecards": sum(bool(c["timecard_roles"]) for c in conflicts),
            "conflicts_sample": [
                {k: c[k] for k in ("user", "hire_roles", "payroll_roles", "timecard_roles")} for c in conflicts[:SAMPLE]
            ],
        }
        if conflicts:
            reason = (
                f"{len(conflicts)} active users can both hire employees and manage payroll or time cards "
                f"({evidence['hire_and_payroll']} payroll, {evidence['hire_and_timecards']} time cards), so one person could "
                "create and pay a ghost employee. Payroll transactions themselves are NOT assessed from here."
            )
            return self.result("FAIL", reason, evidence)
        reason = (
            "No active user holds a hiring role together with a payroll or time-card role. Payroll entries without time or "
            "other evidence of work are NOT assessed from here."
        )
        return self.result("PARTIAL", reason, evidence)
