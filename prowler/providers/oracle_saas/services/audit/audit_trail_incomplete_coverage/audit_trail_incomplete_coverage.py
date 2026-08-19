from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.audit import ErpAuditService, REQUIRED_AUDIT_OBJECTS
from prowler.providers.common.provider import Provider


class audit_trail_incomplete_coverage(Check):
    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpAuditService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        class _AuditCoverageResource(BaseModel):
            id: str
            name: str
            display_name: str

        res = _AuditCoverageResource(
            id=f"{tenant_id}/audit-coverage",
            name="Audit Scope",
            display_name="Oracle Fusion ERP Audit Scope"
        )

        report = CheckReportOracleSaas(
            metadata=self.metadata(),
            resource=res,
            tenant_id=tenant_id,
            erp_type=erp_type,
        )

        missing = service.missing_audit_objects
        if not missing:
            report.status = "PASS"
            report.status_extended = "All required sensitive Oracle Fusion ERP business objects are actively audited."
        else:
            report.status = "FAIL"
            report.status_extended = (
                f"Oracle Fusion ERP Audit Trail is missing coverage for {len(missing)} critical business object(s): "
                f"{', '.join(sorted(missing))}. Add these objects to the audit policy to satisfy SOX 404 ITGC."
            )

        findings.append(report)
        return findings
