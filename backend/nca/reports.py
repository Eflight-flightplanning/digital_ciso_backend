"""Assessment reports: JSON structure + text / CSV / Markdown / HTML renderers."""
from __future__ import annotations

import csv
import re
import html
import io

from .catalog import get_control, load_framework, manual_category
from .models import NcaAssessment

_ctl = lambda c: get_control(c.framework, c.control_id)
STATUS_ORDER = ["FAIL", "ERROR", "MANUAL", "PASS", "NOT_APPLICABLE"]


def build_report(a: NcaAssessment, framework: str | None = None, include_findings: bool = True) -> dict:
    fws = [framework] if framework else a.frameworks
    controls = [c for c in a.control_results.all() if c.framework in fws]
    runs = {r.check_id: r for r in a.check_runs.all()}
    ctrl_rows = []
    for c in sorted(controls, key=lambda c: (c.framework, [int(p) if p.isdigit() else 0 for p in c.control_id.split("-")])):
        ctrl_rows.append({
            "framework": c.framework, "control_id": c.control_id, "name": c.name, "section": c.section,
            "subsection": c.subsection, "status": c.status, "reason": c.reason,
            "automated_result": c.automated_result, "manual_state": c.manual_state,
            "assessment_type": c.assessment_type, "scope": c.scope, "severity": c.severity,
            "parent_id": _ctl(c).parent_id if _ctl(c) else "",
            "description": _ctl(c).description if _ctl(c) else c.name,
            "manual_label": manual_category(_ctl(c))[1] if _ctl(c) and not c.check_ids else "",
            "checks": [{"check_id": k, "status": v, "reason": runs[k].reason if k in runs else "NOT_EXECUTED"}
                       for k, v in c.check_statuses.items()],
        })
    check_ids = sorted({k for c in controls for k in c.check_ids})
    check_rows = []
    for k in check_ids:
        r = runs.get(k)
        if not r:
            check_rows.append({"check_id": k, "status": "ERROR", "reason": "NOT_EXECUTED"})
            continue
        check_rows.append({
            "check_id": r.check_id, "source": r.source, "service": r.service, "title": r.title,
            "severity": r.severity, "status": r.status, "reason": r.reason, "message": r.message,
            "counts": r.counts, "errors": r.errors, "remediation_text": r.remediation_text,
            "remediation_cli": r.remediation_cli,
            "controls": [f"{c.framework}:{c.control_id}" for c in controls if k in c.check_ids],
        })
    report = {
        "assessment": {
            "id": str(a.id), "status": a.status, "mode": a.mode, "frameworks": a.frameworks,
            "tenancy_ocid": a.tenancy_ocid, "tenancy_name": a.tenancy_name, "regions": a.regions,
            "compartment_count": a.discovery.get("compartment_count"),
            "started_at": a.started_at.isoformat() if a.started_at else None,
            "finished_at": a.finished_at.isoformat() if a.finished_at else None,
            "engine_version": a.engine_version, "triggered_by": a.triggered_by,
        },
        "summary": a.summary.get("by_framework", {}).get(framework) if framework else a.summary,
        "frameworks": [load_framework(f).as_dict() for f in fws],
        "controls": ctrl_rows,
        "checks": check_rows,
        "missing_resources": [r["check_id"] for r in check_rows if r["status"] == "NOT_APPLICABLE"],
        "errors": [{"check_id": r["check_id"], "reason": r["reason"], "message": r.get("message", "")}
                   for r in check_rows if r["status"] == "ERROR"],
    }
    report["subcontrols"] = [
        {"sub_control": r.sub_control, "api_check": r.api_check, "status": r.status, "reason": r.reason,
         "workbook_automation": r.workbook_automation, "mapping_coverage": r.mapping_coverage, "checks": r.check_statuses}
        for r in a.subcontrol_results.all()] if (not framework or framework == "nca_ecc_2.2024") else []
    if include_findings:
        report["findings"] = list(a.findings.filter(check_id__in=check_ids).values(
            "check_id", "status", "severity", "resource_id", "resource_name", "resource_type", "region",
            "compartment_id", "status_extended"))
    return report


def render_text(rep: dict) -> str:
    a, s = rep["assessment"], rep["summary"] or {}
    ov = s.get("overall", s)
    lines = [
        "=" * 78, f"NCA assessment {a['id']}  [{a['status']}, {a['mode']}]",
        f"Tenancy: {a['tenancy_name']} ({a['tenancy_ocid']})", f"Regions: {', '.join(a['regions'])}   Compartments: {a['compartment_count']}",
        "=" * 78,
    ]
    for fw, d in (s.get("by_framework") or {"": ov}).items():
        if fw:
            lines.append(f"\n## {fw}")
        c, k, cov = d["controls"], d["checks"], d["coverage"]
        lines.append(f"Controls ({c['total']}): PASS {c['PASS']}  FAIL {c['FAIL']}  MANUAL {c['MANUAL']}  "
                     f"NOT_APPLICABLE {c['NOT_APPLICABLE']}  ERROR {c['ERROR']}   control pass rate: {c['pass_rate_pct']}%")
        lines.append(f"Checks   ({k['total']}): PASS {k['PASS']}  FAIL {k['FAIL']}  MANUAL {k['MANUAL']}  "
                     f"NOT_APPLICABLE {k['NOT_APPLICABLE']}  ERROR {k['ERROR']}   check pass rate: {k['pass_rate_pct']}%")
        lines.append(f"Coverage: assessed {cov['controls_with_definitive_status']}/{cov['controls_total']} "
                     f"({cov['assessment_coverage_pct']}%); automated {cov['controls_automatically_evaluated']}/"
                     f"{cov['controls_total']} ({cov['automated_coverage_pct']}%)")
    lines.append("\nCHECK RESULTS")
    for r in sorted(rep["checks"], key=lambda r: STATUS_ORDER.index(r["status"])):
        extra = f"  [{r.get('reason')}]" if r.get("reason") else ""
        lines.append(f"  {r['status']:<15} {r.get('severity', ''):<9} {r['check_id']}  {r.get('counts', '')}{extra}")
    if rep["errors"]:
        lines.append("\nERRORS (not evaluated):")
        lines += [f"  {e['check_id']} [{e['reason']}] {e['message'][:200]}" for e in rep["errors"]]
    if rep["missing_resources"]:
        lines.append("\nNO RESOURCES (NOT_APPLICABLE): " + ", ".join(rep["missing_resources"]))
    return "\n".join(lines)


