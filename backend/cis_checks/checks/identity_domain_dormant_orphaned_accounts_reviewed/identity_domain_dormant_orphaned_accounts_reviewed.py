from cis_checks.base import Check
from cis_checks.dormancy import analyse


class identity_domain_dormant_orphaned_accounts_reviewed(Check):
    def execute(self, api, ctx):
        ev = analyse(api, ctx)
        source = f"Source: {ev['source']}."
        orphan_note = (
            f" {ev['no_group_membership_count']} active accounts belong to no identity domain group; Fusion roles are not "
            "groups, so review these rather than treating them as orphaned."
            if ev["no_group_membership_count"]
            else ""
        )
        fallback = f" Fusion report unavailable ({ev['fusion_error']}), so the identity domain was used." if ev.get("fusion_error") else ""
        if ev["dormant_count"]:
            privileged = f", {ev['dormant_privileged_count']} of them privileged" if ev["dormant_privileged_count"] else ""
            reason = (
                f"{ev['dormant_count']} active accounts have been inactive for {ev['threshold_days']} days or more"
                f"{privileged}. Review them and suspend those no longer needed. {source}{fallback}{orphan_note}"
            )
            return self.result("FAIL", reason, ev)
        reason = f"No active account has been inactive for {ev['threshold_days']} days or more. {source}{fallback}{orphan_note}"
        return self.result("PASS", reason, ev)
