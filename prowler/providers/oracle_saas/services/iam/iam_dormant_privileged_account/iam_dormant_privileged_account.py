from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.iam import ErpIamService, DORMANT_THRESHOLD_DAYS
from prowler.providers.common.provider import Provider


class iam_dormant_privileged_account(Check):
    """Detects privileged Oracle Fusion ERP accounts with no recent login activity.

    Accounts with superuser or finance admin roles that have not logged in for
    more than 90 days represent a persistent attack surface. They should be
    reviewed and suspended if no longer needed.
    """

    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpIamService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        for user in service.dormant_privileged_users:
            last_login_str = (
                user.last_login.strftime("%Y-%m-%d") if user.last_login else "Never"
            )
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=user,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "FAIL"
            report.status_extended = (
                f"Privileged ERP account '{user.username}' ({user.display_name}) "
                f"has not logged in since {last_login_str} "
                f"(threshold: {DORMANT_THRESHOLD_DAYS} days). "
                "Review whether this account is still required. "
                "If not, revoke the privileged role or suspend the account."
            )
            findings.append(report)

        if not findings:
            class _TenantResource(BaseModel):
                id: str = tenant_id
                username: str = "all-admins"
                display_name: str = "All Privileged ERP Accounts"

            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=_TenantResource(),
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "PASS"
            report.status_extended = (
                f"All privileged Oracle Fusion ERP accounts have been active within "
                f"the last {DORMANT_THRESHOLD_DAYS} days."
            )
            findings.append(report)

        return findings
