"""Pure aggregation logic (no DB, no network): check results -> control status -> coverage.

Statuses
    PASS            evaluated and compliant
    FAIL            evaluated and non-compliant (or reviewer rejected)
    MANUAL          cannot be (fully) decided automatically; needs evidence + review
    NOT_APPLICABLE  no in-scope resources exist (check level) / reviewer-justified N/A (control level)
    ERROR           could not be evaluated (API error, permission denied, not executed)
A check or control that was not evaluated is never reported as PASS.
"""
from __future__ import annotations

from collections import Counter

PASS, FAIL, MANUAL, NA, ERROR = "PASS", "FAIL", "MANUAL", "NOT_APPLICABLE", "ERROR"
STATUSES = (PASS, FAIL, MANUAL, NA, ERROR)

# reason codes
R_NO_RESOURCES = "NO_RESOURCES"
R_API_ERROR = "API_ERROR"
R_PERMISSION_DENIED = "PERMISSION_DENIED"
R_NOT_EXECUTED = "NOT_EXECUTED"
R_UNSUPPORTED = "UNSUPPORTED"
R_NO_AUTOMATED_CHECK = "NO_AUTOMATED_CHECK"
R_PARTIAL_AUTOMATION = "PARTIAL_AUTOMATION"
R_MANUAL_PENDING = "MANUAL_REVIEW_PENDING"
R_MANUAL_REJECTED = "MANUAL_REJECTED"
R_MANUAL_APPROVED = "MANUAL_APPROVED"
R_MANUAL_NA = "MANUAL_NOT_APPLICABLE"


def aggregate_check(finding_statuses: list[str], errors: list[dict]) -> tuple[str, str]:
    """Aggregate resource-level findings of ONE check into (status, reason).

    `errors` are service/API errors observed while the check's data was collected.
    A check whose data collection was incomplete can never be PASS.
    """
    c = Counter(finding_statuses)
    if c[FAIL]:
        return FAIL, ""
    if errors:
        kinds = {e.get("kind") for e in errors}
        return ERROR, R_PERMISSION_DENIED if R_PERMISSION_DENIED in kinds else R_API_ERROR
    if c[MANUAL]:
        return MANUAL, ""
    if c[PASS]:
        return PASS, ""
    return NA, R_NO_RESOURCES


def aggregate_automated(check_statuses: list[tuple[str, str]]) -> tuple[str | None, str]:
    """Combine mapped check statuses [(status, reason)] -> (automated_result, reason).
    Returns (None, NO_AUTOMATED_CHECK) when the control has no mapped checks."""
    if not check_statuses:
        return None, R_NO_AUTOMATED_CHECK
    st = [s for s, _ in check_statuses]
    if FAIL in st:
        return FAIL, ""
    if ERROR in st:
        reasons = {r for s, r in check_statuses if s == ERROR}
        return ERROR, R_PERMISSION_DENIED if R_PERMISSION_DENIED in reasons else (
            R_NOT_EXECUTED if reasons == {R_NOT_EXECUTED} else R_API_ERROR)
    if MANUAL in st:
        return MANUAL, ""
    if PASS in st:
        return PASS, ""
    return NA, R_NO_RESOURCES


def compute_control_status(
    automated: str | None,
    automated_reason: str,
    scope: str,
    manual_state: str | None,
) -> tuple[str, str]:
    """Final control status.

    manual_state: None | 'pending' | 'approved' | 'rejected' | 'not_applicable'
    (latest reviewer decision that applies to the latest submitted evidence).
    """
    # Definitive negative results always win.
    if automated == FAIL:
        return FAIL, ""
    if manual_state == "rejected":
        return FAIL, R_MANUAL_REJECTED
    if automated == ERROR:
        return ERROR, automated_reason
    if manual_state == "not_applicable":
        return NA, R_MANUAL_NA
    if manual_state == "approved":
        return PASS, R_MANUAL_APPROVED
    # No approved evidence from here on.
    if automated is None:
        return MANUAL, R_MANUAL_PENDING if manual_state == "pending" else R_NO_AUTOMATED_CHECK
    if automated == MANUAL:
        return MANUAL, R_MANUAL_PENDING if manual_state == "pending" else ""
    if automated == NA:
        # every mapped check found no in-scope resources: report that explicitly instead of calling it manual
        return (MANUAL, R_MANUAL_PENDING) if manual_state == "pending" else (NA, R_NO_RESOURCES)
    # automated checks all passed: the control is scanned and passes. Controls that only partly map to OCI
    # settings keep a reason so the UI can note that the result covers the technical part.
    return PASS, "" if scope == "full" else R_PARTIAL_AUTOMATION


def summarize(control_rows: list[dict], check_rows: list[dict], finding_rows: list[dict] | None = None) -> dict:
    """Coverage and pass-rate summary. Coverage and pass rate are deliberately separate.

    control_rows: {status, automated_result}
    check_rows:   {status}
    """
    total = len(control_rows)
    cs = Counter(r["status"] for r in control_rows)
    definitive = cs[PASS] + cs[FAIL] + cs[NA]
    auto_evaluated = sum(1 for r in control_rows if r.get("automated_result") in (PASS, FAIL, NA))
    auto_mapped = sum(1 for r in control_rows if r.get("automated_result") is not None)
    ks = Counter(r["status"] for r in check_rows)
    check_decided = ks[PASS] + ks[FAIL]
    out = {
        "controls": {
            "total": total,
            **{s: cs[s] for s in STATUSES},
            "pass_rate_pct": round(100 * cs[PASS] / (cs[PASS] + cs[FAIL]), 1) if (cs[PASS] + cs[FAIL]) else None,
        },
        "checks": {
            "total": len(check_rows),
            **{s: ks[s] for s in STATUSES},
            "pass_rate_pct": round(100 * ks[PASS] / check_decided, 1) if check_decided else None,
        },
        "coverage": {
            "controls_total": total,
            "controls_with_definitive_status": definitive,
            "assessment_coverage_pct": round(100 * definitive / total, 1) if total else 0.0,
            "controls_with_automated_checks": auto_mapped,
            "controls_automatically_evaluated": auto_evaluated,
            "automated_coverage_pct": round(100 * auto_evaluated / total, 1) if total else 0.0,
            "controls_awaiting_manual_evidence_or_review": cs[MANUAL],
            "controls_not_evaluable_errors": cs[ERROR],
        },
    }
    if finding_rows is not None:
        fs = Counter(r["status"] for r in finding_rows)
        out["findings"] = {"total": len(finding_rows), **{s: fs[s] for s in (PASS, FAIL, MANUAL)}}
    return out


def basis(status: str, reason: str, has_checks: bool) -> str:
    """Why a control has its status, for presentation:
    manual        - governance/policy control with no OCI API check: needs evidence + review
    automated     - evaluated by OCI checks (PASS/FAIL, or MANUAL because only part is automatable)
    no_resources  - automated checks exist but the tenancy has no such resources
    error         - could not be evaluated (API error / permission denied / not executed)
    """
    if not has_checks:
        return "manual"
    if status == ERROR:
        return "error"
    if reason == R_NO_RESOURCES:
        return "no_resources"
    return "automated"
