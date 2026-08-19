from pydantic import BaseModel
from prowler.lib.check.models import Check, CheckReportOracleSaas
from prowler.providers.oracle_saas.services.network import ErpNetworkService
from prowler.providers.common.provider import Provider


class network_ip_allowlist_not_configured(Check):
    def execute(self) -> list[CheckReportOracleSaas]:
        findings: list[CheckReportOracleSaas] = []
        provider = Provider.get_global_provider()
        service = ErpNetworkService(provider)
        tenant_id = provider.identity.tenant_id
        erp_type = provider.session.erp_type

        class _NetworkResource(BaseModel):
            id: str
            name: str
            display_name: str

        res = _NetworkResource(
            id=f"{tenant_id}/network-perimeter",
            name="Network Perimeter",
            display_name="Oracle Identity Domain Network Perimeter"
        )

        report = CheckReportOracleSaas(
            metadata=self.metadata(),
            resource=res,
            tenant_id=tenant_id,
            erp_type=erp_type,
        )

        if service.network_policy and service.network_policy.ip_allowlist_enabled:
            report.status = "PASS"
            report.status_extended = (
                f"Oracle Identity Domain network perimeter is active. "
                f"Allowed IP ranges: {len(service.network_policy.allowed_ips)} configured."
            )
        else:
            report.status = "FAIL"
            report.status_extended = (
                "Oracle Identity Domain has NO IP allowlist (network perimeter) configured. "
                "Oracle Fusion ERP is accessible from any public internet IP address. "
                "Configure a network perimeter in Oracle IDCS to restrict access to trusted corporate egress IPs."
            )

        findings.append(report)
        return findings
