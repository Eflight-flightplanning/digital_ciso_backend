"""CIS Oracle SaaS assessment REST API (plain JSON; mounted at /api/v1/oracle-cis/).

Every query is filtered on the caller's tenant. Permissions (platform RBAC):
  manage_scans      start an assessment
  manage_providers  change the connection, reveal usernames and IPs, remediate accounts
  manage_integrations  raise Jira tickets
"""
import csv
import json
import os
import threading

from django.db import IntegrityError
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from cis_checks.base import env_int, env_list
from cis_checks.fusion_client import FusionClient
from cis_checks.registry import load_metadata

from . import connections, jira, services
from .masking import mask, mask_user
from .models import OcisIdentity, OcisJiraTicket, OcisRemediation, OcisRun

RUN_IN_THREAD = os.environ.get("ORACLE_CIS_RUN_IN_THREAD", "true").lower() != "false"


def remediation_live():
    """Remediation is staged (recorded, not sent) unless ORACLE_CIS_REMEDIATION_LIVE=true."""
    return os.environ.get("ORACLE_CIS_REMEDIATION_LIVE", "false").strip().lower() in ("1", "true", "yes", "on")


def has_perm(request, name):
    from api.rbac.permissions import HasPermissions, Permissions

    class _View:
        required_permissions = [Permissions(name)]

    return HasPermissions().has_permission(request, _View())


class OcisBase(APIView):
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser]
    permission_classes = [IsAuthenticated]

    def tenant_id(self, request):
        from api.v1.jira_views import resolve_tenant

        tenant = resolve_tenant(request)
        if tenant is None:
            raise PermissionDenied("No organisation found for this user.")
        return tenant.id

    @staticmethod
    def actor(request):
        return getattr(request.user, "email", None) or str(request.user)

    def require(self, request, name):
        if not has_perm(request, name):
            raise PermissionDenied(f"This needs the {name.replace('_', ' ')} permission.")

    def wants_reveal(self, request):
        """?reveal=true returns unmasked usernames and IPs (manage_providers)."""
        reveal = request.query_params.get("reveal", "").lower() == "true"
        if reveal:
            self.require(request, "manage_providers")
        return reveal

    def run_or_404(self, request, pk):
        run = OcisRun.objects.filter(pk=pk, tenant_id=self.tenant_id(request)).first()
        if run is None:
            raise NotFound("Run not found.")
        return run


# ---------------------------------------------------------------- serialising

def result_data(r, reveal):
    return {
        "id": r.id, "control_id": r.control_id, "check_id": r.check_id, "title": r.title, "level": r.level,
        "section": r.section, "section_name": r.section_name, "severity": r.severity, "automation": r.automation,
        "raw_status": r.raw_status, "status": r.status, "flags": r.flags,
        "reason": r.reason if reveal else mask(r.reason),
        "checked_at": r.checked_at, "evidence": r.evidence if reveal else mask(r.evidence),
        "not_assessed": services.is_manual_control(r),
    }


def run_summary(run, total_checks=None):
    return {
        "id": run.id, "started_at": run.started_at, "finished_at": run.finished_at, "status": run.status,
        "started_by": run.started_by or None, "trigger": run.trigger, "tenant": run.tenant_name,
        # Recomputed from the stored results for finished runs.
        "counts": run.counts if run.status == OcisRun.RUNNING else services.effective_counts(run),
        "error": run.error,
        "progress": {"done": run.results.count(), "total": total_checks if total_checks is not None else len(load_metadata())},
    }


def run_detail(run, reveal):
    data = run_summary(run)
    data["results"] = [result_data(r, reveal) for r in sorted(run.results.all(), key=services.sort_key)]
    data["identity_summary"] = services.identity_summary(run)
    data["revealed"] = reveal
    return data


# ---------------------------------------------------------------- runs

