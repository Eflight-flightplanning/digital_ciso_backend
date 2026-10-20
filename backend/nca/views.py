"""NCA assessment REST API (plain JSON; mounted at /api/v1/nca/)."""
from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import FileResponse, HttpResponse
from rest_framework import status as http
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .perms import HasPermissions, Permissions, resolve_tenant

from . import reports
from .aggregate import basis as _basis
from .catalog import manual_category, FRAMEWORK_FILES, get_control, list_frameworks, load_framework
from .engine import run_assessment
from .manual import finalize_controls, manual_state_for
from .models import (
    NcaAssessment, NcaAuditLog, NcaCheckRun, NcaControlComment, NcaControlResult, NcaControlReview,
    NcaFinding, NcaManualEvidence, NcaRemediation,
)
from .remediation import RemediationBlocked, dry_run, execute_remediation, remediation_options, confirmation_phrase

logger = logging.getLogger("nca.views")

MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv", ".md", ".docx", ".xlsx", ".pptx"}
STALE_RUN = timedelta(hours=1)


class NcaBase(APIView):
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated, HasPermissions]
    required_permissions: list = []

    def tenant_id(self, request):
        t = resolve_tenant(request)
        return t.id if t else None

    @staticmethod
    def actor(request) -> str:
        return getattr(request.user, "email", None) or str(request.user)

    def assessment_or_404(self, request, pk):
        qs = NcaAssessment.objects.filter(pk=pk)
        tid = self.tenant_id(request)
        if tid:
            qs = qs.filter(tenant_id=tid)
        return qs.first()


def _audit(request, tid, action, target, details=None):
    NcaAuditLog.objects.create(tenant_id=tid, actor=NcaBase.actor(request), action=action, target=target[:500], details=details or {})


def _assessment_dict(a: NcaAssessment, brief: bool = False) -> dict:
    d = {
        "id": str(a.id), "status": a.status, "mode": a.mode, "progress": a.progress, "frameworks": a.frameworks,
        "tenancy_ocid": a.tenancy_ocid, "tenancy_name": a.tenancy_name, "regions": a.regions,
        "compartment_count": a.discovery.get("compartment_count") if a.discovery else None,
        "started_at": a.started_at, "finished_at": a.finished_at, "error": a.error,
        "triggered_by": a.triggered_by, "engine_version": a.engine_version,
    }
    if not brief:
        d["summary"] = a.summary
        d["discovery"] = a.discovery
    return d


def _reap(qs):
    cutoff = datetime.now(timezone.utc) - STALE_RUN
    qs.filter(status="running", started_at__lt=cutoff).update(
        status="failed", error="Assessment did not finish (server restarted or run timed out).", finished_at=datetime.now(timezone.utc))


# ----------------------------------------------------------------- catalog

class FrameworksView(NcaBase):
    def get(self, request):
        return Response({"frameworks": [f.as_dict() for f in list_frameworks()]})


class FrameworkDetailView(NcaBase):
    def get(self, request, key):
        if key not in FRAMEWORK_FILES:
            return Response({"detail": "Unknown framework."}, status=404)
        return Response(load_framework(key).as_dict(with_controls=True))


# ----------------------------------------------------------------- assessments

class AssessmentsView(NcaBase):
    def get_permissions(self):
        self.required_permissions = [Permissions.MANAGE_SCANS] if self.request.method == "POST" else []
        return super().get_permissions()

    def get(self, request):
        tid = self.tenant_id(request)
        qs = NcaAssessment.objects.filter(tenant_id=tid)
        _reap(qs)
        return Response({"results": [_assessment_dict(a, brief=False) for a in qs.order_by("-started_at")[:50]]})

    def post(self, request):
        tid = self.tenant_id(request)
        fws = request.data.get("frameworks") or list(FRAMEWORK_FILES)
        if not isinstance(fws, list) or any(f not in FRAMEWORK_FILES for f in fws):
            return Response({"detail": f"frameworks must be a subset of {sorted(FRAMEWORK_FILES)}"}, status=400)
        qs = NcaAssessment.objects.filter(tenant_id=tid, status="running")
        _reap(qs)
        if qs.exists():
            return Response({"detail": "An assessment is already running.", "id": str(qs.first().id)}, status=409)
        provider_id = request.data.get("provider_id") or None
        a = NcaAssessment.objects.create(tenant_id=tid, frameworks=fws, triggered_by=self.actor(request),
                                         oci_profile="platform-provider")
        _audit(request, tid, "assessment.start", str(a.id), {"frameworks": fws, "mode": "read-only"})

        def _bg():
            try:
                run_assessment(frameworks=fws, tenant_id=tid, triggered_by=a.triggered_by, assessment=a, provider_id=provider_id)
            finally:
                connection.close()

        threading.Thread(target=_bg, name=f"nca-{a.id}", daemon=True).start()
        return Response(_assessment_dict(a), status=202)


