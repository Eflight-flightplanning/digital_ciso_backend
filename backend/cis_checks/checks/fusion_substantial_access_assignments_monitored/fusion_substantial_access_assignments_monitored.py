"""CIS 5.1.2: assignments of substantial access to Fusion users are monitored.

Uses the Fusion HCM role data shared with 4.3 and 5.3.7. "Substantial access" follows the CIS example
controls: HCM Data Loader import and sensitive-data loader access (4085, 4096, 4097) and sensitive IT
security privileges (9361), matched by role name (SUBSTANTIAL_ROLE_PATTERNS overrides the list).

Agreed rule: FAIL when any such role was granted to an active user in the last ROLE_REVIEW_DAYS (default
30), because new grants of this access need review. Otherwise PASS; the holders are listed for review.
"""
from cis_checks import fusion_roles
from cis_checks.base import Check, env_list

SAMPLE = 50
SUBSTANTIAL_PATTERNS = [
    "HCM_DATA_LOADER",
    "DATA_LOADER",
    "HUMAN_CAPITAL_MANAGEMENT_INTEGRATION_SPECIALIST",
    "HCM_INTEGRATION_SPECIALIST",
    "IT_SECURITY_MANAGER",
]


def patterns():
    return [p.upper() for p in env_list("SUBSTANTIAL_ROLE_PATTERNS")] or SUBSTANTIAL_PATTERNS


class fusion_substantial_access_assignments_monitored(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client")
        if client is not None and not client.configured:
            result = self.result("MANUAL", "Manual control: no Fusion pod is configured (Connections page), so role assignments cannot be read.")
            result["not_assessed"] = True
            return result
        users = fusion_roles.load(ctx)
        pats = patterns()
        days = fusion_roles.review_window()

        holders, recent, by_role = [], [], {}
        for u in users:
            if u["suspended"]:
                continue
            roles = [r for r in u["roles"] if any(p in fusion_roles.normalise(r["code"]) for p in pats)]
            if not roles:
                continue
            holders.append({"user": u["user"], "roles": sorted({r["code"] for r in roles})})
            for r in roles:
                by_role[r["code"]] = by_role.get(r["code"], 0) + 1
                if fusion_roles.recent(r["assigned"], days):
                    recent.append({"user": u["user"], "role": r["code"], "assigned": r["assigned"], "assigned_by": r["assigned_by"]})
        recent.sort(key=lambda r: r["assigned"] or "", reverse=True)

        evidence = {
            "source": "Fusion HCM REST userAccounts / userAccountRoles",
            "role_patterns": pats,
            "rule": f"FAIL when substantial-access roles were granted in the last {days} days",
            "active_users_scanned": sum(not u["suspended"] for u in users),
            "holders": len(holders),
            "holders_by_role": dict(sorted(by_role.items(), key=lambda kv: -kv[1])),
            "review_window_days": days,
            "granted_in_window": len(recent),
            "recent_grants": recent[:SAMPLE],
            "holders_sample": holders[:SAMPLE],
        }
        if recent:
            grantees = len({r["user"] for r in recent})
            reason = (
                f"{len(recent)} substantial-access role grant(s) to {grantees} active user(s) in the last {days} days need review "
                f"({len(holders)} active users hold such roles in total)."
            )
            return self.result("FAIL", reason, evidence)
        reason = (
            f"No substantial-access role (HCM data loader, IT security) was granted in the last {days} days. "
            f"{len(holders)} active users hold such roles; they are listed for periodic review."
        )
        return self.result("PASS", reason, evidence)
