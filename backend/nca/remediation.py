"""Gated automated remediation for a small set of safe, well-understood OCI findings.

Safety model (every gate is enforced server-side in ``execute_remediation``):
  1. Remediation only targets a stored FAIL finding (never free-form resource ids).
  2. A dry-run (no OCI writes) must exist first; it records the live "before" state and the plan.
  3. Execution needs: NCA_REMEDIATION_ENABLED=true on the server, an explicit confirmation
     phrase, a written justification, and the live state must still equal the dry-run state
     (no drift).
  4. Before/after state, verification result and actor are persisted; every step is audit-logged.
  5. After applying, the live resource is re-read and the original condition re-verified.
Anything not in REMEDIATORS is manual-only (instructions come from the check metadata).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import oci

from .models import NcaAuditLog, NcaFinding, NcaRemediation

logger = logging.getLogger("nca.remediation")
DRY_RUN_MAX_AGE = timedelta(hours=24)


class RemediationBlocked(Exception):
    pass


def confirmation_phrase(finding: NcaFinding) -> str:
    return f"APPLY {finding.check_id} {finding.resource_id}"


def oci_config(profile: str | None = None, region: str | None = None) -> dict:
    cfg = oci.config.from_file(
        file_location=os.getenv("NCA_OCI_CONFIG_FILE") or oci.config.DEFAULT_LOCATION,
        profile_name=profile or os.getenv("NCA_OCI_PROFILE") or "DEFAULT")
    if region:
        cfg["region"] = region
    oci.config.validate_config(cfg)
    return cfg


class Remediator:
    check_id = ""
    action = ""
    risk = "medium"
    reversible = True
    rollback = ""

    def client(self, finding, profile=None):
        raise NotImplementedError

    def read_state(self, finding, profile=None) -> dict:
        raise NotImplementedError

    def desired(self) -> dict:
        raise NotImplementedError

    def apply(self, finding, profile=None) -> None:
        raise NotImplementedError

    def verify(self, state: dict) -> bool:
        return all(state.get(k) == v for k, v in self.desired().items())


class _Bucket(Remediator):
    field = ""

    def _split(self, finding):
        ns, _, name = finding.resource_id.partition("/")
        if not ns or not name:
            raise RemediationBlocked(f"Cannot parse bucket id '{finding.resource_id}'")
        return ns, name

    def client(self, finding, profile=None):
        return oci.object_storage.ObjectStorageClient(oci_config(profile, finding.region))

    def read_state(self, finding, profile=None) -> dict:
        ns, name = self._split(finding)
        b = self.client(finding, profile).get_bucket(ns, name).data
        return {self.field: getattr(b, self.field, None)}


class BucketVersioning(_Bucket):
    check_id = "objectstorage_bucket_versioning_enabled"
    action = "Enable object versioning on the bucket"
    field = "versioning"
    risk = "low"
    reversible = True
    rollback = "Versioning can be suspended (not disabled) via update-bucket --versioning Suspended; stored versions incur cost."

    def desired(self):
        return {"versioning": "Enabled"}

    def apply(self, finding, profile=None):
        ns, name = self._split(finding)
        self.client(finding, profile).update_bucket(ns, name, oci.object_storage.models.UpdateBucketDetails(versioning="Enabled"))


class BucketPrivate(_Bucket):
    check_id = "objectstorage_bucket_not_publicly_accessible"
    action = "Set bucket public access to NoPublicAccess"
    field = "public_access_type"
    risk = "high"
    reversible = True
    rollback = "Restore the previous public_access_type shown in the before-state with update-bucket --public-access-type."

    def desired(self):
        return {"public_access_type": "NoPublicAccess"}

    def apply(self, finding, profile=None):
        ns, name = self._split(finding)
        self.client(finding, profile).update_bucket(
            ns, name, oci.object_storage.models.UpdateBucketDetails(public_access_type="NoPublicAccess"))


class AuditRetention(Remediator):
    check_id = "audit_log_retention_period_365_days"
    action = "Set tenancy audit log retention to 365 days"
    risk = "low"
    reversible = True
    rollback = "Set retention_period_days back to the before-state value (increases/decreases stored audit data and cost)."

    def _tenancy(self, finding, profile):
        return oci_config(profile)["tenancy"]

    def client(self, finding, profile=None):
        # Audit configuration is a tenancy-level setting served from the home region.
        return oci.audit.AuditClient(oci_config(profile, finding.region or None))

    def read_state(self, finding, profile=None) -> dict:
        t = self._tenancy(finding, profile)
        return {"retention_period_days": self.client(finding, profile).get_configuration(t).data.retention_period_days}

    def desired(self):
        return {"retention_period_days": 365}

    def apply(self, finding, profile=None):
        t = self._tenancy(finding, profile)
        self.client(finding, profile).update_configuration(
            t, oci.audit.models.UpdateConfigurationDetails(retention_period_days=365))


REMEDIATORS: dict[str, Remediator] = {r.check_id: r for r in (BucketVersioning(), BucketPrivate(), AuditRetention())}


def remediation_options(check_id: str) -> dict:
    r = REMEDIATORS.get(check_id)
    if not r:
        return {"automated": False}
    return {"automated": True, "action": r.action, "risk": r.risk, "reversible": r.reversible, "rollback": r.rollback}


def _audit(tenant_id, actor, action, target, details):
    NcaAuditLog.objects.create(tenant_id=tenant_id, actor=actor, action=action, target=target[:500], details=details)


def dry_run(finding: NcaFinding, actor: str, tenant_id=None, profile=None) -> NcaRemediation:
    """Read-only: records live before-state and the intended change. Never writes to OCI."""
    r = REMEDIATORS.get(finding.check_id)
    if r is None:
        raise RemediationBlocked(f"No automated remediation exists for {finding.check_id}; follow the manual instructions.")
    if finding.status != "FAIL":
        raise RemediationBlocked("Only FAIL findings can be remediated.")
    rec = NcaRemediation(tenant_id=tenant_id, assessment=finding.assessment, check_id=finding.check_id,
                         resource_id=finding.resource_id, resource_name=finding.resource_name, region=finding.region,
                         action=r.action, mode="dry_run", requested_by=actor, status=NcaRemediation.Status.PLANNED)
    try:
        before = r.read_state(finding, profile)
    except Exception as exc:  # noqa: BLE001
        rec.status, rec.error = NcaRemediation.Status.FAILED, f"{exc.__class__.__name__}: {exc}"[:1000]
        rec.finished_at = datetime.now(timezone.utc)
        rec.save()
        _audit(tenant_id, actor, "remediation.dry_run.failed", finding.resource_id, {"check": finding.check_id, "error": rec.error})
        return rec
    rec.before = before
    rec.plan = {"changes": {k: {"from": before.get(k), "to": v} for k, v in r.desired().items()},
                "risk": r.risk, "reversible": r.reversible, "rollback": r.rollback,
                "already_compliant": r.verify(before),
                "confirmation_phrase": confirmation_phrase(finding),
                "writes_to_oci": False}
    rec.finished_at = datetime.now(timezone.utc)
    rec.save()
    _audit(tenant_id, actor, "remediation.dry_run", finding.resource_id, {"check": finding.check_id, "plan": rec.plan, "id": str(rec.id)})
    return rec


def execute_remediation(finding: NcaFinding, dry_run_id, actor: str, confirmation: str, reason: str,
                        tenant_id=None, profile=None) -> NcaRemediation:
    r = REMEDIATORS.get(finding.check_id)

    def blocked(msg: str) -> NcaRemediation:
        rec = NcaRemediation.objects.create(
            tenant_id=tenant_id, assessment=finding.assessment, check_id=finding.check_id,
            resource_id=finding.resource_id, resource_name=finding.resource_name, region=finding.region,
            action=r.action if r else "", mode="execute", status=NcaRemediation.Status.BLOCKED,
            requested_by=actor, authorization_reason=reason or "", error=msg, finished_at=datetime.now(timezone.utc))
        _audit(tenant_id, actor, "remediation.blocked", finding.resource_id, {"check": finding.check_id, "why": msg})
        return rec

    if r is None:
        return blocked(f"No automated remediation exists for {finding.check_id}.")
    if os.getenv("NCA_REMEDIATION_ENABLED", "").lower() not in ("1", "true", "yes"):
        return blocked("Remediation execution is disabled on this server (set NCA_REMEDIATION_ENABLED=true to allow it).")
    if finding.status != "FAIL":
        return blocked("Only FAIL findings can be remediated.")
    if not reason or len(reason.strip()) < 10:
        return blocked("A written justification (>= 10 characters) is required.")
    if confirmation != confirmation_phrase(finding):
        return blocked("Confirmation phrase does not match.")
    dr = NcaRemediation.objects.filter(pk=dry_run_id, mode="dry_run", check_id=finding.check_id,
                                       resource_id=finding.resource_id, status=NcaRemediation.Status.PLANNED).first()
    if dr is None or (tenant_id and dr.tenant_id and str(dr.tenant_id) != str(tenant_id)):
        return blocked("A matching successful dry-run is required first.")
    if datetime.now(timezone.utc) - dr.created_at > DRY_RUN_MAX_AGE:
        return blocked("The dry-run is older than 24 hours; run a new dry-run.")

    rec = NcaRemediation.objects.create(
        tenant_id=tenant_id, assessment=finding.assessment, check_id=finding.check_id, resource_id=finding.resource_id,
        resource_name=finding.resource_name, region=finding.region, action=r.action, mode="execute",
        status=NcaRemediation.Status.FAILED, requested_by=actor, authorization_reason=reason, plan=dr.plan, dry_run=dr)
    _audit(tenant_id, actor, "remediation.execute.start", finding.resource_id,
           {"check": finding.check_id, "id": str(rec.id), "dry_run": str(dr.id), "reason": reason})
    try:
        live = r.read_state(finding, profile)
        rec.before = live
        if live != dr.before:
            rec.error = f"Resource changed since dry-run (drift): dry-run={dr.before} live={live}. Nothing was changed."
            rec.status = NcaRemediation.Status.BLOCKED
        else:
            r.apply(finding, profile)
            after = r.read_state(finding, profile)
            rec.after = after
            ok = r.verify(after)
            rec.verification = {"verified": ok, "expected": r.desired(), "observed": after}
            rec.status = NcaRemediation.Status.SUCCEEDED if ok else NcaRemediation.Status.UNVERIFIED
    except Exception as exc:  # noqa: BLE001
        rec.error = f"{exc.__class__.__name__}: {exc}"[:1000]
        rec.status = NcaRemediation.Status.FAILED
    rec.finished_at = datetime.now(timezone.utc)
    rec.save()
    _audit(tenant_id, actor, f"remediation.execute.{rec.status}", finding.resource_id,
           {"check": finding.check_id, "id": str(rec.id), "before": rec.before, "after": rec.after,
            "verification": rec.verification, "error": rec.error})
    return rec
