"""Manual-control workflow state (evidence -> review) and control (re)aggregation."""
from __future__ import annotations

from .aggregate import (
    compute_control_status, aggregate_automated, aggregate_check, summarize, ERROR, R_NOT_EXECUTED,
)
from .catalog import API_FRAMEWORK, get_control, load_api_rows, load_framework, manual_category
from .models import (
    NcaAssessment, NcaCheckRun, NcaControlResult, NcaControlReview, NcaManualEvidence, NcaSubcontrolResult,
)

SEVERITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "informational": 0}


def manual_state_for(framework: str, control_id: str, tenant_id=None) -> tuple[str | None, NcaManualEvidence | None, NcaControlReview | None]:
    """Return (state, latest_evidence, latest_review).

    state: None | 'pending' | 'approved' | 'rejected' | 'not_applicable'.
    A decision only counts for the evidence it reviewed; submitting newer evidence
    resets the control to 'pending'. A not_applicable decision counts until newer evidence arrives.
    """
    ev_qs = NcaManualEvidence.objects.filter(framework=framework, control_id=control_id)
    rv_qs = NcaControlReview.objects.filter(framework=framework, control_id=control_id)
    if tenant_id:
        ev_qs, rv_qs = ev_qs.filter(tenant_id=tenant_id), rv_qs.filter(tenant_id=tenant_id)
    ev = ev_qs.order_by("-submitted_at").first()
    rv = rv_qs.order_by("-created_at").first()
    if rv and rv.decision == NcaControlReview.Decision.NOT_APPLICABLE and (not ev or rv.created_at >= ev.submitted_at):
        return "not_applicable", ev, rv
    if ev is None:
        return None, None, rv
    if rv and rv.evidence_id == ev.id:
        return rv.decision, ev, rv  # approved | rejected
    return "pending", ev, rv


def manual_states(frameworks: list[str], tenant_id=None) -> dict[tuple[str, str], str]:
    out = {}
    for fw in frameworks:
        for c in load_framework(fw).controls:
            st, _, _ = manual_state_for(fw, c.control_id, tenant_id)
            if st:
                out[(fw, c.control_id)] = st
    return out


