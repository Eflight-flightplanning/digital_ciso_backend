"""Running assessments and computing what the UI shows (counts, ordering, comparisons). Tenant-scoped."""
import json
import logging
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from django.db import close_old_connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from cis_checks import fusion_roles
from cis_checks.base import ManualCheck
from cis_checks.context import prepare
from cis_checks.registry import load_checks, load_metadata

from . import connections
from .models import OcisIdentity, OcisResult, OcisRun, Status
from .status import AUTOMATED_CHECK_FAILED, REQUIRES_OTHER_ACCESS, normalize_status

log = logging.getLogger(__name__)

SEVERITY_CONFIG = Path(__file__).with_name("severity.json")
SEVERITIES = ("critical", "high", "medium", "low", "informational")
SEVERITY_LABEL = "Assessor-assigned severity (not defined by the CIS benchmark)"
STALE_RUN = timedelta(hours=2)
BENCHMARK = "CIS Oracle SaaS Cloud Applications Benchmark v1.0.0"


@lru_cache(maxsize=1)
def severity_config():
    data = json.loads(SEVERITY_CONFIG.read_text(encoding="utf-8"))
    default = data.get("default", "medium")
    controls = data.get("controls", {})
    for cis_id, sev in list(controls.items()) + [("default", default)]:
        if sev not in SEVERITIES:
            raise ValueError(f"severity.json: '{sev}' for {cis_id} is not one of {', '.join(SEVERITIES)}")
    return default, controls


def severity_for(cis_id):
    default, controls = severity_config()
    return controls.get(cis_id, default)


def catalog():
    """Every control's metadata plus its severity, in CIS order."""
    return [{**m, "Severity": severity_for(m["CisId"])} for m in load_metadata()]


def cis_key(control_id):
    return tuple(int(p) for p in control_id.split("."))


# ---------------------------------------------------------------- running

def start_run(tenant_id, user="", trigger="web"):
    """Create a running run for the tenant. Raises IntegrityError if one is already running."""
    OcisRun.objects.filter(tenant_id=tenant_id, status=OcisRun.RUNNING, started_at__lt=timezone.now() - STALE_RUN).update(
        status=OcisRun.FAILED, finished_at=timezone.now(), error="Marked failed: the run did not finish."
    )
    with transaction.atomic():
        return OcisRun.objects.create(tenant_id=tenant_id, started_by=user, trigger=trigger, tenant_name=connections.tenant_label(tenant_id))


def _store(run, check, raw):
    meta = check.metadata
    status, flags = normalize_status(raw.get("status"))
    if meta["Automation"] == "none":
        flags.append(REQUIRES_OTHER_ACCESS)  # manual control: checked by the assessor
    elif raw.get("not_assessed") and AUTOMATED_CHECK_FAILED not in flags:
        flags.append(AUTOMATED_CHECK_FAILED)  # tested by the tool, but its data source (the Fusion pod) is not available yet
    return OcisResult.objects.create(
        run=run,
        control_id=meta["CisId"],
        check_id=meta["CheckID"],
        title=meta["CheckTitle"],
        level=meta["ProfileLevel"],
        section=meta["Section"],
        section_name=meta["SectionName"],
        severity=raw.get("severity") if raw.get("severity") in SEVERITIES else severity_for(meta["CisId"]),
        automation=meta["Automation"],
        raw_status=str(raw.get("status") or "")[:64],
        status=status,
        flags=flags,
        reason=raw.get("reason") or "",
        checked_at=parse_datetime(raw.get("checked_at") or "") or timezone.now(),
        evidence=raw.get("evidence") or {},
    )


def execute_run(run_id, api=None, fusion=None):
    """Run every check in CIS order with one shared ctx and store each result."""
    run = OcisRun.objects.get(pk=run_id)
    try:
        api = api or connections.idcs_client(run.tenant_id)
        ctx = {"fusion_client": fusion or connections.fusion_client(run.tenant_id)}
        try:
            if api.configured:
                prepare(api, ctx)
        except Exception as exc:  # federation detection is best-effort
            log.warning("Federation detection failed: %s", type(exc).__name__)
            ctx["prepare_error"] = f"{type(exc).__name__}: {exc}"

        for check in load_checks():
            meta = check.metadata
            try:
                raw = ManualCheck.execute(check, api, ctx) if meta["Automation"] == "none" else check.execute(api, ctx)
            except Exception as exc:
                log.warning("Check %s failed: %s", meta["CisId"], type(exc).__name__)
                raw = {
                    "status": "ERROR",
                    "reason": f"Automated check failed: {type(exc).__name__}: {exc}",
                    "evidence": {"error": f"{type(exc).__name__}: {exc}"},
                }
            _store(run, check, raw)

        save_identities(run, ctx)
        run.status = OcisRun.FINISHED
    except Exception as exc:
        log.exception("Oracle CIS run %s failed", run_id)
        run.status = OcisRun.FAILED
        run.error = f"{type(exc).__name__}: {exc}"
    run.finished_at = timezone.now()
    run.counts = effective_counts(run)
    run.save(update_fields=["status", "finished_at", "counts", "error"])
    return run


