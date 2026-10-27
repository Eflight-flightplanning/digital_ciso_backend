from cis_checks.base import Check
from cis_checks.dormancy import analyse


class identity_domain_dormant_accounts_auto_disabled(Check):
    def execute(self, api, ctx):
        ev = analyse(api, ctx)
        source = f"Source: {ev['source']}."
        if ev["dormant_count"]:
            reason = (
                f"{ev['dormant_count']} accounts are still active after {ev['threshold_days']} or more days of inactivity, "
                f"so dormant accounts are not being disabled automatically. {source}"
            )
            return self.result("FAIL", reason, ev)
        reason = (
            f"No active account has been inactive for {ev['threshold_days']} days or more. Whether a governance policy disables "
            f"accounts automatically is NOT assessed from here; confirm the policy and its logs. {source}"
        )
        return self.result("PARTIAL", reason, ev)
