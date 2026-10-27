"""DB-backed tests of the REST API: runs, tenant isolation, masking, connection, identity risks, Jira and remediation.
The identity domain, the Fusion pod, the platform's tenant/RBAC helpers, provider secret and Jira are all faked."""
import uuid
from contextlib import ExitStack
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from oracle_cis import services
from oracle_cis.models import OcisIdentity, OcisJiraTicket, OcisRemediation, OcisRun

from .fakes import NO_FUSION, FakeFusion, FakeIdcs

TENANT = uuid.uuid4()
OTHER_TENANT = uuid.uuid4()
ALL_PERMS = {"manage_scans", "manage_providers", "manage_integrations"}


class FakeUser:
    is_authenticated = True

    def __init__(self, email="analyst@example.com"):
        self.email = email

    def __str__(self):
        return self.email


class FakeJira:
    base_url = "https://jira.example.com"

    def __init__(self):
        self.created, self.comments = [], []

    def create_issue(self, project_key, summary, description_adf, issue_type="Task", priority="Medium", assignee_account_id=None, labels=None):
        self.created.append({"project": project_key, "summary": summary, "labels": labels, "priority": priority})
        key = f"{project_key}-{len(self.created)}"
        return {"key": key, "id": "1", "url": f"{self.base_url}/browse/{key}", "project_key": project_key, "summary": summary}

    def get_issue(self, key):
        return {"key": key, "status": "To Do", "status_category_key": "new", "assignee_name": None, "priority": "High"}

    def _request(self, method, endpoint, params=None, data=None):
        self.comments.append(endpoint)
        return {}


class ApiCase(TestCase):
    perms = ALL_PERMS

    def setUp(self):
        self.tenant = TENANT
        self.jira = FakeJira()
        self.saved = []
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(mock.patch("oracle_cis.views.OcisBase.tenant_id", lambda view, request: self.tenant))
        stack.enter_context(mock.patch("oracle_cis.views.has_perm", lambda request, name: name in self.perms))
        stack.enter_context(mock.patch("oracle_cis.connections.tenant_label", lambda tid: "idcs-test"))
        stack.enter_context(mock.patch("oracle_cis.connections.idcs_client", lambda tid: FakeIdcs()))
        stack.enter_context(mock.patch("oracle_cis.connections.fusion_client", lambda tid: NO_FUSION))
        stack.enter_context(mock.patch("oracle_cis.jira.settings", lambda tid: {"service": self.jira, "project": "SEC", "issue_type": "Task"}))
        stack.enter_context(mock.patch("oracle_cis.jira.record_execution", lambda *a, **k: uuid.uuid4()))
        stack.enter_context(mock.patch("oracle_cis.connections.save", lambda tid, values, clear=(): self.saved.append((tid, values, list(clear)))))
        stack.enter_context(mock.patch("oracle_cis.connections.public_view", lambda tid: {"idcs": {}, "fusion": {}, "provider": None}))
        self.client = APIClient()
        self.client.force_authenticate(FakeUser())

    def start_run(self):
        response = self.client.post("/api/v1/oracle-cis/runs", {}, format="json")
        self.assertEqual(response.status_code, 202, response.content)
        return OcisRun.objects.get(pk=response.json()["id"])


