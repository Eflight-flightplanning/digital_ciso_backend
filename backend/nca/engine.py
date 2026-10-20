"""Read-only NCA assessment engine for Oracle Cloud Infrastructure.

Flow: build the OCI provider from the existing OCI config -> discover tenancy / regions /
compartments -> execute every check mapped by the selected NCA frameworks (Prowler OCI checks
and platform-native checks) -> aggregate to check runs, control results and coverage.

Nothing in this module mutates OCI. The only importer of ``prowler.*`` for the assessment
path is this module (plus native_checks lazily importing Prowler service clients), mirroring
the project's prowler_adapter rule.
"""
from __future__ import annotations

import importlib
import json
import logging
import os
import threading
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .aggregate import (
    ERROR, FAIL, MANUAL, NA, PASS, R_API_ERROR, R_NOT_EXECUTED, R_UNSUPPORTED, aggregate_check,
)
from .catalog import FRAMEWORK_FILES, all_check_ids, load_framework
from .native_checks import NATIVE_CHECKS, NativeContext, classify_text

ENGINE_VERSION = "nca-oci-1.0"
logger = logging.getLogger("nca.engine")

_RUN_LOCK = threading.Lock()  # Prowler service clients are process-global singletons: one run at a time
_SENSITIVE = ("secret", "password", "token", "key_content", "private", "passphrase")


# --------------------------------------------------------------------------- data classes

@dataclass
class FindingOut:
    status: str
    resource_id: str = ""
    resource_name: str = ""
    resource_type: str = ""
    region: str = ""
    compartment_id: str = ""
    status_extended: str = ""
    evidence: dict = field(default_factory=dict)


@dataclass
class CheckOutcome:
    check_id: str
    source: str  # prowler | native
    service: str
    title: str = ""
    severity: str = "medium"
    status: str = ERROR
    reason: str = ""
    message: str = ""
    findings: list[FindingOut] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    remediation_text: str = ""
    remediation_cli: str = ""
    remediation_manual: str = ""
    duration_ms: int = 0

    @property
    def counts(self) -> dict:
        c = {PASS: 0, FAIL: 0, MANUAL: 0}
        for f in self.findings:
            c[f.status] = c.get(f.status, 0) + 1
        return c


# --------------------------------------------------------------------------- error capture

class ErrorCapture(logging.Handler):
    """Collect ERROR log records emitted by Prowler's OCI service loaders.

    Prowler services catch API exceptions and only log them, which would make a permission
    error look like "no resources". Capturing them lets us report ERROR instead.
    """

    def __init__(self):
        super().__init__(level=logging.ERROR)
        self.current = "?"
        self.by_service: dict[str, list[dict]] = {}
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return
        with self._lock:
            self.by_service.setdefault(self.current, []).append(
                {"kind": classify_text(msg), "message": msg[:600], "logger": record.name})

    def errors_for(self, *services: str) -> list[dict]:
        with self._lock:
            return [e for s in services for e in self.by_service.get(s, [])]


# --------------------------------------------------------------------------- helpers

def _json_safe(obj, limit: int = 4000) -> dict:
    try:
        data = obj.model_dump() if hasattr(obj, "model_dump") else (obj.dict() if hasattr(obj, "dict") else dict(obj))
    except Exception:  # noqa: BLE001
        return {}
    data = {k: v for k, v in data.items() if not any(s in k.lower() for s in _SENSITIVE)}
    text = json.dumps(data, default=str)
    return json.loads(text) if len(text) <= limit else {"_truncated": True, "id": data.get("id"), "name": data.get("name")}


def _enum_val(x, default: str = "") -> str:
    if x is None:
        return default
    return str(getattr(x, "value", x)).lower()


class OciCredentialsMissing(Exception):
    pass


def _oci_config_path(config_file: str | None) -> str:
    return os.path.expanduser(config_file or os.getenv("NCA_OCI_CONFIG_FILE") or "~/.oci/config")


