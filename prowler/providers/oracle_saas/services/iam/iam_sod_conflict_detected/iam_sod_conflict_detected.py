from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.iam import ErpIamService, SodConflict
from prowler.providers.common.provider import Provider


class iam_sod_conflict_detected(Check):
    """Detects Separation of Duties (SoD) toxic role combinations in Oracle Fusion ERP.

    A SoD conflict exists when a single user holds two incompatible roles that,
    when combined, allow them to perform a sensitive business transaction end-to-end
    without requiring a second authorizer. This is a primary SOC 1 / ITGC control.

    Examples of toxic combinations:
      - AP Manager + Payment Processor (can create and disburse payments)
      - GL Accountant + Journal Entry Manager (can post and approve journals)
      - Buyer + AP Specialist (can raise POs and approve invoices)
    """

    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []

        provider = Provider.get_global_provider()
        service = ErpIamService(provider)

        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        if not service.sod_conflicts:
            # Create a single PASS finding for the tenant
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
            report.status_extended = (
                "No Separation of Duties (SoD) toxic role combinations were "
                "detected across all active Oracle Fusion ERP users."
            )
            findings.append(report)
        else:
            for conflict in service.sod_conflicts:
                report = CheckReportOracleSaas(
                    metadata=self.metadata(),
                    resource=conflict,
                    resource_name=conflict.username,
                    resource_id=conflict.user_id,
                    tenant_id=tenant_id,
                    erp_type=erp_type,
                )
                report.status = "FAIL"
                report.status_extended = (
                    f"SoD Conflict detected for user '{conflict.username}': "
                    f"Roles '{conflict.role_a}' and '{conflict.role_b}' are held simultaneously. "
                    f"Risk: {conflict.risk_description}"
                )
                findings.append(report)

        return findings
