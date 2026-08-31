"""
Oracle SaaS Network / Access Control Service
=============================================
Checks Oracle Identity Domain (IDCS) network access restrictions:
  - IP Allowlist configuration
  - Session timeout policies
  - OAuth Application scope validation

Checks implemented:
  - erp_network_ip_allowlist_configured
  - erp_oauth_app_excessive_scopes
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel

from prowler.lib.logger import logger
from prowler.providers.oracle_saas.oracle_saas_provider import OracleSaasProvider

# The scopes that OAuth integrations MUST NOT be granted without explicit review
HIGH_RISK_SCOPES = {
    "urn:opc:idm:__myscopes__",       # All scopes — too broad
    "urn:opc:idm:t.role.Administrator",  # Full admin
    "urn:opc:resource.adminapp.write",
}


class NetworkPolicy(BaseModel):
    ip_allowlist_enabled: bool = False
    allowed_ips: list[str] = []
    session_timeout_minutes: Optional[int] = None


class OAuthApp(BaseModel):
    id: str
    name: str
    scopes: list[str] = []
    active: bool = True


class ErpNetworkService:
    """
    Oracle Fusion ERP Network Access Control Service.

    Fetches network policies and OAuth app registrations from Oracle IDCS.
    """

    def __init__(self, provider: OracleSaasProvider):
        self.provider = provider
        self.region = "global"
        self.tenant_id = provider.identity.tenant_id

        self.network_policy: Optional[NetworkPolicy] = None
        self.oauth_apps: list[OAuthApp] = []
        # These IDCS-only endpoints are unreachable for a provider that only holds
        # Fusion ERP Basic Auth credentials — track whether the call actually
        # succeeded so the checks can report "cannot determine" rather than
        # treating a failed/empty call as "no perimeter configured" (false FAIL)
        # or "no risky OAuth apps" (false PASS — the more dangerous direction).
        self.network_policy_available = False
        self.oauth_apps_available = False

        self._load_network_policy()
        self._load_oauth_apps()

    def _load_network_policy(self) -> None:
        """Fetch IDCS network access policies."""
        url = self.provider.get_idcs_url("admin/v1/NetworkPerimeters")
        data, ok = self.provider.get_json_with_status(url)
        self.network_policy_available = ok
        resources = data.get("Resources", [])
        if not resources:
            self.network_policy = NetworkPolicy(ip_allowlist_enabled=False)
            return

        perimeter = resources[0]
        ips = [ip.get("value", "") for ip in perimeter.get("IPAddresses", [])]
        self.network_policy = NetworkPolicy(
            ip_allowlist_enabled=perimeter.get("active", False) and bool(ips),
            allowed_ips=ips,
        )

    def _load_oauth_apps(self) -> None:
        """Fetch OAuth Confidential Application registrations from IDCS."""
        url = self.provider.get_idcs_url(
            "admin/v1/Apps?filter=isOAuthClient eq true&attributes=displayName,allowedScopes,active"
        )
        data, ok = self.provider.get_json_with_status(url)
        self.oauth_apps_available = ok
        for app in data.get("Resources", []):
            scopes = [s.get("value", "") for s in app.get("allowedScopes", [])]
            self.oauth_apps.append(OAuthApp(
                id=app.get("id", ""),
                name=app.get("displayName", ""),
                scopes=scopes,
                active=app.get("active", True),
            ))

    @property
    def excessive_scope_apps(self) -> list[OAuthApp]:
        """Return OAuth apps with high-risk overpermissive scopes."""
        return [
            app for app in self.oauth_apps
            if app.active and HIGH_RISK_SCOPES.intersection(set(app.scopes))
        ]