class RunTests(ApiCase):
    def test_run_stores_every_control_for_the_tenant(self):
        run = self.start_run()
        self.assertEqual(run.status, OcisRun.FINISHED)
        self.assertEqual(run.tenant_id, TENANT)
        self.assertEqual(run.started_by, "analyst@example.com")
        self.assertEqual(run.results.count(), 44)
        self.assertEqual(run.counts["total"], 44)

        latest = self.client.get("/api/v1/oracle-cis/runs/latest").json()
        self.assertEqual(latest["id"], run.id)
        ids = [r["control_id"] for r in latest["results"]]
        self.assertEqual(ids, sorted(ids, key=lambda c: tuple(int(p) for p in c.split("."))))  # CIS order
        self.assertEqual(ids[:3], ["1.1", "1.2", "1.3"])
        self.assertIn("identity_summary", latest)
        self.assertFalse(latest["revealed"])

    def test_one_running_run_per_tenant(self):
        OcisRun.objects.create(tenant_id=TENANT)
        response = self.client.post("/api/v1/oracle-cis/runs", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.tenant = OTHER_TENANT  # another tenant may still run
        self.assertEqual(self.client.post("/api/v1/oracle-cis/runs", {}, format="json").status_code, 202)

    def test_other_tenant_sees_nothing(self):
        run = self.start_run()
        self.tenant = OTHER_TENANT
        self.assertEqual(self.client.get(f"/api/v1/oracle-cis/runs/{run.id}").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/oracle-cis/runs").json(), [])
        self.assertEqual(self.client.get("/api/v1/oracle-cis/runs/latest").status_code, 404)

    def test_exports_and_compare(self):
        a, b = self.start_run(), self.start_run()
        csv_response = self.client.get(f"/api/v1/oracle-cis/runs/{a.id}/export.csv")
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("control_id,title", csv_response.content.decode("utf-8-sig"))
        data = self.client.get(f"/api/v1/oracle-cis/runs/{a.id}/export.json").json()
        self.assertTrue(data["masked"])
        self.assertEqual(len(data["results"]), 44)
        compare = self.client.get(f"/api/v1/oracle-cis/runs/compare?a={a.id}&b={b.id}").json()
        self.assertEqual(compare["changed"], [])

    def test_controls_and_health(self):
        controls = self.client.get("/api/v1/oracle-cis/controls").json()["controls"]
        self.assertEqual(len(controls), 44)
        with mock.patch("oracle_cis.connections.resolved", lambda tid: {n: ("", None) for n in
                        ("idcs_base", "idcs_client_id", "idcs_client_secret", "fusion_pod_url", "fusion_username", "fusion_password")}):
            health = self.client.get("/api/v1/oracle-cis/health").json()
        self.assertEqual(health["checks"]["total"], 44)
        self.assertTrue(health["jira"]["Integration"])
        self.assertFalse(health["remediation_live"])


class PermissionTests(ApiCase):
    perms = set()

    def test_viewer_cannot_run_reveal_or_change_connection(self):
        self.assertEqual(self.client.post("/api/v1/oracle-cis/runs", {}, format="json").status_code, 403)
        OcisRun.objects.create(tenant_id=TENANT, status=OcisRun.FINISHED)
        self.assertEqual(self.client.get("/api/v1/oracle-cis/runs/latest?reveal=true").status_code, 403)
        self.assertEqual(self.client.put("/api/v1/oracle-cis/connection", {"fusion_pod_url": "https://x"}, format="json").status_code, 403)
        self.assertEqual(self.saved, [])


class ConnectionTests(ApiCase):
    def test_saves_to_the_provider_and_rejects_http(self):
        bad = self.client.put("/api/v1/oracle-cis/connection", {"idcs_base": "http://idcs.example.com"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.put(
            "/api/v1/oracle-cis/connection",
            {"idcs_base": "https://idcs-x.identity.oraclecloud.com/", "fusion_password": "pw", "clear_idcs_client_secret": True},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.content)
        tid, values, clear = self.saved[-1]
        self.assertEqual(tid, TENANT)
        self.assertEqual(values["idcs_base"], "https://idcs-x.identity.oraclecloud.com")
        self.assertEqual(values["fusion_password"], "pw")
        self.assertEqual(clear, ["idcs_client_secret"])
        self.assertNotIn("pw", ok.content.decode())


def fusion_with_dormant_and_ghost():
    roles = [
        {"user": "ghost.user", "guid": "G-1", "person_number": "1234567", "suspended": False, "roles": [
            {"code": "ORA_PER_HUMAN_RESOURCE_SPECIALIST_JOB", "user_role_id": "R1", "assigned": "2020-01-01T00:00:00+00:00", "assigned_by": "A"},
            {"code": "ORA_PAY_PAYROLL_MANAGER_JOB", "user_role_id": "R2", "assigned": "2020-01-01T00:00:00+00:00", "assigned_by": "A"},
        ]},
    ]
    records = [{"user": "old.user", "days_inactive": 200, "last_sign_in": "2025-01-01", "suspended": False}]
    return FakeFusion(records=records, roles=roles)


class IdentityRiskTests(ApiCase):
    def setUp(self):
        super().setUp()
        fusion = fusion_with_dormant_and_ghost()
        patcher = mock.patch("oracle_cis.connections.fusion_client", lambda tid: fusion)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.run_ = self.start_run()

    def test_active_accounts_and_summary(self):
        data = self.client.get("/api/v1/oracle-cis/identities?kind=active").json()
        self.assertEqual(data["summary"]["dormant"], 1)
        self.assertEqual(data["summary"]["monitored"], data["summary"]["dormant"] + data["summary"]["active"])

    def test_lists_are_stored_and_masked(self):
        ghost = self.client.get("/api/v1/oracle-cis/identities?kind=ghost").json()
        self.assertEqual(ghost["total"], 1)
        row = ghost["results"][0]
        self.assertEqual(row["username"], "gh***")
        self.assertTrue(row["can_remediate"])
        revealed = self.client.get("/api/v1/oracle-cis/identities?kind=ghost&reveal=true").json()
        self.assertEqual(revealed["results"][0]["username"], "ghost.user")

    def test_ticket_and_staged_remediation(self):
        ident = OcisIdentity.objects.get(run=self.run_, kind=OcisIdentity.GHOST)
        ticket = self.client.post(f"/api/v1/oracle-cis/identities/{ident.id}/jira", {}, format="json")
        self.assertEqual(ticket.status_code, 201, ticket.content)
        self.assertEqual(ticket.json()["key"], "SEC-1")
        self.assertIn("cis-5-3-7", self.jira.created[0]["labels"])
        self.assertIsNotNone(OcisJiraTicket.objects.get().remediation_execution_id)

        staged = self.client.post(f"/api/v1/oracle-cis/identities/{ident.id}/remediate",
                                  {"action": "revoke_role", "role_code": "ORA_PAY_PAYROLL_MANAGER_JOB"}, format="json")
        self.assertEqual(staged.status_code, 201, staged.content)
        self.assertEqual(staged.json()["status"], OcisRemediation.STAGED)
        self.assertEqual(staged.json()["request"]["method"], "DELETE")
        self.assertTrue(any(c.endswith("/comment") for c in self.jira.comments))

        live = self.client.post(f"/api/v1/oracle-cis/identities/{ident.id}/remediate",
                                {"action": "revoke_role", "role_code": "ORA_PAY_PAYROLL_MANAGER_JOB", "execute": True, "confirm": "REVOKE"},
                                format="json")
        self.assertEqual(live.status_code, 403)  # ORACLE_CIS_REMEDIATION_LIVE is off

    def test_other_tenant_cannot_touch_findings(self):
        ident = OcisIdentity.objects.filter(run=self.run_).first()
        self.tenant = OTHER_TENANT
        self.assertEqual(self.client.post(f"/api/v1/oracle-cis/identities/{ident.id}/jira", {}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/oracle-cis/identities/{ident.id}/remediate", {"action": "suspend_user"}, format="json").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/oracle-cis/identities?kind=ghost").json()["total"], 0)


class CountsTests(ApiCase):
    def test_tested_and_manual_controls(self):
        run = self.start_run()  # no Fusion pod: the pod controls could not complete (MANUAL with a flag)
        counts = services.effective_counts(run)
        self.assertEqual(counts["PASS"] + counts["FAIL"] + counts["MANUAL"], 44)
        self.assertEqual(counts["not_completed"], 5)
        self.assertLessEqual(counts["manual_controls"], counts["MANUAL"])  # a tested control can be partly evidenced (MANUAL)
        self.assertEqual(counts["tested"], 13)
        for cid in ("4.1.1", "4.1.3", "4.3", "5.1.2", "5.3.7"):
            r = run.results.get(control_id=cid)
            self.assertEqual(r.status, "MANUAL", cid)
            self.assertIn("automated_check_failed", r.flags, cid)
            self.assertNotIn("requires_other_access", r.flags, cid)
        self.assertEqual(run.results.get(control_id="3.2").status, "MANUAL")
