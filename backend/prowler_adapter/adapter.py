"""
Prowler Adapter — Public Contract

This module defines the interface between your platform and Prowler.
Only prowler_adapter/_impl.py may import from prowler.*.
All platform code imports from this module only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Protocol


# ─── Enums ───────────────────────────────────────────────────────────────────

class ScanStatus(str, Enum):
    QUEUED    = "queued"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class FindingStatus(str, Enum):
    PASS   = "PASS"
    FAIL   = "FAIL"
    MANUAL = "MANUAL"


class Severity(str, Enum):
    CRITICAL      = "critical"
    HIGH          = "high"
    MEDIUM        = "medium"
    LOW           = "low"
    INFORMATIONAL = "informational"


# ─── Canonical Finding Model ──────────────────────────────────────────────────

@dataclass
class NormalizedFinding:
    """
    Your platform's canonical finding model.
    Prowler-agnostic — the adapter maps Prowler output to this.
    All services and workers use this model, never Prowler's Finding directly.
    """
    # Identity
    prowler_uid: str           # f.uid — unique fingerprint from Prowler
    scan_id: str               # your scan UUID
    provider_type: str         # "aws" | "azure" | "gcp" | "kubernetes" | ...

    # Cloud resource
    account_id: str            # cloud account / project / subscription ID
    region: str                # e.g. "us-east-1" or "global"
    resource_id: str           # f.resource_uid
    resource_name: str         # f.resource_name
    resource_type: str         # f.metadata.ResourceType
    resource_tags: dict        # f.resource_tags

    # Service / check
    service: str               # f.metadata.ServiceName
    check_id: str              # f.metadata.CheckID
    check_title: str           # f.metadata.CheckTitle
    description: str           # f.metadata.Description

    # Result
    status: FindingStatus      # PASS / FAIL / MANUAL
    status_extended: str       # human-readable result sentence
    severity: Severity

    # Compliance
    compliance: dict = field(default_factory=dict)  # {framework: [req_ids]}

    # Remediation
    remediation_text: str = ""
    remediation_url: str = ""

    # Raw evidence (used later by AI Tier 2/3)
    raw_evidence: dict = field(default_factory=dict)

    # Metadata
    prowler_version: str = ""
    first_seen_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Scan Result ─────────────────────────────────────────────────────────────

@dataclass
class ScanResult:
    scan_id: str
    status: ScanStatus
    progress: float = 0.0          # 0.0 – 100.0
    total_findings: int = 0
    findings_by_severity: dict = field(default_factory=dict)
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


# ─── Adapter Protocol ─────────────────────────────────────────────────────────

class ProwlerAdapter(Protocol):
    """
    The only interface platform code uses to interact with Prowler.
    Implemented in prowler_adapter/_impl.py.
    """

    def test_provider_connection(
        self,
        provider_type: str,
        credentials: dict,
        account_id: str,
    ) -> tuple[bool, str]:
        """
        Test that the given credentials can connect to the cloud provider.
        Returns (success: bool, error_message: str).
        Never raises — all exceptions are caught and returned as (False, msg).
        """
        ...

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
        """
        Run a scan synchronously (call from inside a Celery worker).
        Calls on_finding(batch) and on_progress(pct) as the scan runs.
        Returns ScanResult with final status.
        """
        ...

    def list_available_checks(
        self,
        provider_type: str,
    ) -> list[dict]:
        """
        Return all checks available for a provider.
        Each dict: { check_id, title, description, severity, services, categories }
        """
        ...

    def list_compliance_frameworks(
        self,
        provider_type: str,
    ) -> list[str]:
        """Return list of compliance framework IDs for a provider."""
        ...

    def list_supported_providers(self) -> list[str]:
        """Return list of supported provider type strings."""
        ...

    def get_prowler_version(self) -> str:
        """Return the installed prowler package version string."""
        ...
