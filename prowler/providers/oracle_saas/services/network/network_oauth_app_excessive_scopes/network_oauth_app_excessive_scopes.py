from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.network import ErpNetworkService, HIGH_RISK_SCOPES
from prowler.providers.common.provider import Provider


class network_oauth_app_excessive_scopes(Check):
    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpNetworkService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        if not service.oauth_apps_available:
            class _TenantResource(BaseModel):
                id: str
                name: str
                display_name: str

            res = _TenantResource(
                id=tenant_id,
                name="OAuth Applications",
                display_name="All Oracle IDCS OAuth Apps"
            )
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=res,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "MANUAL"
            report.status_extended = (
                "OAuth application scopes could not be determined automatically: this "
                "provider's credentials do not grant access to Oracle IDCS, the only "
                "source of registered OAuth app scopes. Review OAuth Confidential "
                "Application scopes manually, or connect this provider with OAuth2/IDCS "
                "credentials to enable automated evaluation."
            )
            return [report]

        for app in service.excessive_scope_apps:
            excessive = HIGH_RISK_SCOPES.intersection(set(app.scopes))
            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=app,
                resource_name=app.name,
                resource_id=app.id,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "FAIL"
            report.status_extended = (
                f"OAuth Confidential App '{app.name}' (ID: {app.id}) holds high-risk scope(s): "
                f"{', '.join(excessive)}. Replace with least-privilege specific scopes."
            )
            findings.append(report)

        if not findings:
            class _TenantResource(BaseModel):
                id: str
                name: str
                display_name: str

            res = _TenantResource(
                id=tenant_id,
                name="OAuth Applications",
                display_name="All Oracle IDCS OAuth Apps"
            )

            report = CheckReportOracleSaas(
                metadata=self.metadata(),
                resource=res,
                tenant_id=tenant_id,
                erp_type=erp_type,
            )
            report.status = "PASS"
            report.status_extended = "No Oracle IDCS OAuth Confidential Applications with excessive permission scopes detected."
            findings.append(report)

        return findings