def _credentials_of(prov, ProviderSecret, MainRouter) -> tuple[dict | None, str]:
    sec = ProviderSecret.all_objects.using(MainRouter.admin_db).filter(provider_id=prov.id).first()
    if sec is None:
        return None, "the registered OCI provider has no stored credentials"
    try:
        data = sec.secret
    except Exception:  # noqa: BLE001 - cryptography.fernet.InvalidToken and friends
        return None, ("the stored OCI credentials cannot be decrypted (the secrets encryption key differs from the one "
                      "they were saved with); re-save the OCI provider credentials in Cloud Providers")
    kw = {
        "tenancy": data.get("tenancy_ocid") or data.get("tenancy") or prov.uid,
        "user": data.get("user_ocid") or data.get("user"),
        "fingerprint": data.get("fingerprint"),
        "key_content": data.get("private_key") or data.get("key_content"),
        "pass_phrase": data.get("pass_phrase") or data.get("passphrase"),
        "bootstrap_region": (data.get("region") or "").strip() if isinstance(data.get("region"), str) else None,
    }
    kw = {k: v for k, v in kw.items() if v}
    missing = sorted({"tenancy", "user", "fingerprint", "key_content"} - kw.keys())
    if missing:
        return None, f"the stored OCI credentials lack: {', '.join(missing)}"
    return kw, ""


def platform_oci_credentials(tenant_id=None, provider_id=None) -> tuple[dict | None, str]:
    """Credentials of the OCI provider registered in the platform (the same encrypted secret the platform scans use).
    With several candidate providers the most recently updated one whose credentials are usable is chosen, unless
    provider_id names one explicitly. Returns (kwargs, "") or (None, reason)."""
    try:
        from api.db_router import MainRouter
        from api.models import Provider, ProviderSecret

        qs = Provider.all_objects.using(MainRouter.admin_db).filter(provider="oraclecloud", is_deleted=False)
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        if provider_id:
            qs = qs.filter(id=provider_id)
        providers = list(qs.order_by("-updated_at")[:10])
        if not providers:
            return None, "no OCI provider is registered in the platform"
        reasons = []
        for prov in providers:
            kw, reason = _credentials_of(prov, ProviderSecret, MainRouter)
            if kw is not None:
                if len(providers) > 1:
                    logger.info("Several OCI providers registered; using the most recently updated usable one (%s)", prov.alias)
                return kw, ""
            reasons.append(f"{prov.alias or prov.uid}: {reason}")
        return None, "; ".join(reasons)
    except Exception as exc:  # noqa: BLE001
        return None, f"platform credentials unavailable ({exc.__class__.__name__})"


def build_provider(profile: str | None = None, config_file: str | None = None, regions: list[str] | None = None,
                   tenant_id=None, provider_id=None):
    """Create the Prowler OCI provider (API-key auth only; nothing is ever written to OCI).

    Credential order:
      1. an explicitly requested config file (CLI --config-file),
      2. the OCI provider registered in the platform for the tenant (the encrypted secret in the database),
      3. a standard OCI config file (NCA_OCI_CONFIG_FILE or ~/.oci/config), as a fallback for development machines.
    """
    from prowler.providers.oraclecloud.oraclecloud_provider import OraclecloudProvider

    def from_file(path):
        return OraclecloudProvider(oci_config_file=path, profile=profile or os.getenv("NCA_OCI_PROFILE") or "DEFAULT",
                                   region=regions or None)

    if config_file:
        return from_file(_oci_config_path(config_file))
    kw, reason = platform_oci_credentials(tenant_id, provider_id)
    if kw is not None:
        logger.info("Using the OCI provider registered in the platform")
        kw = dict(kw)
        # With direct credentials Prowler opens its session in a bootstrap region that defaults to us-ashburn-1. A tenancy
        # that is not subscribed there answers 401 NotAuthenticated, so use the region stored with the provider as the
        # session region. This does not restrict the audit: every subscribed region is still assessed.
        bootstrap = kw.pop("bootstrap_region", None)
        previous = OraclecloudProvider._bootstrap_region
        if bootstrap:
            OraclecloudProvider._bootstrap_region = bootstrap
        try:
            return OraclecloudProvider(region=regions or None, **kw)
        finally:
            OraclecloudProvider._bootstrap_region = previous
    path = _oci_config_path(None)
    if os.path.isfile(path):
        logger.warning("Platform OCI credentials not used (%s); falling back to OCI config file %s", reason, path)
        return from_file(path)
    raise OciCredentialsMissing(
        f"No OCI credentials: the platform OCI provider cannot be used ({reason}) and there is no OCI config file at "
        f"'{path}'. Register or re-save the OCI provider credentials in Cloud Providers (or set NCA_OCI_CONFIG_FILE).")


def discover(provider) -> dict:
    ident = provider.identity
    return {
        "tenancy_id": ident.tenancy_id,
        "tenancy_name": ident.tenancy_name,
        "home_region": provider.home_region,
        "regions": [r.key for r in provider.regions],
        "compartment_count": len(provider.compartments),
        "compartments": [{"id": c.id, "name": getattr(c, "name", "")} for c in provider.compartments],
    }