_ID_RE = re.compile(r"^[0-9]+(-[0-9]+){1,3}$")


def _id_cell(v):
    """Control ids such as 1-1-2 are read by Excel as dates (01-01-2002). Catalog-derived ids matching ^[0-9]+(-[0-9]+)+$
    are written as ="1-1-2" so Excel keeps them as text; anything else goes through the normal formula-injection guard."""
    v = "" if v is None else str(v)
    return f'="{v}"' if _ID_RE.match(v) else _cell(v)


def _csv(rows_header, rows, id_cols=()) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(rows_header)
    for r in rows:
        w.writerow([(_id_cell(x) if i in id_cols else _cell(x)) for i, x in enumerate(r)])
    return buf.getvalue()


def render_csv(rep: dict) -> str:
    """One row per control / sub-control (so row counts equal control counts)."""
    from collections import Counter

    header = ["framework", "control_id", "parent_control", "description", "status", "reason", "manual_reason",
              "checks_total", "checks_pass", "checks_fail", "checks_no_resources", "check_ids"]
    rows = []
    for c in rep["controls"]:
        k = Counter(x["status"] for x in c["checks"])
        rows.append([c["framework"], c["control_id"], c.get("parent_id", ""), c.get("description") or c["name"], c["status"], c["reason"],
                     c.get("manual_label", ""), len(c["checks"]), k["PASS"], k["FAIL"], k["NOT_APPLICABLE"] + k["ERROR"],
                     ";".join(x["check_id"] for x in c["checks"])])
    return _csv(header, rows, id_cols=(1, 2))


def render_csv_checks(rep: dict) -> str:
    """Long form: one row per control x check (a control with N checks appears N times; status is the control's)."""
    header = ["framework", "control_id", "control_status", "check_id", "check_status", "check_reason"]
    rows = []
    for c in rep["controls"]:
        for k in c["checks"]:
            rows.append([c["framework"], c["control_id"], c["status"], k["check_id"], k["status"], k["reason"]])
    return _csv(header, rows, id_cols=(1,))


def _cell(v):
    """Neutralise spreadsheet formula injection from externally controlled strings."""
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", chr(9), chr(13)) else v


def render_markdown(rep: dict) -> str:
    a = rep["assessment"]
    md = [f"# NCA ECC / CCC assessment — {a['tenancy_name']}", "",
          f"- Assessment: `{a['id']}` ({a['status']}, {a['mode']})", f"- Tenancy: `{a['tenancy_ocid']}`",
          f"- Regions: {', '.join(a['regions'])}; compartments: {a['compartment_count']}",
          f"- Started: {a['started_at']}  Finished: {a['finished_at']}", ""]
    for fw, d in (rep["summary"] or {}).get("by_framework", {}).items():
        c, k, cov = d["controls"], d["checks"], d["coverage"]
        md += [f"## {fw}", "",
               f"| | PASS | FAIL | MANUAL | N/A | ERROR | Pass rate |", "|---|---|---|---|---|---|---|",
               f"| Controls ({c['total']}) | {c['PASS']} | {c['FAIL']} | {c['MANUAL']} | {c['NOT_APPLICABLE']} | {c['ERROR']} | {c['pass_rate_pct']}% |",
               f"| Checks ({k['total']}) | {k['PASS']} | {k['FAIL']} | {k['MANUAL']} | {k['NOT_APPLICABLE']} | {k['ERROR']} | {k['pass_rate_pct']}% |", "",
               f"**Assessment coverage** (controls with a definitive status): {cov['assessment_coverage_pct']}% — "
               f"**automated coverage**: {cov['automated_coverage_pct']}%. Coverage is independent of the pass rate.", ""]
    md += ["## Checks", "", "| Status | Severity | Check | Reason | Counts |", "|---|---|---|---|---|"]
    for r in sorted(rep["checks"], key=lambda r: STATUS_ORDER.index(r["status"])):
        md.append(f"| {r['status']} | {r.get('severity', '')} | `{r['check_id']}` | {r.get('reason', '')} | {r.get('counts', '')} |")
    md += ["", "## Controls", "", "| Framework | Control | Status | Reason | Automated | Manual |", "|---|---|---|---|---|---|"]
    for c in rep["controls"]:
        md.append(f"| {c['framework']} | {c['control_id']} {c['name'][:70].replace('|', '/')} | {c['status']} | {c['reason']} | {c['automated_result'] or '-'} | {c['manual_state'] or '-'} |")
    return "\n".join(md) + "\n"


def render_html(rep: dict) -> str:
    esc = html.escape
    body = esc(render_markdown(rep))
    return ("<!doctype html><html><head><meta charset='utf-8'><title>NCA assessment report</title>"
            "<style>body{font-family:system-ui;margin:2rem;max-width:1100px}pre{white-space:pre-wrap;font-size:13px}</style>"
            f"</head><body><pre>{body}</pre></body></html>")
