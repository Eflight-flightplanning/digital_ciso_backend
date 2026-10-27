"""CIS 4.3: IT superuser role assignments, from the Fusion HCM REST API (as security_platform's
iam_superuser_role_assigned / iam_implementation_role_active checks do).

FAIL when active accounts hold Application Implementation Consultant (the role CIS names; it should
not stay assigned after go-live). Otherwise MANUAL (partially evidenced): the holders and the
assignments made in the last ROLE_REVIEW_DAYS are listed, but whether someone reviews them is a
process question this tool cannot see."""
from cis_checks import fusion_roles
from cis_checks.base import Check

SAMPLE = 50


class fusion_it_superuser_role_changes_monitored(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client")
        if client is not None and not client.configured:
            result = self.result("MANUAL", "NOT assessed: no Fusion pod is configured (ORACLE_FUSION_*). Follow the audit procedure and record the outcome.")
            result["not_assessed"] = True
            return result
        users = fusion_roles.load(ctx)
        patterns = fusion_roles.superuser_patterns()
        days = fusion_roles.review_window()

        holders, recent, by_role = [], [], {}
        for u in users:
            if u["suspended"]:
                continue
            roles = [r for r in u["roles"] if any(p in fusion_roles.normalise(r["code"]) for p in patterns)]
            if not roles:
                continue
            holders.append({"user": u["user"], "roles": sorted({r["code"] for r in roles})})
            for r in roles:
                by_role[r["code"]] = by_role.get(r["code"], 0) + 1
                if fusion_roles.recent(r["assigned"], days):
                    recent.append({"user": u["user"], "role": r["code"], "assigned": r["assigned"], "assigned_by": r["assigned_by"]})
        aic = [h for h in holders if any(fusion_roles.IMPLEMENTATION_CONSULTANT in fusion_roles.normalise(c) for c in h["roles"])]
        recent.sort(key=lambda r: r["assigned"] or "", reverse=True)

        evidence = {
            "source": "Fusion HCM REST userAccounts / userAccountRoles",
            "role_patterns": patterns,
            "active_users_scanned": sum(not u["suspended"] for u in users),
            "superuser_holders": len(holders),
            "implementation_consultant_holders": len(aic),
            "holders_by_role": dict(sorted(by_role.items(), key=lambda kv: -kv[1])),
            "review_window_days": days,
            "assigned_in_window": len(recent),
            "recent_assignments": recent[:SAMPLE],
            "holders_sample": holders[:SAMPLE],
        }
        if recent:
            recent_note = f" {len(recent)} superuser role assignments were made in the last {days} days; confirm each was reviewed."
        else:
            recent_note = f" No superuser role was assigned in the last {days} days."
        if aic:
            reason = (
                f"{len(aic)} active accounts hold Application Implementation Consultant, an IT superuser role that should not "
                f"remain assigned after go-live ({len(holders)} accounts hold IT superuser roles in total).{recent_note}"
            )
            return self.result("FAIL", reason, evidence)
        reason = (
            f"{len(holders)} active accounts hold IT superuser roles.{recent_note} Whether these assignments are monitored "
            "and reviewed is NOT assessed from here."
        )
        return self.result("PARTIAL", reason, evidence)