def tenant_for_tenancy(tenancy_ocid: str):
    """Platform tenant that registered this OCI tenancy as a provider (None if not exactly one)."""
    try:
        from api.models import Provider

        from api.db_router import MainRouter

        ids = set(Provider.all_objects.using(MainRouter.admin_db).filter(provider="oraclecloud", uid=tenancy_ocid)
                  .values_list("tenant_id", flat=True))
        return ids.pop() if len(ids) == 1 else None
    except Exception:  # noqa: BLE001 - platform models unavailable (e.g. isolated tests)
        return None


def _unsupported(check_id: str, service: str, msg: str) -> CheckOutcome:
    return CheckOutcome(check_id=check_id, source="prowler", service=service, status=ERROR,
                        reason=R_UNSUPPORTED, message=msg)


def run_prowler_check(check_id: str, capture: ErrorCapture) -> CheckOutcome:
    service = check_id.split("_")[0]
    t0 = time.time()
    capture.current = service
    try:
        mod = importlib.import_module(f"prowler.providers.oraclecloud.services.{service}.{check_id}.{check_id}")
        check = getattr(mod, check_id)()
    except ModuleNotFoundError:
        return _unsupported(check_id, service, f"Check '{check_id}' does not exist in the installed Prowler OCI provider.")
    except Exception as exc:  # noqa: BLE001
        return CheckOutcome(check_id=check_id, source="prowler", service=service, status=ERROR, reason=R_API_ERROR,
                            message=f"Check could not be loaded: {exc.__class__.__name__}: {exc}",
                            errors=[{"kind": R_API_ERROR, "message": traceback.format_exc()[-500:]}])

    rem = getattr(check, "Remediation", None)
    out = CheckOutcome(
        check_id=check_id, source="prowler", service=getattr(check, "ServiceName", service),
        title=str(getattr(check, "CheckTitle", check_id)), severity=_enum_val(getattr(check, "Severity", None), "medium"),
        remediation_text=getattr(getattr(rem, "Recommendation", None), "Text", "") or "",
        remediation_cli=getattr(getattr(rem, "Code", None), "CLI", "") or "",
        remediation_manual=getattr(getattr(rem, "Code", None), "Other", "") or "",
    )
    try:
        reports = check.execute() or []
    except Exception as exc:  # noqa: BLE001
        out.status, out.reason = ERROR, R_API_ERROR
        out.message = f"Check execution raised {exc.__class__.__name__}: {exc}"
        out.errors = [{"kind": R_API_ERROR, "message": out.message[:500]}]
        out.duration_ms = int((time.time() - t0) * 1000)
        return out

    for r in reports:
        st = str(getattr(r, "status", "MANUAL")).upper()
        st = st if st in (PASS, FAIL, MANUAL) else MANUAL
        out.findings.append(FindingOut(
            status=st, resource_id=str(getattr(r, "resource_id", "") or ""),
            resource_name=str(getattr(r, "resource_name", "") or ""),
            resource_type=str(getattr(check, "ResourceType", "") or ""),
            region=str(getattr(r, "region", "") or ""),
            compartment_id=str(getattr(r, "compartment_id", "") or ""),
            status_extended=str(getattr(r, "status_extended", "") or ""),
            evidence=_json_safe(getattr(r, "resource", None)) if getattr(r, "resource", None) is not None else {},
        ))
    out.errors = capture.errors_for(service)
    out.duration_ms = int((time.time() - t0) * 1000)
    return _finish(out)


def run_native_check(check_id: str, provider, capture: ErrorCapture) -> CheckOutcome:
    spec = NATIVE_CHECKS.get(check_id)
    if spec is None:
        return _unsupported(check_id, check_id.split("_")[0], f"No implementation for check '{check_id}'.")
    t0 = time.time()
    ctx = NativeContext(provider)
    out = CheckOutcome(
        check_id=check_id, source="native", service=spec["service"], title=spec["title"], severity=spec["severity"],
        remediation_text=spec["remediation_text"], remediation_cli=spec["remediation_cli"],
    )
    try:
        for svc in spec.get("uses_clients", []):
            capture.current = svc
        results = spec["fn"](ctx)
        out.findings = [FindingOut(**{**r, "evidence": r.get("evidence", {})}) for r in results]
        out.errors = ctx.errors + capture.errors_for(*spec.get("uses_clients", []))
    except Exception as exc:  # noqa: BLE001
        out.errors = [{"kind": R_API_ERROR, "message": f"{exc.__class__.__name__}: {exc}"[:500]}]
        out.message = out.errors[0]["message"]
    out.duration_ms = int((time.time() - t0) * 1000)
    return _finish(out)