class RunsView(OcisBase):
    def get(self, request):
        total = len(load_metadata())
        qs = OcisRun.objects.filter(tenant_id=self.tenant_id(request)).prefetch_related("results")[:200]
        return Response([run_summary(r, total) for r in qs])

    def post(self, request):
        self.require(request, "manage_scans")
        tid = self.tenant_id(request)
        try:
            run = services.start_run(tid, user=self.actor(request), trigger="web")
        except IntegrityError:
            running = OcisRun.objects.filter(tenant_id=tid, status=OcisRun.RUNNING).first()
            return Response({"detail": "An assessment is already running.", "running_id": running.id if running else None},
                            status=http.HTTP_409_CONFLICT)
        if RUN_IN_THREAD:
            threading.Thread(target=services.execute_run_in_thread, args=(run.id,), daemon=True).start()
        else:
            services.execute_run(run.id)
        return Response({"id": run.id}, status=http.HTTP_202_ACCEPTED)


class RunLatestView(OcisBase):
    def get(self, request):
        tid = self.tenant_id(request)
        reveal = self.wants_reveal(request)
        run = OcisRun.objects.filter(tenant_id=tid).exclude(status=OcisRun.RUNNING).first()
        running = OcisRun.objects.filter(tenant_id=tid, status=OcisRun.RUNNING).first()
        if run is None:
            return Response({"detail": "No assessment has been run yet.", "running": run_summary(running) if running else None},
                            status=http.HTTP_404_NOT_FOUND)
        data = run_detail(run, reveal)
        data["running"] = run_summary(running) if running else None
        return Response(data)


class RunDetailView(OcisBase):
    def get(self, request, pk):
        return Response(run_detail(self.run_or_404(request, pk), self.wants_reveal(request)))


EXPORT_FIELDS = [
    "control_id", "title", "section", "section_name", "level", "severity", "automation", "status", "raw_status", "flags",
    "reason", "checked_at",
]


def export_rows(run, reveal):
    rows = []
    for r in sorted(run.results.all(), key=lambda x: services.cis_key(x.control_id)):
        rows.append({
            "control_id": r.control_id, "title": r.title, "section": r.section, "section_name": r.section_name,
            "level": r.level, "severity": r.severity, "automation": r.automation, "status": r.status,
            "manual_control": services.is_manual_control(r), "raw_status": r.raw_status, "flags": r.flags,
            "reason": r.reason if reveal else mask(r.reason),
            "checked_at": r.checked_at.isoformat() if r.checked_at else None,
            "evidence": r.evidence if reveal else mask(r.evidence),
        })
    return rows


class RunExportCsvView(OcisBase):
    def get(self, request, pk):
        run = self.run_or_404(request, pk)
        rows = export_rows(run, self.wants_reveal(request))
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="cis-oracle-saas-run-{run.id}.csv"'
        response.write("﻿")  # Excel-friendly BOM
        writer = csv.DictWriter(response, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "flags": ";".join(row["flags"])})
        return response


class RunExportJsonView(OcisBase):
    def get(self, request, pk):
        run = self.run_or_404(request, pk)
        reveal = self.wants_reveal(request)
        payload = {
            "benchmark": services.BENCHMARK,
            "severity_note": services.SEVERITY_LABEL,
            "run": run_summary(run),
            "masked": not reveal,
            "results": export_rows(run, reveal),
        }
        response = JsonResponse(payload, json_dumps_params={"indent": 2})
        response["Content-Disposition"] = f'attachment; filename="cis-oracle-saas-run-{run.id}.json"'
        return response


class RunsCompareView(OcisBase):
    def get(self, request):
        try:
            a = self.run_or_404(request, int(request.query_params.get("a", "")))
            b = self.run_or_404(request, int(request.query_params.get("b", "")))
        except ValueError:
            return Response({"detail": "Pass two run ids as ?a=ID&b=ID."}, status=http.HTTP_400_BAD_REQUEST)
        return Response({"a": a.id, "b": b.id, "changed": services.compare_runs(a, b)})


# ---------------------------------------------------------------- catalogue, health

class ControlsView(OcisBase):
    def get(self, request):
        return Response({"severity_label": services.SEVERITY_LABEL, "controls": services.catalog()})