class AssessmentDetailView(NcaBase):
    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        return Response(_assessment_dict(a))


class AssessmentLatestView(NcaBase):
    def get(self, request):
        tid = self.tenant_id(request)
        qs = NcaAssessment.objects.filter(tenant_id=tid)
        _reap(qs)
        a = qs.filter(status="completed").order_by("-started_at").first()
        running = qs.filter(status="running").order_by("-started_at").first()
        return Response({"latest": _assessment_dict(a) if a else None,
                         "running": _assessment_dict(running, brief=True) if running else None})


def _page(request, qs, ser, default=100, maximum=500):
    try:
        limit = min(int(request.query_params.get("limit", default)), maximum)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except ValueError:
        limit, offset = default, 0
    total = qs.count()
    return {"count": total, "limit": limit, "offset": offset, "results": [ser(x) for x in qs[offset:offset + limit]]}


def _manual_label(c) -> str:
    if c.check_ids:
        return ""
    ctrl = get_control(c.framework, c.control_id)
    return manual_category(ctrl)[1] if ctrl else ""


class AssessmentControlsView(NcaBase):
    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        qs = a.control_results.all()
        p = request.query_params
        if p.get("framework"):
            qs = qs.filter(framework=p["framework"])
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("section"):
            qs = qs.filter(section=p["section"])
        if p.get("q"):
            q = p["q"]
            qs = qs.filter(name__icontains=q) | qs.filter(control_id__icontains=q)
        runs = {r.check_id: r for r in a.check_runs.all()}

        def ser(c):
            return {
                "framework": c.framework, "control_id": c.control_id, "name": c.name, "section": c.section,
                "subsection": c.subsection, "status": c.status, "reason": c.reason,
                "automated_result": c.automated_result, "manual_state": c.manual_state,
                "assessment_type": c.assessment_type, "scope": c.scope, "severity": c.severity,
                "basis": _basis(c.status, c.reason, bool(c.check_ids)),
                "manual_label": _manual_label(c),
                "has_workbook_rows": bool((get_control(c.framework, c.control_id) or object()).__dict__.get("workbook_rows")),
                "checks": [{"check_id": k, "status": v, "reason": runs[k].reason if k in runs else "NOT_EXECUTED"}
                           for k, v in c.check_statuses.items()],
            }
        qs = qs.order_by("framework", "id")
        return Response(_page(request, qs, ser, default=300, maximum=500))


class AssessmentSubcontrolsView(NcaBase):
    """Sub-control rows from the ECC-2:2024 Cloud API Automation Mapping workbook."""

    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        qs = a.subcontrol_results.all()
        p = request.query_params
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("control_id"):
            qs = qs.filter(control_id=p["control_id"])
        if p.get("automation"):
            qs = qs.filter(workbook_automation=p["automation"])
        if p.get("q"):
            qs = qs.filter(api_check__icontains=p["q"]) | qs.filter(sub_control__icontains=p["q"])

        def ser(r):
            return {"row_id": r.row_id, "sub_control": r.sub_control, "control_id": r.control_id, "category": r.category,
                    "api_check": r.api_check, "description": r.description, "workbook_automation": r.workbook_automation,
                    "mapping_coverage": r.mapping_coverage, "pass_condition": r.pass_condition,
                    "fail_condition": r.fail_condition, "oci_api": r.oci_api, "notes": r.notes, "status": r.status,
                    "reason": r.reason, "automated_result": r.automated_result,
                    "basis": _basis(r.status, r.reason, bool(r.check_ids)),
                    "checks": [{"check_id": k, "status": v} for k, v in r.check_statuses.items()]}
        return Response(_page(request, qs.order_by("id"), ser, default=200))


class AssessmentChecksView(NcaBase):
    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        qs = a.check_runs.all()
        p = request.query_params
        for f in ("status", "severity", "service", "source"):
            if p.get(f):
                qs = qs.filter(**{f"{f}__in": p[f].split(",")})
        if p.get("framework"):
            ids = {k for c in load_framework(p["framework"]).controls for k in c.checks}
            qs = qs.filter(check_id__in=ids)
        controls_by_check: dict[str, list[str]] = {}
        for c in a.control_results.all():
            for k in c.check_ids:
                controls_by_check.setdefault(k, []).append(f"{c.framework}:{c.control_id}")

        def ser(r):
            return {"check_id": r.check_id, "source": r.source, "service": r.service, "title": r.title,
                    "severity": r.severity, "status": r.status, "reason": r.reason, "message": r.message,
                    "counts": r.counts, "errors": r.errors, "remediation_text": r.remediation_text,
                    "remediation_cli": r.remediation_cli, "remediation_manual": r.remediation_manual,
                    "controls": controls_by_check.get(r.check_id, []), "duration_ms": r.duration_ms,
                    "remediation": remediation_options(r.check_id)}
        return Response(_page(request, qs.order_by("status", "check_id"), ser, default=200))


