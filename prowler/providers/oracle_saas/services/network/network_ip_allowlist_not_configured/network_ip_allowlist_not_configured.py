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

        if not service.network_policy_available:
            report.status = "MANUAL"
            report.status_extended = (
                "Network perimeter configuration could not be determined automatically: "
                "this provider's credentials do not grant access to Oracle IDCS, the only "
                "source of this setting. Verify network perimeter configuration manually "
                "in Identity & Security > Network Perimeters, or connect this provider "
                "with OAuth2/IDCS credentials to enable automated evaluation."
            )
        elif service.network_policy and service.network_policy.ip_allowlist_enabled:
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