class HealthView(OcisBase):
    def get(self, request):
        from cis_checks import prowler_bridge

        tid = self.tenant_id(request)
        conn = connections.resolved(tid)
        actors = env_list("EXCLUDE_ACTORS")
        reveal = request.query_params.get("reveal", "").lower() == "true" and has_perm(request, "manage_providers")
        meta = load_metadata()
        root, python = prowler_bridge.settings()
        return Response({
            "idcs": {"URL": bool(conn["idcs_base"][0]), "Client ID": bool(conn["idcs_client_id"][0]), "Client secret": bool(conn["idcs_client_secret"][0])},
            "fusion": {"Pod URL": bool(conn["fusion_pod_url"][0]), "Username": bool(conn["fusion_username"][0]), "Password": bool(conn["fusion_password"][0])},
            "check_engine": {"Checks folder": bool(root), "Checks Python": bool(python)},
            "jira": {"Integration": jira.settings(tid)["service"] is not None, "Default project": bool(jira.settings(tid)["project"])},
            "remediation_live": remediation_live(),
            "tenant": connections.tenant_label(tid),
            "excluded_actors": actors if reveal else [mask_user(a) for a in actors],
            "settings": {
                "DORMANT_DAYS": env_int("DORMANT_DAYS", 90),
                "ROLE_REVIEW_DAYS": env_int("ROLE_REVIEW_DAYS", 30),
                "FUSION_ESS_TIMEOUT": env_int("FUSION_ESS_TIMEOUT", 600),
                "EVENT_WINDOW_DAYS": env_int("EVENT_WINDOW_DAYS", 30),
                "ADMIN_GROUPS": env_list("ADMIN_GROUPS", "Administrators,Domain_Administrators"),
            },
            "checks": {
                "total": len(meta),
                "automated": sum(m["Automation"] == "automated" for m in meta),
                "partial": sum(m["Automation"] == "partial" for m in meta),
                "manual_only": sum(m["Automation"] == "none" for m in meta),
            },
            "permissions": {
                "manage_scans": has_perm(request, "manage_scans"),
                "manage_providers": has_perm(request, "manage_providers"),
                "manage_integrations": has_perm(request, "manage_integrations"),
            },
            "severity_label": services.SEVERITY_LABEL,
        })


# ---------------------------------------------------------------- connection (the tenant's Oracle SaaS provider)

URL_FIELDS = {"idcs_base", "fusion_pod_url"}
SECRET_FIELDS = {"idcs_client_secret", "fusion_password"}


class ConnectionView(OcisBase):
    def get(self, request):
        return Response(connections.public_view(self.tenant_id(request)))

    def put(self, request):
        self.require(request, "manage_providers")
        tid = self.tenant_id(request)
        values, errors = {}, {}
        for name in connections.FIELDS:
            if name not in request.data:
                continue
            value = str(request.data.get(name) or "")
            if name in URL_FIELDS:
                value = value.strip().rstrip("/")
                if value and not value.lower().startswith("https://"):
                    errors[name] = "Use the full https:// address."
                    continue
            values[name] = value
        if errors:
            return Response(errors, status=http.HTTP_400_BAD_REQUEST)
        clear = [n for n in SECRET_FIELDS if request.data.get(f"clear_{n}")]
        try:
            connections.save(tid, values, clear)
        except Exception as exc:  # e.g. the platform's provider URL validation
            message = getattr(exc, "message_dict", None) or str(exc)
            return Response({"detail": message}, status=http.HTTP_400_BAD_REQUEST)
        return Response(connections.public_view(tid))