class AssessmentFindingsView(NcaBase):
    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        qs = a.findings.all()
        p = request.query_params
        for f in ("status", "check_id", "region", "severity"):
            if p.get(f):
                qs = qs.filter(**{f"{f}__in": p[f].split(",")})

        def ser(f):
            return {"id": f.id, "check_id": f.check_id, "status": f.status, "severity": f.severity,
                    "resource_id": f.resource_id, "resource_name": f.resource_name, "resource_type": f.resource_type,
                    "region": f.region, "compartment_id": f.compartment_id, "status_extended": f.status_extended,
                    "evidence": f.evidence, "remediation": remediation_options(f.check_id) if f.status == "FAIL" else None}
        return Response(_page(request, qs.order_by("check_id", "status", "id"), ser, default=100))


class AssessmentReportView(NcaBase):
    def get(self, request, pk):
        a = self.assessment_or_404(request, pk)
        if not a:
            return Response({"detail": "Not found."}, status=404)
        fw = request.query_params.get("framework") or None
        if fw and fw not in FRAMEWORK_FILES:
            return Response({"detail": "Unknown framework."}, status=400)
        fmt = request.query_params.get("fmt", "json")  # not "format": DRF reserves ?format= for renderer overrides
        rep = reports.build_report(a, fw)
        _audit(request, a.tenant_id, "report.export", str(a.id), {"format": fmt, "framework": fw})
        name = f"nca-assessment-{str(a.id)[:8]}{'-' + fw if fw else ''}"
        if fmt == "json":
            r = Response(rep)
            r["Content-Disposition"] = f'attachment; filename="{name}.json"'
            return r
        renderers = {"csv": (reports.render_csv, "text/csv"), "csv_checks": (reports.render_csv_checks, "text/csv"), "md": (reports.render_markdown, "text/markdown"),
                     "html": (reports.render_html, "text/html"), "text": (reports.render_text, "text/plain")}
        if fmt not in renderers:
            return Response({"detail": "fmt must be one of json,csv,csv_checks,md,html,text"}, status=400)
        fn, ctype = renderers[fmt]
        body = fn(rep)
        if fmt.startswith("csv"):
            body = "﻿" + body  # UTF-8 BOM so Excel shows non-ASCII characters correctly
        resp = HttpResponse(body, content_type=f"{ctype}; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{name}.{"csv" if fmt.startswith("csv") else fmt}"'
        resp["X-Content-Type-Options"] = "nosniff"
        return resp


# ----------------------------------------------------------------- manual controls

def _ctrl_or_404(framework, control_id):
    if framework not in FRAMEWORK_FILES:
        return None
    return get_control(framework, control_id)


def _ev_dict(e: NcaManualEvidence) -> dict:
    return {"id": str(e.id), "title": e.title, "description": e.description, "url": e.url, "file_name": e.file_name,
            "file_sha256": e.file_sha256, "has_file": bool(e.file_path), "submitted_by": e.submitted_by,
            "submitted_at": e.submitted_at}


def _rv_dict(r: NcaControlReview) -> dict:
    return {"id": str(r.id), "decision": r.decision, "reviewer": r.reviewer, "comment": r.comment,
            "evidence_id": str(r.evidence_id) if r.evidence_id else None, "created_at": r.created_at}


class ControlDetailView(NcaBase):
    def get(self, request, framework, control_id):
        c = _ctrl_or_404(framework, control_id)
        if not c:
            return Response({"detail": "Unknown control."}, status=404)
        tid = self.tenant_id(request)
        state, ev, rv = manual_state_for(framework, control_id, tid)
        evs = NcaManualEvidence.objects.filter(tenant_id=tid, framework=framework, control_id=control_id)
        rvs = NcaControlReview.objects.filter(tenant_id=tid, framework=framework, control_id=control_id)
        cms = NcaControlComment.objects.filter(tenant_id=tid, framework=framework, control_id=control_id)
        result = None
        aid = request.query_params.get("assessment")
        a = self.assessment_or_404(request, aid) if aid else NcaAssessment.objects.filter(
            tenant_id=tid, status="completed").order_by("-started_at").first()
        history = []
        if a:
            r = a.control_results.filter(framework=framework, control_id=control_id).first()
            if r:
                runs = {x.check_id: x for x in a.check_runs.filter(check_id__in=r.check_ids)}
                result = {"assessment_id": str(a.id), "status": r.status, "reason": r.reason,
                          "automated_result": r.automated_result, "scope": r.scope,
                          "checks": [{"check_id": k, "status": v, "title": runs[k].title if k in runs else "",
                                      "reason": runs[k].reason if k in runs else "NOT_EXECUTED",
                                      "message": runs[k].message if k in runs else "",
                                      "source": c.check_source(k), "counts": runs[k].counts if k in runs else {},
                                      "remediation_text": runs[k].remediation_text if k in runs else "",
                                      "remediation_cli": runs[k].remediation_cli if k in runs else "",
                                      "remediation_manual": runs[k].remediation_manual if k in runs else "",
                                      "remediation": remediation_options(k)}
                                     for k, v in r.check_statuses.items()]}
        for x in NcaControlResult.objects.filter(
                framework=framework, control_id=control_id, assessment__tenant_id=tid,
                assessment__status="completed").select_related("assessment").order_by("-assessment__started_at")[:20]:
            history.append({"assessment_id": str(x.assessment_id), "at": x.assessment.started_at, "status": x.status, "reason": x.reason})
        return Response({
            "control": c.as_dict(), "manual_state": state, "result": result, "history": history,
            "evidence": [_ev_dict(e) for e in evs], "reviews": [_rv_dict(r) for r in rvs],
            "comments": [{"id": str(m.id), "author": m.author, "body": m.body, "created_at": m.created_at} for m in cms],
        })


def _refresh_latest(tid):
    a = NcaAssessment.objects.filter(tenant_id=tid, status="completed").order_by("-started_at").first()
    if a:
        finalize_controls(a)


class EvidenceView(NcaBase):
    def post(self, request, framework, control_id):
        c = _ctrl_or_404(framework, control_id)
        if not c:
            return Response({"detail": "Unknown control."}, status=404)
        tid = self.tenant_id(request)
        title = (request.data.get("title") or "").strip()
        description = (request.data.get("description") or "").strip()
        url = (request.data.get("url") or "").strip()
        f = request.FILES.get("file")
        if not title:
            return Response({"detail": "title is required."}, status=400)
        if not (description or url or f):
            return Response({"detail": "Provide a description, a URL or a file."}, status=400)
        if url and not re.match(r"^https?://", url):
            return Response({"detail": "url must be http(s)."}, status=400)
        ev = NcaManualEvidence(id=uuid.uuid4(), tenant_id=tid, framework=framework, control_id=control_id, title=title[:255],
                               description=description, url=url, submitted_by=self.actor(request))
        if f:
            ext = Path(f.name).suffix.lower()
            if ext not in ALLOWED_EXT:
                return Response({"detail": f"File type {ext or '(none)'} not allowed."}, status=400)
            if f.size > MAX_EVIDENCE_BYTES:
                return Response({"detail": "File exceeds 10 MB."}, status=400)
            base = Path(getattr(settings, "NCA_EVIDENCE_DIR", Path(settings.BASE_DIR) / "nca_evidence")) / str(tid)
            base.mkdir(parents=True, exist_ok=True)
            safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(f.name).name)[:100]
            dest = base / f"{ev.id}_{safe}"
            h = hashlib.sha256()
            with open(dest, "wb") as out:
                for chunk in f.chunks():
                    h.update(chunk)
                    out.write(chunk)
            ev.file_name, ev.file_path, ev.file_sha256 = safe, str(dest), h.hexdigest()
        ev.save()
        _audit(request, tid, "evidence.submit", f"{framework}:{control_id}", {"evidence_id": str(ev.id), "title": title})
        _refresh_latest(tid)
        return Response(_ev_dict(ev), status=201)


