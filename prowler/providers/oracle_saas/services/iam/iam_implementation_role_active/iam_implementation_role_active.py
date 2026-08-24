from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.iam import ErpIamService
from prowler.providers.common.provider import Provider


class iam_implementation_role_active(Check):
    """Checks that Oracle Fusion ERP Implementation Consultant roles are not active
    after the system go-live.

    The 'Application Implementation Consultant' role grants broad, unrestricted
    access to configure Oracle Fusion ERP. This role is intended for
    implementation projects only and must be revoked from all users after go-live.
    Retaining this role post-go-live is a critical SOX and ITGC audit finding.
    """

    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpIamService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        for user in service.implementation_role_users:
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=user,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "FAIL"
            report.status_extended = (
                f"User '{user.username}' ({user.display_name}) still holds the "
                "'ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT' role. "
                "This role provides unrestricted ERP configuration access and "
                "must be removed after the go-live date. "
                "Retaining this role is a SOX / ITGC critical finding."
            )
            findings.append(report)

        if not findings:
            class _TenantResource(BaseModel):
                id: str = tenant_id
                username: str = "all-users"
                display_name: str = "All ERP Users"

            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=_TenantResource(),
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "PASS"
            report.status_extended = "No active users hold the Implementation Consultant role in Oracle Fusion ERP."
            findings.append(report)

        return findings