class ConnectionTestView(OcisBase):
    def post(self, request):
        """An OAuth token and one Users read for IDCS; one HCM REST read for Fusion."""
        tid = self.tenant_id(request)
        target = request.data.get("target")
        try:
            if target == "idcs":
                api = connections.idcs_client(tid)
                if not api.configured:
                    return Response({"ok": False, "message": "Enter the identity domain URL, client ID and client secret first."})
                api.get("/admin/v1/Users", {"count": 1, "attributes": "id"})
                return Response({"ok": True, "message": "Connected: signed in and read the Users list."})
            if target == "fusion":
                client = connections.fusion_client(tid)
                if not client.configured:
                    return Response({"ok": False, "message": "Enter the pod URL, username and password first."})
                client._request("GET", "/hcmRestApi/resources/11.13.18.05/userAccounts?limit=1&onlyData=true&fields=Username")
                return Response({"ok": True, "message": "Connected: read one HCM user account."})
        except Exception as exc:
            return Response({"ok": False, "message": f"{type(exc).__name__}: {exc}"[:300]})
        return Response({"detail": "target must be idcs or fusion."}, status=http.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------- identity risks (1.14 dormant, 5.3.7 ghost employees)

CONFIRM_WORD = {OcisRemediation.SUSPEND_USER: "SUSPEND", OcisRemediation.REVOKE_ROLE: "REVOKE"}


def ticket_data(t):
    return {
        "id": t.id, "key": t.key, "url": t.url, "status": t.status, "status_category": t.status_category,
        "assignee": t.assignee, "priority": t.priority, "created_at": t.created_at, "synced_at": t.synced_at,
    }


def remediation_data(r):
    return {
        "id": r.id, "action": r.action, "role_code": r.role_code, "status": r.status, "request": r.request,
        "error": r.error, "user": r.user or None, "created_at": r.created_at, "executed_at": r.executed_at,
    }


def history_for(tenant_id, kind, usernames):
    """Tickets and remediations for these accounts across all runs (newest first), keyed by username."""
    tickets, remediations = {}, {}
    for t in OcisJiraTicket.objects.filter(tenant_id=tenant_id, identity__kind=kind, identity__username__in=usernames).select_related("identity"):
        tickets.setdefault(t.identity.username, []).append(ticket_data(t))
    for r in OcisRemediation.objects.filter(tenant_id=tenant_id, identity__kind=kind, identity__username__in=usernames).select_related("identity"):
        remediations.setdefault(r.identity.username, []).append(remediation_data(r))
    return tickets, remediations


def identity_data(f, reveal, tickets, remediations):
    details = f.details if reveal else mask(f.details)
    if not reveal and details.get("person_number"):
        details["person_number"] = f"***{str(details['person_number'])[-4:]}"
    rem = remediations.get(f.username, [])
    executed = next((r for r in rem if r["status"] == OcisRemediation.EXECUTED), None)
    return {
        "id": f.id,
        "kind": f.kind,
        "control_id": f.control_id,
        "username": f.username if reveal else mask_user(f.username),
        "can_remediate": bool(f.guid),
        "details": details,
        "tickets": tickets.get(f.username, []),
        "remediations": rem,
        "state": "remediated" if executed else ("staged" if rem else ("ticketed" if tickets.get(f.username) else "open")),
    }


class IdentitiesView(OcisBase):
    def get(self, request):
        tid = self.tenant_id(request)
        reveal = self.wants_reveal(request)
        kind = request.query_params.get("kind", OcisIdentity.DORMANT)
        if kind not in dict(OcisIdentity.KINDS):
            return Response({"detail": "kind must be dormant or ghost."}, status=http.HTTP_400_BAD_REQUEST)
        run_id = request.query_params.get("run")
        if run_id:
            run = self.run_or_404(request, run_id)
        else:
            run = OcisRun.objects.filter(tenant_id=tid, status=OcisRun.FINISHED).first()
        base = {"kind": kind, "jira_configured": jira.configured(tid), "remediation_live": remediation_live()}
        if run is None:
            return Response({**base, "run": None, "total": 0, "counts": {}, "results": []})

        qs = OcisIdentity.objects.filter(run=run, kind=kind)
        text = request.query_params.get("q", "").strip()
        if text:
            # Names are only searchable when revealed, so masked lists can't be probed by guessing names.
            qs = qs.filter(Q(username__icontains=text) | Q(details__icontains=text)) if reveal else qs.filter(details__icontains=text)
        rows = list(qs)
        min_days = request.query_params.get("min_days")
        if min_days and min_days.isdigit():
            rows = [f for f in rows if (f.details.get("days_inactive") or 0) >= int(min_days)]
        if request.query_params.get("privileged") == "true":
            rows = [f for f in rows if f.details.get("privileged")]
        if kind == OcisIdentity.DORMANT:
            rows.sort(key=lambda f: (not f.details.get("privileged"), -(f.details.get("days_inactive") or 0)))
        elif kind == OcisIdentity.ACTIVE:
            rows.sort(key=lambda f: (not f.details.get("privileged"), f.details.get("days_inactive") if f.details.get("days_inactive") is not None else 10**6))

        page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
        page = max(int(request.query_params.get("page", 1) or 1), 1)
        page_rows = rows[(page - 1) * page_size: page * page_size]
        tickets, remediations = history_for(tid, kind, [f.username for f in page_rows])
        counts = {k: OcisIdentity.objects.filter(run=run, kind=k).count() for k, _ in OcisIdentity.KINDS}
        return Response({
            **base,
            "run": {"id": run.id, "finished_at": run.finished_at, "tenant": run.tenant_name},
            "total": len(rows),
            "page": page,
            "page_size": page_size,
            "counts": counts,
            "summary": services.identity_summary(run),
            "revealed": reveal,
            "results": [identity_data(f, reveal, tickets, remediations) for f in page_rows],
        })


def identity_or_404(view, request, pk):
    f = OcisIdentity.objects.filter(pk=pk, tenant_id=view.tenant_id(request)).first()
    if f is None:
        raise NotFound("Account not found.")
    return f


def ticket_text(f, action_request=None):
    d = f.details
    if f.kind == OcisIdentity.DORMANT:
        summary = f"[Oracle SaaS IAM] Dormant account {f.username}: inactive {d.get('days_inactive', '?')} days"
        lines = [
            f"CIS Oracle SaaS 1.14: account '{f.username}' has been inactive for {d.get('days_inactive', '?')} days "
            f"(last sign-in: {d.get('last_sign_in') or 'never'}).",
            "Privileged account." if d.get("privileged") else "",
            "Required action: confirm whether the account is still needed; if not, suspend it (keeps the audit trail).",
        ]
    else:
        roles = ", ".join(d.get("payroll_roles", []) + d.get("timecard_roles", []))
        summary = f"[Oracle SaaS SoD] Potential ghost employee access: {f.username}"
        lines = [
            f"CIS Oracle SaaS 5.3.7: user '{f.username}' can hire employees ({', '.join(d.get('hire_roles', []))}) "
            f"and also manage payroll or time cards ({roles}). One person could create and pay a ghost employee.",
            "Required action: revoke the payroll/time-card role, or document a compensating control and monitor the user's transactions.",
        ]
    code = json.dumps(action_request, indent=2) if action_request else None
    if code:
        lines.append("Prepared Fusion HCM REST remediation request:")
    lines.append("Raised from the Digital CISO CIS Oracle SaaS assessment.")
    return summary, lines, code


class CreateTicketView(OcisBase):
    def post(self, request, pk):
        self.require(request, "manage_integrations")
        f = identity_or_404(self, request, pk)
        cfg = jira.settings(f.tenant_id)
        if cfg["service"] is None or not cfg["project"]:
            return Response({"detail": "Jira is not configured for this organisation: set it up, with a default project, on the Integrations page."},
                            status=http.HTTP_400_BAD_REQUEST)
        proposed = FusionClient.suspend_request(f.guid) if f.guid and f.kind == OcisIdentity.DORMANT else None
        summary, lines, code = ticket_text(f, proposed)
        priority = request.data.get("priority") or ("Highest" if f.details.get("privileged") else "High")
        labels = ["digital-ciso", "oracle-saas", "cis-" + f.control_id.replace(".", "-"), f.kind]
        service = cfg["service"]
        try:
            created = service.create_issue(cfg["project"], summary, jira.adf(lines, code), issue_type=cfg["issue_type"],
                                           priority=priority, labels=labels)
            info = service.get_issue(created["key"])
        except Exception as exc:  # api.jira_service.JiraServiceError, or a connection error
            return Response({"detail": jira.error_text(exc)}, status=http.HTTP_502_BAD_GATEWAY)
        execution_id = jira.record_execution(
            f.tenant_id, created, info, summary, "\n".join(l for l in lines if l), priority, labels,
            {"source": "oracle_cis", "control_id": f.control_id, "identity_id": f.id, "kind": f.kind}, self.actor(request),
        )
        t = OcisJiraTicket.objects.create(
            identity=f, tenant_id=f.tenant_id, key=created["key"], url=created["url"], summary=summary[:255],
            user=self.actor(request), status=info["status"], status_category=info["status_category_key"],
            assignee=info.get("assignee_name") or "", priority=info.get("priority") or priority,
            remediation_execution_id=execution_id, synced_at=timezone.now(),
        )
        return Response(ticket_data(t), status=http.HTTP_201_CREATED)


class RefreshTicketView(OcisBase):
    def post(self, request, pk):
        t = OcisJiraTicket.objects.filter(pk=pk, tenant_id=self.tenant_id(request)).first()
        if t is None:
            raise NotFound("Ticket not found.")
        service = jira.settings(t.tenant_id)["service"]
        if service is None:
            return Response({"detail": "Jira is not configured for this organisation."}, status=http.HTTP_400_BAD_REQUEST)
        try:
            info = service.get_issue(t.key)
        except Exception as exc:  # api.jira_service.JiraServiceError, or a connection error
            return Response({"detail": jira.error_text(exc)}, status=http.HTTP_502_BAD_GATEWAY)
        t.status, t.status_category = info["status"], info["status_category_key"]
        t.assignee, t.priority = info.get("assignee_name") or "", info.get("priority") or t.priority
        t.synced_at = timezone.now()
        t.save()
        return Response(ticket_data(t))


class RemediateView(OcisBase):
    def post(self, request, pk):
        self.require(request, "manage_providers")
        f = identity_or_404(self, request, pk)
        action = request.data.get("action")
        if action not in CONFIRM_WORD:
            return Response({"detail": "action must be suspend_user or revoke_role."}, status=http.HTTP_400_BAD_REQUEST)
        if not f.guid:
            return Response({"detail": "This account has no Fusion GUID (no Fusion pod data), so it cannot be remediated from here."},
                            status=http.HTTP_400_BAD_REQUEST)
        role_code = ""
        if action == OcisRemediation.SUSPEND_USER:
            req = FusionClient.suspend_request(f.guid)
        else:
            role_code = request.data.get("role_code", "")
            role = next((r for r in f.details.get("revocable_roles", []) if r["code"] == role_code), None)
            if not role or not role.get("user_role_id"):
                return Response({"detail": "Choose one of the account's payroll or time-card roles to revoke."}, status=http.HTTP_400_BAD_REQUEST)
            req = FusionClient.revoke_role_request(f.guid, role["user_role_id"])

        execute = bool(request.data.get("execute"))
        if execute and not remediation_live():
            return Response({"detail": "Live remediation is disabled. Set ORACLE_CIS_REMEDIATION_LIVE=true to send requests to the pod."},
                            status=http.HTTP_403_FORBIDDEN)
        if execute and request.data.get("confirm") != CONFIRM_WORD[action]:
            return Response({"detail": f"Type {CONFIRM_WORD[action]} to confirm."}, status=http.HTTP_400_BAD_REQUEST)

        r = OcisRemediation.objects.create(identity=f, tenant_id=f.tenant_id, action=action, role_code=role_code, request=req,
                                           user=self.actor(request))
        if execute:
            try:
                connections.fusion_client(f.tenant_id).execute(req)
                r.status, r.executed_at = OcisRemediation.EXECUTED, timezone.now()
            except Exception as exc:
                r.status, r.error = OcisRemediation.FAILED, f"{type(exc).__name__}: {exc}"[:500]
            r.save()

        # Keep the account's Jira ticket up to date.
        comment_error = None
        ticket = OcisJiraTicket.objects.filter(tenant_id=f.tenant_id, identity__kind=f.kind, identity__username=f.username).first()
        service = jira.settings(f.tenant_id)["service"] if ticket else None
        if ticket and service:
            verb = {"staged": "staged (not yet sent)", "executed": "executed on the Fusion pod", "failed": "FAILED"}[r.status]
            what = "Suspend account" if action == OcisRemediation.SUSPEND_USER else f"Revoke role {role_code}"
            try:
                jira.add_comment(service, ticket.key, [f"Remediation {verb}: {what} for '{f.username}' by {self.actor(request)}.", r.error],
                                 json.dumps(req, indent=2))
            except Exception as exc:  # api.jira_service.JiraServiceError, or a connection error
                comment_error = jira.error_text(exc)
        data = remediation_data(r)
        data["jira_comment_error"] = comment_error
        return Response(data, status=http.HTTP_201_CREATED if r.status != OcisRemediation.FAILED else http.HTTP_502_BAD_GATEWAY)