def save_identities(run, ctx):
    """Store the full dormant, active and ghost-employee lists of this run (the evidence keeps only samples)."""
    guids = {}
    try:
        if ctx.get("fusion_client") is not None and ctx["fusion_client"].configured:
            guids = {(u.get("user") or "").lower(): u.get("guid") for u in fusion_roles.load(ctx)}
    except Exception as exc:  # remediation is unavailable without GUIDs, the lists are still useful
        log.warning("Could not load Fusion user GUIDs: %s", type(exc).__name__)
    rows = []
    for d in ctx.get("dormant_all") or []:
        name = d.get("user") or ""
        rows.append(OcisIdentity(run=run, tenant_id=run.tenant_id, kind=OcisIdentity.DORMANT, control_id="1.14", username=name,
                                 guid=guids.get(name.lower()) or "", details={k: v for k, v in d.items() if k != "user"}))
    for d in ctx.get("active_all") or []:
        name = d.get("user") or ""
        rows.append(OcisIdentity(run=run, tenant_id=run.tenant_id, kind=OcisIdentity.ACTIVE, control_id="1.14", username=name,
                                 guid=guids.get(name.lower()) or "", details={k: v for k, v in d.items() if k != "user"}))
    for g in ctx.get("ghost_all") or []:
        rows.append(OcisIdentity(run=run, tenant_id=run.tenant_id, kind=OcisIdentity.GHOST, control_id="5.3.7", username=g.get("user") or "",
                                 guid=g.get("guid") or "", details={k: v for k, v in g.items() if k not in ("user", "guid")}))
    OcisIdentity.objects.bulk_create(rows, batch_size=500)


def execute_run_in_thread(run_id):
    try:
        execute_run(run_id)
    finally:
        close_old_connections()


# ---------------------------------------------------------------- results as reported

REPORTED_STATUSES = (Status.PASS, Status.FAIL, Status.MANUAL)


def is_manual_control(result):
    return REQUIRES_OTHER_ACCESS in (result.flags or [])


def effective_counts(run):
    counts = {s.value: 0 for s in REPORTED_STATUSES}
    counts["manual_controls"] = 0  # of the MANUAL count: controls checked by the assessor, not by the tool
    counts["not_completed"] = 0  # tested by the tool but could not complete (e.g. no Fusion pod connection), shown as MANUAL
    for r in run.results.all():
        counts[r.status] = counts.get(r.status, 0) + 1
        if is_manual_control(r):
            counts["manual_controls"] += 1
        elif AUTOMATED_CHECK_FAILED in (r.flags or []):
            counts["not_completed"] += 1
    counts["assessed"] = counts[Status.PASS] + counts[Status.FAIL]
    counts["total"] = sum(counts[s.value] for s in REPORTED_STATUSES)
    counts["tested"] = counts["total"] - counts["manual_controls"]  # controls the tool tests
    return counts


def sort_key(result):
    """CIS order: 1.1, 1.2, ... 1.10, ... 5.3.7."""
    return cis_key(result.control_id)


def compare_runs(run_a, run_b):
    a = {r.control_id: r for r in run_a.results.all()}
    b = {r.control_id: r for r in run_b.results.all()}
    changed = []
    for cid in sorted(set(a) | set(b), key=cis_key):
        sa = a[cid].status if cid in a else None
        sb = b[cid].status if cid in b else None
        if sa != sb:
            r = b.get(cid) or a.get(cid)
            changed.append({"control_id": cid, "title": r.title, "severity": r.severity, "a": sa, "b": sb})
    return changed


def identity_summary(run):
    """Figures for the dashboard banners: accounts, dormant, active, ghost employees and IT superusers of a run."""
    kinds = {k: run.identities.filter(kind=k).count() for k, _ in OcisIdentity.KINDS}
    results = {r.control_id: r for r in run.results.filter(control_id__in=["1.14", "4.3", "5.3.7"])}
    dormancy, superusers, ghosts = results.get("1.14"), results.get("4.3"), results.get("5.3.7")
    ev = dormancy.evidence if dormancy else {}

    def tested(r):  # None when the check could not read the Fusion pod
        return r is not None and AUTOMATED_CHECK_FAILED not in (r.flags or [])

    return {
        "monitored": kinds[OcisIdentity.DORMANT] + kinds[OcisIdentity.ACTIVE],
        "dormant": kinds[OcisIdentity.DORMANT],
        "active": kinds[OcisIdentity.ACTIVE],
        "dormant_privileged": run.identities.filter(kind=OcisIdentity.DORMANT, details__privileged=True).count(),
        "ghost": kinds[OcisIdentity.GHOST] if tested(ghosts) else None,
        "superusers": superusers.evidence.get("superuser_holders") if tested(superusers) else None,
        "threshold_days": ev.get("threshold_days"),
        "source": ev.get("source"),
        "fusion_error": ev.get("fusion_error"),
    }

