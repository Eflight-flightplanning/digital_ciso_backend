"""
Prowler Adapter — Implementation

THIS IS THE ONLY FILE IN THE ENTIRE PLATFORM THAT IMPORTS FROM prowler.*

All other platform code uses the ProwlerAdapter protocol from adapter.py.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Callable
from uuid import uuid4

from .adapter import (
    FindingStatus,
    NormalizedFinding,
    ProwlerAdapter,
    ScanResult,
    ScanStatus,
    Severity,
)
from .exceptions import (
    ProwlerAdapterError,
    ProwlerConnectionError,
    ProwlerScanError,
)
from .provider_factory import build_prowler_provider

logger = logging.getLogger(__name__)


class ProwlerAdapterImpl:
    """
    Concrete implementation of ProwlerAdapter.
    Maps Prowler's internal models to your NormalizedFinding.
    """

    # ── Provider connection test ──────────────────────────────────────────────

    def test_provider_connection(
        self,
        provider_type: str,
        credentials: dict,
        account_id: str,
    ) -> tuple[bool, str]:
        try:
            prowler_provider = build_prowler_provider(provider_type, credentials, account_id)
            # Access any attribute to force credential validation
            _ = prowler_provider.identity
            return True, ""
        except Exception as exc:
            logger.warning("Provider connection test failed: %s", exc)
            return False, str(exc)

    # ── Scan execution ────────────────────────────────────────────────────────

    def execute_scan_sync(
        self,
        scan_id: str,
        provider_type: str,
        credentials: dict,
        account_id: str,
        on_finding: Callable[[list[NormalizedFinding]], None],
        on_progress: Callable[[float], None],
        checks: list[str] | None = None,
        services: list[str] | None = None,
        severities: list[str] | None = None,
        compliance_frameworks: list[str] | None = None,
    ) -> ScanResult:
        # ── Only import here — never at module level ──────────────────────────
        from prowler.lib.scan.scan import Scan as ProwlerScan

        result = ScanResult(
            scan_id=scan_id,
            status=ScanStatus.RUNNING,
            started_at=datetime.utcnow(),
        )

        try:
            prowler_provider = build_prowler_provider(provider_type, credentials, account_id)

            scan = ProwlerScan(
                provider=prowler_provider,
                checks=checks,
                services=services,
                severities=severities,
                compliances=compliance_frameworks,
            )

            findings_by_severity: dict[str, int] = {}
            total = 0

            for progress, raw_findings in scan.scan():
                on_progress(progress)

                if not raw_findings:
                    continue

                normalized_batch: list[NormalizedFinding] = []
                for f in raw_findings:
                    try:
                        nf = self._normalize(f, scan_id, provider_type)
                        normalized_batch.append(nf)
                        sev = nf.severity.value
                        findings_by_severity[sev] = findings_by_severity.get(sev, 0) + 1
                        total += 1
                    except Exception as exc:
                        logger.warning("Failed to normalize finding %s: %s", getattr(f, "uid", "?"), exc)

                if normalized_batch:
                    on_finding(normalized_batch)

            result.status = ScanStatus.COMPLETED
            result.progress = 100.0
            result.total_findings = total
            result.findings_by_severity = findings_by_severity
            result.completed_at = datetime.utcnow()

        except Exception as exc:
            logger.error("Scan %s failed: %s", scan_id, exc, exc_info=True)
            result.status = ScanStatus.FAILED
            result.error = str(exc)
            result.completed_at = datetime.utcnow()

        return result

    # ── Check / compliance discovery ──────────────────────────────────────────

    def list_available_checks(self, provider_type: str) -> list[dict]:
        from prowler.lib.check.utils import recover_checks_from_provider
        try:
            checks = recover_checks_from_provider(provider_type)
            result = []
            for check_id in checks:
                try:
                    from prowler.lib.check.utils import load_check_metadata
                    meta = load_check_metadata(check_id)
                    # Include compliance framework mappings so the UI can filter checks by framework
                    compliance_raw = getattr(meta, "Compliance", []) or []
                    compliance_map: dict[str, list[str]] = {}
                    for c in compliance_raw:
                        fw = getattr(c, "Framework", None) or c.get("Framework", "") if isinstance(c, dict) else getattr(c, "Framework", "")
                        version = getattr(c, "Version", "") if not isinstance(c, dict) else c.get("Version", "")
                        req_ids = getattr(c, "Requirements", []) if not isinstance(c, dict) else c.get("Requirements", [])
                        if fw:
                            key = f"{fw}_{version}".lower().replace(" ", "_") if version else fw.lower().replace(" ", "_")
                            compliance_map[key] = [str(r) for r in req_ids]
                    result.append({
                        "check_id": check_id,
                        "title": getattr(meta, "CheckTitle", check_id),
                        "description": getattr(meta, "Description", ""),
                        "severity": getattr(meta, "Severity", "medium"),
                        "services": getattr(meta, "RelatedUrl", []),
                        "categories": getattr(meta, "Categories", []),
                        "compliance": compliance_map,
                    })
                except Exception:
                    result.append({"check_id": check_id, "title": check_id})
            return result
        except Exception as exc:
            logger.warning("list_available_checks failed for %s: %s", provider_type, exc)
            return []

    def list_compliance_frameworks(self, provider_type: str) -> list[str]:
        """Return list of compliance framework IDs available for a provider.

        Uses Prowler SDK's get_bulk_compliance_frameworks_universal() as the
        primary source (same approach as D:\\prwler\\api\\src\\backend\\api\\compliance.py).
        Falls back to UTF-8 rglob for any files the SDK couldn't parse.
        """
        try:
            from prowler.lib.check.compliance_models import get_bulk_compliance_frameworks_universal
            sdk_ids = set(get_bulk_compliance_frameworks_universal(provider_type).keys())
        except Exception as exc:
            logger.warning("SDK list_compliance_frameworks failed for %s: %s", provider_type, exc)
            sdk_ids = set()

        # JSON fallback: pick up any files SDK skipped due to encoding issues
        try:
            from pathlib import Path
            here = Path(__file__).resolve()
            comp_dir: Path | None = None
            for steps in range(2, 6):
                candidate = here.parents[steps] / "prowler" / "compliance"
                if candidate.exists():
                    comp_dir = candidate
                    break
            if comp_dir is None:
                comp_dir = Path("D:/security_platform/prowler/compliance")

            json_ids: set[str] = set()
            if comp_dir.exists():
                for f in comp_dir.rglob("*.json"):
                    if (
                        provider_type.lower() in f.stem.lower()
                        or f.parent.name.lower() == provider_type.lower()
                    ):
                        json_ids.add(f.stem)
        except Exception as exc:
            logger.warning("JSON fallback list_compliance_frameworks failed: %s", exc)
            json_ids = set()

        return sorted(sdk_ids | json_ids)

    def list_supported_providers(self) -> list[str]:
        return [
            "aws", "azure", "gcp", "kubernetes", "github",
            "m365", "googleworkspace", "mongodbatlas", "cloudflare",
            "okta", "vercel", "oraclecloud", "openstack", "iac", "image",
        ]

    def get_prowler_version(self) -> str:
        try:
            from prowler.config.config import prowler_version
            return prowler_version
        except Exception:
            return "unknown"

    # ── Internal normalization ────────────────────────────────────────────────

    def _normalize(self, f, scan_id: str, provider_type: str) -> NormalizedFinding:
        """Map a Prowler Finding Pydantic model to NormalizedFinding."""
        meta = f.metadata

        # Status
        raw_status = str(f.status.value) if hasattr(f.status, "value") else str(f.status)
        try:
            status = FindingStatus(raw_status)
        except ValueError:
            status = FindingStatus.MANUAL

        # Severity
        raw_sev = str(meta.Severity.value).lower() if hasattr(meta.Severity, "value") else "medium"
        try:
            severity = Severity(raw_sev)
        except ValueError:
            severity = Severity.MEDIUM

        # Remediation
        remediation = getattr(meta, "Remediation", None)
        if remediation:
            rec = getattr(remediation, "Recommendation", None)
            remediation_text = getattr(rec, "Text", "") if rec else ""
            remediation_url = getattr(rec, "Url", "") if rec else ""
        else:
            remediation_text = ""
            remediation_url = ""

        return NormalizedFinding(
            prowler_uid=str(f.uid),
            scan_id=scan_id,
            provider_type=provider_type,
            account_id=str(f.account_uid),
            region=str(f.region or "global"),
            resource_id=str(f.resource_uid or ""),
            resource_name=str(f.resource_name or ""),
            resource_type=str(getattr(meta, "ResourceType", "")),
            resource_tags=dict(f.resource_tags or {}),
            service=str(getattr(meta, "ServiceName", "")),
            check_id=str(getattr(meta, "CheckID", "")),
            check_title=str(getattr(meta, "CheckTitle", "")),
            description=str(getattr(meta, "Description", "")),
            status=status,
            status_extended=str(f.status_extended or ""),
            severity=severity,
            compliance=dict(f.compliance or {}),
            remediation_text=remediation_text,
            remediation_url=remediation_url,
            raw_evidence=dict(f.raw or {}),
            prowler_version=str(getattr(f, "prowler_version", "")),
            first_seen_at=datetime.utcnow(),
        )


# ── Singleton ──────────────────────────────────────────────────────────────────

prowler_adapter: ProwlerAdapter = ProwlerAdapterImpl()