def finalize_controls(assessment: NcaAssessment) -> dict:
    """(Re)build NcaControlResult rows for an assessment from its stored check runs and the
    current manual-review state; store and return the summary."""
    runs = {r.check_id: r for r in assessment.check_runs.all()}
    states = manual_states(assessment.frameworks, assessment.tenant_id)
    rows, objs = [], []
    for fw in assessment.frameworks:
        for c in load_framework(fw).controls:
            statuses, mapped = [], {}
            for chk in c.checks:
                r = runs.get(chk)
                if r is None:  # mapped but never executed: never PASS
                    statuses.append((ERROR, R_NOT_EXECUTED))
                    mapped[chk] = ERROR
                else:
                    statuses.append((r.status, r.reason))
                    mapped[chk] = r.status
            automated, a_reason = aggregate_automated(statuses)
            mstate = states.get((fw, c.control_id))
            status, reason = compute_control_status(automated, a_reason, c.scope, mstate)
            sev = ""
            failing = [runs[k].severity for k, v in mapped.items() if v == "FAIL" and k in runs]
            if failing:
                sev = max(failing, key=lambda s: SEVERITY_ORDER.get(s, 0))
            objs.append(NcaControlResult(
                assessment=assessment, framework=fw, control_id=c.control_id, name=c.name,
                section=c.section, subsection=c.subsection, assessment_type=c.assessment_type,
                scope=c.scope, status=status, reason=reason, automated_result=automated,
                manual_state=mstate or "", check_ids=c.checks, check_statuses=mapped, severity=sev,
            ))
            rows.append({"framework": fw, "status": status, "automated_result": automated})
    assessment.control_results.all().delete()
    NcaControlResult.objects.bulk_create(objs)

    assessment.subcontrol_results.all().delete()
    if API_FRAMEWORK in assessment.frameworks:
        subs = []
        for row in load_api_rows():
            statuses, mapped = [], {}
            for chk in row["checks"]:
                r = runs.get(chk)
                statuses.append((r.status, r.reason) if r else (ERROR, R_NOT_EXECUTED))
                mapped[chk] = r.status if r else ERROR
            automated, a_reason = aggregate_automated(statuses)
            scope = "full" if (row["automation_level"] == "FULL" and row["coverage"] == "full") else "partial"
            status, reason = compute_control_status(automated, a_reason, scope, None)
            subs.append(NcaSubcontrolResult(
                assessment=assessment, framework=API_FRAMEWORK, row_id=row["row_id"], sub_control=row["sub_control"],
                control_id=row["control_id"], category=row["category"] or "", api_check=row["api_check"],
                description=row["description"] or "", workbook_automation=row["automation_level"] or "",
                mapping_coverage=row["coverage"], pass_condition=row["pass_condition"] or "",
                fail_condition=row["fail_condition"] or "", oci_api=row["oci_api"] or "",
                notes=" ".join(x for x in (row["notes"], row["mapping_note"]) if x),
                status=status, reason=reason, automated_result=automated, check_ids=row["checks"], check_statuses=mapped))
        NcaSubcontrolResult.objects.bulk_create(subs)

    check_rows = [{"status": r.status} for r in runs.values()]
    finding_rows = list(assessment.findings.values("status"))
    summary = {"overall": summarize(rows, check_rows, finding_rows), "by_framework": {}}
    for fw in assessment.frameworks:
        fr = [r for r in rows if r["framework"] == fw]
        fw_checks = {k for c in load_framework(fw).controls for k in c.checks}
        summary["by_framework"][fw] = summarize(fr, [{"status": runs[k].status} for k in fw_checks if k in runs])
    if API_FRAMEWORK in assessment.frameworks:
        sub_rows = list(assessment.subcontrol_results.values("status", "automated_result"))
        sub = summarize(sub_rows, [])
        summary["workbook_subcontrols"] = {**sub["controls"], "automated_coverage_pct": sub["coverage"]["automated_coverage_pct"],
                                           "assessment_coverage_pct": sub["coverage"]["assessment_coverage_pct"]}
    # break the MANUAL bucket down by why it is manual (kept apart from NOT_APPLICABLE / no resources)
    for fw in assessment.frameworks:
        mc = {"manual_control": 0, "automated_awaiting_evidence": 0, "awaiting_review": 0}
        for r in objs:
            if r.framework != fw or r.status != "MANUAL":
                continue
            if r.reason == "MANUAL_REVIEW_PENDING":
                mc["awaiting_review"] += 1
            elif not r.check_ids:
                mc["manual_control"] += 1
            else:
                mc["automated_awaiting_evidence"] += 1
        mc["no_resources_found"] = sum(1 for r in objs if r.framework == fw and r.reason == "NO_RESOURCES")
        summary["by_framework"][fw]["manual_breakdown"] = mc
        summary["by_framework"][fw]["accounting"] = control_accounting([r for r in objs if r.framework == fw], runs)
    if API_FRAMEWORK in assessment.frameworks:
        full = list(assessment.subcontrol_results.filter(workbook_automation="FULL").values("status", "automated_result"))
        fs = summarize(full, [])["controls"]
        summary["workbook_automated"] = {k: fs[k] for k in ("total", "PASS", "FAIL", "MANUAL", "NOT_APPLICABLE", "ERROR", "pass_rate_pct")}
    assessment.summary = summary
    assessment.save(update_fields=["summary"])
    return summary


def control_accounting(control_objs, runs) -> dict:
    """One consistent accounting of every control in a framework.

    total = scanned + manual_only
    scanned = controls with at least one OCI check that was run. Each scanned control lands in exactly one of
    failed / passed / no_resources / not_evaluated / awaiting_evidence (checks passed, rest of the control
    needs evidence) / awaiting_review. Controls that also contain checks which found no resources are
    counted in `with_no_resource_checks` so that "no resources" is never hidden inside a FAIL.
    """
    total = len(control_objs)
    scanned = [c for c in control_objs if c.check_ids]
    out = {"total": total, "scanned": len(scanned), "manual_only": total - len(scanned),
           "failed": 0, "passed": 0, "no_resources": 0, "not_evaluated": 0, "awaiting_evidence": 0, "awaiting_review": 0,
           "with_no_resource_checks": 0, "no_resource_checks": []}
    seen_na = set()
    for c in scanned:
        if c.status == "FAIL":
            out["failed"] += 1
        elif c.status == "PASS":
            out["passed"] += 1
        elif c.status == "NOT_APPLICABLE":
            out["no_resources"] += 1
        elif c.status == "ERROR":
            out["not_evaluated"] += 1
        elif c.reason == "MANUAL_REVIEW_PENDING":
            out["awaiting_review"] += 1
        else:
            out["awaiting_evidence"] += 1
        na = [k for k, v in c.check_statuses.items() if v == "NOT_APPLICABLE"]
        if na:
            out["with_no_resource_checks"] += 1
            seen_na.update(na)
    out["no_resource_checks"] = sorted(seen_na)
    cats: dict[str, int] = {}
    for c in control_objs:
        if not c.check_ids:
            ctrl = get_control(c.framework, c.control_id)
            if ctrl:
                cat = manual_category(ctrl)[0]
                cats[cat] = cats.get(cat, 0) + 1
    out["manual_only_by_category"] = dict(sorted(cats.items(), key=lambda kv: -kv[1]))
    return out