class EvidenceDownloadView(NcaBase):
    def get(self, request, evidence_id):
        tid = self.tenant_id(request)
        ev = NcaManualEvidence.objects.filter(pk=evidence_id, tenant_id=tid).first()
        if not ev or not ev.file_path or not os.path.isfile(ev.file_path):
            return Response({"detail": "Not found."}, status=404)
        resp = FileResponse(open(ev.file_path, "rb"), as_attachment=True, filename=ev.file_name)
        resp["X-Content-Type-Options"] = "nosniff"
        return resp


class ReviewView(NcaBase):
    required_permissions = [Permissions.MANAGE_SCANS]

    def post(self, request, framework, control_id):
        c = _ctrl_or_404(framework, control_id)
        if not c:
            return Response({"detail": "Unknown control."}, status=404)
        tid = self.tenant_id(request)
        decision = request.data.get("decision")
        comment = (request.data.get("comment") or "").strip()
        if decision not in NcaControlReview.Decision.values:
            return Response({"detail": f"decision must be one of {NcaControlReview.Decision.values}"}, status=400)
        if decision in ("rejected", "not_applicable") and len(comment) < 10:
            return Response({"detail": "A comment (>= 10 characters) is required to reject or mark not applicable."}, status=400)
        _, ev, _ = manual_state_for(framework, control_id, tid)
        if decision in ("approved", "rejected"):
            if ev is None:
                return Response({"detail": "No evidence has been submitted for this control."}, status=400)
            if ev.submitted_by == self.actor(request):
                return Response({"detail": "Segregation of duties: you cannot review evidence you submitted."}, status=403)
        rv = NcaControlReview.objects.create(
            tenant_id=tid, framework=framework, control_id=control_id,
            evidence=ev if decision != "not_applicable" else None, decision=decision,
            reviewer=self.actor(request), comment=comment)
        _audit(request, tid, f"review.{decision}", f"{framework}:{control_id}", {"review_id": str(rv.id), "comment": comment})
        _refresh_latest(tid)
        return Response(_rv_dict(rv), status=201)


