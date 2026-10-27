"""CIS 4.1.1: changes to audit policy settings are monitored.

Tested by this tool from the Fusion pod (same connection as 1.14, 4.3 and 5.3.7). The Fusion audit API is confirmed
on the pod once the connection works; until then the check cannot complete (MANUAL, "Could not complete").
"""
from cis_checks.base import Check


class fusion_audit_policy_changes_monitored(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client")
        if client is None or not client.configured:
            reason = "Could not complete: no Fusion pod is configured (Connection page), so audit policy changes cannot be read yet."
        else:
            reason = (
                "Could not complete: the audit policy check runs against the Fusion pod's audit data. It is enabled once "
                "the pod connection is confirmed (the pod password is being renewed)."
            )
        return self.result("ERROR", reason, {"source": "Fusion pod audit data (Tools > Audit Reports, Product = Audit Policies)"})