def _finish(out: CheckOutcome) -> CheckOutcome:
    out.status, out.reason = aggregate_check([f.status for f in out.findings], out.errors)
    if out.status == ERROR and not out.message:
        out.message = ("Data collection was incomplete: " + "; ".join(e["message"] for e in out.errors[:2]))[:900]
    elif out.status == NA:
        out.message = "No resources of the type evaluated by this check exist in the audited scope."
    elif out.status == FAIL and out.errors:
        out.message = f"Failing findings reported; {len(out.errors)} additional collection error(s) occurred."
    return out


def execute_checks(provider, check_ids: list[str], progress=None) -> list[CheckOutcome]:
    """Run each distinct check once (read-only). Pure w.r.t. DB; used by tests with fake providers."""
    capture = ErrorCapture()
    root = logging.getLogger()
    root.addHandler(capture)
    outcomes: list[CheckOutcome] = []
    try:
        for i, cid in enumerate(check_ids, 1):
            if cid in NATIVE_CHECKS:
                outcomes.append(run_native_check(cid, provider, capture))
            else:
                outcomes.append(run_prowler_check(cid, capture))
            logger.info("[%d/%d] %s -> %s", i, len(check_ids), cid, outcomes[-1].status)
            if progress:
                progress(i / len(check_ids) * 100)
    finally:
        root.removeHandler(capture)
    return outcomes


# --------------------------------------------------------------------------- persistence + orchestration

def run_assessment(frameworks: list[str] | None = None, profile: str | None = None, tenant_id=None,
                   triggered_by: str = "cli", assessment=None, config_file: str | None = None, provider_id=None):
    """Run a full read-only assessment and persist it. Returns the NcaAssessment."""
    from django.db import transaction

    from .manual import finalize_controls
    from .models import NcaAssessment, NcaCheckRun, NcaFinding

    frameworks = frameworks or list(FRAMEWORK_FILES)
    for fw in frameworks:
        load_framework(fw)  # validates the key
    if assessment is None:
        assessment = NcaAssessment.objects.create(
            tenant_id=tenant_id, frameworks=frameworks, triggered_by=triggered_by,
            oci_profile=profile or os.getenv("NCA_OCI_PROFILE") or "DEFAULT", engine_version=ENGINE_VERSION)

    with _RUN_LOCK:
        try:
            provider = build_provider(profile, config_file, tenant_id=assessment.tenant_id, provider_id=provider_id)
            disc = discover(provider)
            assessment.tenancy_ocid, assessment.tenancy_name = disc["tenancy_id"], disc["tenancy_name"]
            if assessment.tenant_id is None:
                assessment.tenant_id = tenant_for_tenancy(disc["tenancy_id"])
            assessment.regions, assessment.discovery = disc["regions"], disc
            assessment.save(update_fields=["tenant_id", "tenancy_ocid", "tenancy_name", "regions", "discovery"])

            def _progress(p):
                NcaAssessment.objects.filter(pk=assessment.pk).update(progress=round(p * 0.95, 1))

            outcomes = execute_checks(provider, all_check_ids(frameworks), _progress)

            with transaction.atomic():
                for o in outcomes:
                    run = NcaCheckRun.objects.create(
                        assessment=assessment, check_id=o.check_id, source=o.source, service=o.service,
                        title=o.title, severity=o.severity, status=o.status, reason=o.reason, message=o.message,
                        counts=o.counts, errors=o.errors[:20], remediation_text=o.remediation_text,
                        remediation_cli=o.remediation_cli, remediation_manual=o.remediation_manual,
                        duration_ms=o.duration_ms)
                    NcaFinding.objects.bulk_create([
                        NcaFinding(assessment=assessment, check_run=run, check_id=o.check_id, severity=o.severity,
                                   status=f.status, resource_id=f.resource_id, resource_name=f.resource_name,
                                   resource_type=f.resource_type, region=f.region, compartment_id=f.compartment_id,
                                   status_extended=f.status_extended, evidence=f.evidence)
                        for f in o.findings], batch_size=500)
                finalize_controls(assessment)
            assessment.status = NcaAssessment.Status.COMPLETED
            assessment.progress = 100
        except Exception as exc:  # noqa: BLE001
            logger.exception("NCA assessment failed")
            assessment.status = NcaAssessment.Status.FAILED
            assessment.error = f"{exc.__class__.__name__}: {exc}"[:2000]
        assessment.finished_at = datetime.now(timezone.utc)
        assessment.save()
    return assessment
