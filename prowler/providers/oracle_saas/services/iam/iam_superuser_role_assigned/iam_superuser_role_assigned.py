from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.iam import ErpIamService, SUPERUSER_ROLES
from prowler.providers.common.provider import Provider


class iam_superuser_role_assigned(Check):
    """Checks that Oracle Fusion ERP superuser and implementation consultant roles
    are only assigned to explicitly authorized administrators.

    Superuser roles in Oracle Fusion ERP grant unrestricted access to security
    configurations, user management, and all application data. Unauthorized
    assignment of these roles is a critical security risk.
    """

    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpIamService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        for user in service.superuser_users:
            held_superuser_roles = SUPERUSER_ROLES.intersection(set(user.roles))
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=user,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "FAIL"
            report.status_extended = (
                f"User '{user.username}' ({user.display_name}) holds superuser/privileged "
                f"role(s): {', '.join(held_superuser_roles)}. "
                "Verify this assignment is explicitly authorized and documented."
            )
            findings.append(report)

        if not findings:
            class _TenantResource(BaseModel):
                id = tenant_id
                username = "all-users"
                display_name = "All ERP Users"

            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=_TenantResource(),
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "PASS"
            report.status_extended = "No unauthorized superuser role assignments detected in Oracle Fusion ERP."
            findings.append(report)

        return findings
