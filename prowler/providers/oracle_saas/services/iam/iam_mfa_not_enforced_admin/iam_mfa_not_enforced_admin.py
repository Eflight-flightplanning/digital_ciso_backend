from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.iam import ErpIamService
from prowler.providers.common.provider import Provider


class iam_mfa_not_enforced_admin(Check):
    """Checks that MFA is enforced for all privileged Oracle Fusion ERP administrators.

    MFA must be enabled for all accounts holding superuser, finance admin, or
    implementation roles to prevent account takeover attacks.
    """

    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpIamService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        for user in service.no_mfa_admin_users:
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=user,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "FAIL"
            report.status_extended = (
                f"Privileged ERP user '{user.username}' ({user.display_name}) "
                "does not have MFA enabled. MFA is required for all accounts "
                "with elevated Oracle Fusion ERP access."
            )
            findings.append(report)

        if not findings:
            class _TenantResource(BaseModel):
                id: str = tenant_id
                username: str = "all-admins"
                display_name: str = "All ERP Admins"

            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=_TenantResource(),
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "PASS"
            report.status_extended = "MFA is enabled for all privileged Oracle Fusion ERP administrator accounts."
            findings.append(report)

        return findings
