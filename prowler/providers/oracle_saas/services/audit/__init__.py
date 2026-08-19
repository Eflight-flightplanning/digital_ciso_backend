"""
Oracle SaaS Audit Trail Service
================================
Checks Oracle Fusion ERP audit trail configuration and tamper-proofing status
via the ERP Audit History REST API and the IDCS Audit Events endpoint.

Checks implemented:
  - erp_audit_trail_enabled
  - erp_audit_trail_covers_sensitive_objects
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel

from prowler.lib.logger import logger
from prowler.providers.oracle_saas.oracle_saas_provider import OracleSaasProvider

# Sensitive Oracle Fusion ERP business objects that must be in audit scope
REQUIRED_AUDIT_OBJECTS = {
    "Users",
    "Roles",
    "ApplicationRoleMembers",
    "JournalEntries",
    "Payments",
    "PurchaseOrders",
    "SecurityPolicy",
}


class AuditTrailConfig(BaseModel):
    """Oracle Fusion ERP Audit Trail Configuration."""
    enabled: bool = False
    audited_objects: list[str] = []
    tamper_proof: bool = False
    retention_days: Optional[int] = None


class ErpAuditService:
    """
    Oracle Fusion ERP Audit Trail Service.

    Uses Oracle Fusion ERP Audit History REST API:
      GET /fscmRestApi/resources/11.13.18.05/auditHistories
    and Oracle IDCS audit event API:
      GET /admin/v1/AuditEvents
    """

    def __init__(self, provider: OracleSaasProvider):
        self.provider = provider
        self.region = "global"
        self.tenant_id = provider.identity.tenant_id

        self.audit_config: Optional[AuditTrailConfig] = None
        self._load_audit_config()

    def _load_audit_config(self) -> None:
        """Fetch audit trail configuration from Oracle Fusion ERP."""
        url = self.provider.get_erp_url(
            "fscmRestApi/resources/11.13.18.05/auditPolicies"
        )
        data = self.provider.get_json(url)

        if not data:
            logger.warning(
                "Oracle SaaS Audit: Could not fetch audit policies from ERP API. "
                "Check ERP Base URL and OAuth scopes."
            )
            self.audit_config = AuditTrailConfig(enabled=False)
            return

        items = data.get("items", data.get("Resources", []))
        if not items:
            self.audit_config = AuditTrailConfig(enabled=False)
            return

        policy = items[0]
        audited_objects = [
            obj.get("BusinessObjectName", "")
            for obj in policy.get("AuditedObjects", [])
        ]

        self.audit_config = AuditTrailConfig(
            enabled=policy.get("AuditEnabled", False),
            audited_objects=audited_objects,
            tamper_proof=policy.get("TamperProofEnabled", False),
            retention_days=policy.get("RetentionDays"),
        )

    @property
    def missing_audit_objects(self) -> set[str]:
        """Return required objects not present in the current audit scope."""
        if not self.audit_config or not self.audit_config.enabled:
            return REQUIRED_AUDIT_OBJECTS
        covered = set(self.audit_config.audited_objects)
        return REQUIRED_AUDIT_OBJECTS - covered
