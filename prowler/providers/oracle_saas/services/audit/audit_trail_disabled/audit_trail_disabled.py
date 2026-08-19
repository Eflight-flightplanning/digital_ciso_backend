from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.audit import ErpAuditService
from prowler.providers.common.provider import Provider


class audit_trail_disabled(Check):
    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpAuditService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        class _AuditResource(BaseModel):
            id: str
            name: str
            display_name: str

        res = _AuditResource(
            id=f"{tenant_id}/audit-policy",
            name="Audit Policy",
            display_name="Oracle Fusion ERP Audit Trail"
        )

        report = CheckReportOracleSaas(
            metadata=self.metadata(),
            resource=res,
            tenant_id=tenant_id,
            erp_type=erp_type,
        )

        if service.audit_config and service.audit_config.enabled:
            report.status = "PASS"
            report.status_extended = (
                "Oracle Fusion ERP Audit Trail is enabled. "
                f"Retention: {service.audit_config.retention_days or 'default'} days. "
                f"Tamper-proof: {'Yes' if service.audit_config.tamper_proof else 'No'}."
            )
        else:
            report.status = "FAIL"
            report.status_extended = (
                "Oracle Fusion ERP Audit Trail is DISABLED. "
                "Security-critical changes to users, roles, and financial objects "
                "are not being recorded. Enable audit trail immediately via "
                "ERP > Setup and Maintenance > Manage Audit Policies."
            )

        findings.append(report)
        return findings