class CommentView(NcaBase):
    def post(self, request, framework, control_id):
        if not _ctrl_or_404(framework, control_id):
            return Response({"detail": "Unknown control."}, status=404)
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response({"detail": "body is required."}, status=400)
        tid = self.tenant_id(request)
        m = NcaControlComment.objects.create(tenant_id=tid, framework=framework, control_id=control_id,
                                             author=self.actor(request), body=body[:5000])
        _audit(request, tid, "comment.add", f"{framework}:{control_id}", {"comment_id": str(m.id)})
        return Response({"id": str(m.id), "author": m.author, "body": m.body, "created_at": m.created_at}, status=201)


# ----------------------------------------------------------------- remediation

def _rem_dict(r: NcaRemediation) -> dict:
    return {"id": str(r.id), "check_id": r.check_id, "resource_id": r.resource_id, "resource_name": r.resource_name,
            "region": r.region, "action": r.action, "mode": r.mode, "status": r.status, "requested_by": r.requested_by,
            "authorization_reason": r.authorization_reason, "plan": r.plan, "before": r.before, "after": r.after,
            "verification": r.verification, "error": r.error, "dry_run_id": str(r.dry_run_id) if r.dry_run_id else None,
            "created_at": r.created_at, "finished_at": r.finished_at}


class RemediationsView(NcaBase):
    def get(self, request):
        tid = self.tenant_id(request)
        qs = NcaRemediation.objects.filter(tenant_id=tid)
        if request.query_params.get("check_id"):
            qs = qs.filter(check_id=request.query_params["check_id"])
        return Response(_page(request, qs, _rem_dict, default=100))


class RemediationDryRunView(NcaBase):
    required_permissions = [Permissions.MANAGE_SCANS]

    def post(self, request):
        tid = self.tenant_id(request)
        f = NcaFinding.objects.filter(pk=request.data.get("finding_id"), assessment__tenant_id=tid).select_related("assessment").first()
        if not f:
            return Response({"detail": "Finding not found."}, status=404)
        try:
            rec = dry_run(f, self.actor(request), tid)
        except RemediationBlocked as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(_rem_dict(rec), status=201)


class RemediationExecuteView(NcaBase):
    required_permissions = [Permissions.MANAGE_SCANS, Permissions.MANAGE_PROVIDERS]

    def post(self, request):
        tid = self.tenant_id(request)
        f = NcaFinding.objects.filter(pk=request.data.get("finding_id"), assessment__tenant_id=tid).select_related("assessment").first()
        if not f:
            return Response({"detail": "Finding not found."}, status=404)
        rec = execute_remediation(f, request.data.get("dry_run_id"), self.actor(request),
                                  request.data.get("confirmation") or "", request.data.get("reason") or "", tid)
        code = http.HTTP_200_OK if rec.status in ("succeeded", "unverified") else http.HTTP_409_CONFLICT if rec.status == "blocked" else 500
        return Response(_rem_dict(rec), status=code)


class AuditLogView(NcaBase):
    def get(self, request):
        tid = self.tenant_id(request)
        qs = NcaAuditLog.objects.filter(tenant_id=tid)
        return Response(_page(request, qs, lambda x: {"id": x.id, "actor": x.actor, "action": x.action, "target": x.target,
                                                       "details": x.details, "created_at": x.created_at}, default=100))
