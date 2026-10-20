"""DB-backed tests: manual workflow, control re-aggregation, remediation gates and the REST API.
OCI is never contacted; remediation calls are mocked."""
import types
import uuid
from datetime import timedelta
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from nca import remediation as rem
from nca.manual import finalize_controls, manual_state_for
from nca.models import (
    NcaAssessment, NcaAuditLog, NcaCheckRun, NcaControlResult, NcaControlReview, NcaFinding, NcaManualEvidence,
    NcaRemediation,
)

class FakeUser:
    is_authenticated = True

    def __init__(self, email):
        self.email = email

    def __str__(self):
        return self.email


FW = "nca_ecc_2.2024"
TENANT = uuid.uuid4()


def make_assessment(check_statuses: dict, frameworks=(FW,)):
    a = NcaAssessment.objects.create(tenant_id=TENANT, frameworks=list(frameworks), status="completed", tenancy_name="T")
    for cid, st in check_statuses.items():
        NcaCheckRun.objects.create(assessment=a, check_id=cid, status=st, severity="high",
                                   reason="NO_RESOURCES" if st == "NOT_APPLICABLE" else "")
    return a


class DbCase(TestCase):
    databases = {"default"}


class ControlAggregationWithManual(DbCase):
    def control(self, a, cid):
        return NcaControlResult.objects.get(assessment=a, framework=FW, control_id=cid)

    def test_manual_only_control_is_manual_and_not_pass(self):
        a = make_assessment({})
        finalize_controls(a)
        c = self.control(a, "1-1-1")
        self.assertEqual((c.status, c.reason), ("MANUAL", "NO_AUTOMATED_CHECK"))

    def test_missing_check_run_is_error_never_pass(self):
        a = make_assessment({})  # control 2-1-5 maps a check that was never executed
        finalize_controls(a)
        self.assertEqual(self.control(a, "2-1-5").status, "ERROR")

    def test_failed_check_fails_control(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "FAIL"})
        finalize_controls(a)
        self.assertEqual(self.control(a, "2-1-5").status, "FAIL")

    def test_all_checks_pass_is_pass_and_manual_means_unscannable_only(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "PASS", "oci_storage_classification_labels": "PASS"})
        finalize_controls(a)
        c = self.control(a, "2-1-5")
        self.assertEqual((c.status, c.automated_result), ("PASS", "PASS"))
        self.assertEqual(self.control(a, "1-1-1").status, "MANUAL")  # no OCI check exists

    def test_no_resources_for_every_check_is_not_tested(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "NOT_APPLICABLE", "oci_storage_classification_labels": "NOT_APPLICABLE"})
        finalize_controls(a)
        self.assertEqual((self.control(a, "2-1-5").status, self.control(a, "2-1-5").reason), ("NOT_APPLICABLE", "NO_RESOURCES"))

    def test_rejected_evidence_still_fails_a_manual_control(self):
        a = make_assessment({})
        ev = NcaManualEvidence.objects.create(tenant_id=TENANT, framework=FW, control_id="1-1-1", title="t", description="d", submitted_by="a")
        NcaControlReview.objects.create(tenant_id=TENANT, framework=FW, control_id="1-1-1", evidence=ev, decision="rejected", reviewer="b")
        finalize_controls(a)
        self.assertEqual(self.control(a, "1-1-1").status, "FAIL")

    def test_new_evidence_resets_approval(self):
        a = make_assessment({})
        ev = NcaManualEvidence.objects.create(tenant_id=TENANT, framework=FW, control_id="1-1-1", title="t", description="d", submitted_by="a")
        NcaControlReview.objects.create(tenant_id=TENANT, framework=FW, control_id="1-1-1", evidence=ev, decision="approved", reviewer="b")
        self.assertEqual(manual_state_for(FW, "1-1-1", TENANT)[0], "approved")
        NcaManualEvidence.objects.create(tenant_id=TENANT, framework=FW, control_id="1-1-1", title="t2", description="d2", submitted_by="a")
        self.assertEqual(manual_state_for(FW, "1-1-1", TENANT)[0], "pending")

    def test_approval_cannot_hide_a_failing_check(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "FAIL"})
        ev = NcaManualEvidence.objects.create(tenant_id=TENANT, framework=FW, control_id="2-1-5", title="t", description="d", submitted_by="a")
        NcaControlReview.objects.create(tenant_id=TENANT, framework=FW, control_id="2-1-5", evidence=ev, decision="approved", reviewer="b")
        finalize_controls(a)
        self.assertEqual(self.control(a, "2-1-5").status, "FAIL")

    def test_accounting_adds_up_and_surfaces_no_resource_checks(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "FAIL", "objectstorage_bucket_not_publicly_accessible": "NOT_APPLICABLE",
                             "kms_key_rotation_enabled": "PASS"})
        acc = finalize_controls(a)["by_framework"][FW]["accounting"]
        self.assertEqual(acc["total"], 199)
        self.assertEqual(acc["scanned"] + acc["manual_only"], 199)
        parts = ["failed", "passed", "no_resources", "not_evaluated", "awaiting_evidence", "awaiting_review"]
        self.assertEqual(sum(acc[k] for k in parts), acc["scanned"])
        self.assertIn("objectstorage_bucket_not_publicly_accessible", acc["no_resource_checks"])
        self.assertGreaterEqual(acc["with_no_resource_checks"], 1)

    def test_summary_keeps_coverage_separate(self):
        a = make_assessment({"objectstorage_bucket_encrypted_with_cmk": "FAIL"})
        s = finalize_controls(a)["by_framework"][FW]
        self.assertEqual(s["controls"]["total"], 199)
        self.assertIn("assessment_coverage_pct", s["coverage"])
        self.assertIn("pass_rate_pct", s["controls"])


class FakeRemediator(rem.Remediator):
    check_id = "objectstorage_bucket_versioning_enabled"
    action = "fake"

    def __init__(self, applies_fix=True):
        self.state = {"versioning": "Disabled"}
        self.applied = 0
        self.applies_fix = applies_fix

    def desired(self):
        return {"versioning": "Enabled"}

    def read_state(self, finding, profile=None):
        return dict(self.state)

    def apply(self, finding, profile=None):
        self.applied += 1
        if self.applies_fix:
            self.state = {"versioning": "Enabled"}


class RemediationGates(DbCase):
    def setUp(self):
        self.a = make_assessment({"objectstorage_bucket_versioning_enabled": "FAIL"})
        run = self.a.check_runs.get()
        self.f = NcaFinding.objects.create(assessment=self.a, check_run=run, check_id=run.check_id, status="FAIL",
                                           resource_id="ns/b1", resource_name="b1", region="uk-london-1")
        self.fake = FakeRemediator()
        p = mock.patch.dict(rem.REMEDIATORS, {self.f.check_id: self.fake})
        p.start()
        self.addCleanup(p.stop)
        self.phrase = rem.confirmation_phrase(self.f)

    def run_exec(self, dr, **kw):
        args = dict(confirmation=self.phrase, reason="approved change ticket CHG-1", tenant_id=TENANT)
        args.update(kw)
        return rem.execute_remediation(self.f, dr.id if dr else None, "admin@x.com", **args)

    def test_dry_run_never_writes(self):
        dr = rem.dry_run(self.f, "admin@x.com", TENANT)
        self.assertEqual((dr.mode, dr.status, self.fake.applied), ("dry_run", "planned", 0))
        self.assertEqual(dr.plan["changes"]["versioning"], {"from": "Disabled", "to": "Enabled"})
        self.assertFalse(dr.plan["writes_to_oci"])

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": ""})
    def test_blocked_when_server_flag_off(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        r = self.run_exec(dr)
        self.assertEqual(r.status, "blocked")
        self.assertEqual(self.fake.applied, 0)

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_blocked_without_dry_run_wrong_phrase_or_reason(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        self.assertEqual(self.run_exec(None).status, "blocked")
        self.assertEqual(self.run_exec(dr, confirmation="yes").status, "blocked")
        self.assertEqual(self.run_exec(dr, reason="x").status, "blocked")
        self.assertEqual(self.fake.applied, 0)

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_stale_dry_run_blocked(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        NcaRemediation.objects.filter(pk=dr.pk).update(created_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.run_exec(dr).status, "blocked")
        self.assertEqual(self.fake.applied, 0)

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_drift_blocks(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        self.fake.state = {"versioning": "Suspended"}
        r = self.run_exec(dr)
        self.assertEqual(r.status, "blocked")
        self.assertIn("drift", r.error)
        self.assertEqual(self.fake.applied, 0)

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_success_records_before_after_verification_and_audit(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        r = self.run_exec(dr)
        self.assertEqual(r.status, "succeeded")
        self.assertEqual((r.before, r.after), ({"versioning": "Disabled"}, {"versioning": "Enabled"}))
        self.assertTrue(r.verification["verified"])
        actions = list(NcaAuditLog.objects.filter(tenant_id=TENANT).values_list("action", flat=True))
        for expected in ("remediation.dry_run", "remediation.execute.start", "remediation.execute.succeeded"):
            self.assertIn(expected, actions)

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_unverified_when_postcondition_not_met(self):
        self.fake.applies_fix = False
        dr = rem.dry_run(self.f, "a", TENANT)
        self.assertEqual(self.run_exec(dr).status, "unverified")

    @mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": "true"})
    def test_api_error_marks_failed(self):
        dr = rem.dry_run(self.f, "a", TENANT)
        self.fake.apply = mock.Mock(side_effect=RuntimeError("403"))
        r = self.run_exec(dr)
        self.assertEqual(r.status, "failed")
        self.assertIn("403", r.error)

    def test_only_fail_findings_and_known_checks(self):
        self.f.status = "PASS"
        with self.assertRaises(rem.RemediationBlocked):
            rem.dry_run(self.f, "a", TENANT)
        self.f.status, self.f.check_id = "FAIL", "identity_user_mfa_enabled_console_access"
        with self.assertRaises(rem.RemediationBlocked):
            rem.dry_run(self.f, "a", TENANT)

    def test_audit_log_is_append_only(self):
        e = NcaAuditLog.objects.create(tenant_id=TENANT, actor="a", action="x")
        with self.assertRaises(PermissionError):
            e.delete()
        e.action = "y"
        with self.assertRaises(PermissionError):
            e.save()


# ---------------------------------------------------------------- API

class ApiCase(DbCase):
    def setUp(self):
        self.tenant = types.SimpleNamespace(id=TENANT)
        self.user = FakeUser(f"u1-{uuid.uuid4().hex[:6]}@example.com")
        self.user2 = FakeUser(f"u2-{uuid.uuid4().hex[:6]}@example.com")
        self.c1, self.c2, self.anon = APIClient(), APIClient(), APIClient()
        self.c1.force_authenticate(self.user)
        self.c2.force_authenticate(self.user2)
        patcher = mock.patch("nca.views.resolve_tenant", return_value=self.tenant)
        patcher.start()
        self.addCleanup(patcher.stop)
        # reviewers need manage_scans; bypass role lookup (RBAC itself is covered by the platform tests)
        p2 = mock.patch("nca.perms.HasPermissions.has_permission", return_value=True)
        p2.start()
        self.addCleanup(p2.stop)
        self.tid = self.tenant.id
        self.a = NcaAssessment.objects.create(tenant_id=self.tid, frameworks=[FW], status="completed", tenancy_name="T",
                                              finished_at=timezone.now())
        NcaCheckRun.objects.create(assessment=self.a, check_id="objectstorage_bucket_encrypted_with_cmk", status="FAIL",
                                   severity="medium", counts={"FAIL": 1, "PASS": 0, "MANUAL": 0})
        run = self.a.check_runs.get()
        self.finding = NcaFinding.objects.create(assessment=self.a, check_run=run, check_id=run.check_id, status="FAIL",
                                                 resource_id="ns/b", resource_name="b", region="r")
        finalize_controls(self.a)
        self.base = "/api/v1/nca"


class ApiTests(ApiCase):
    def test_requires_authentication(self):
        for url in ("/frameworks", "/assessments", "/assessments/latest", "/remediations", "/audit-log"):
            self.assertIn(self.anon.get(self.base + url).status_code, (401, 403), url)

    def test_frameworks_list_counts(self):
        r = self.c1.get(f"{self.base}/frameworks")
        by_key = {f["key"]: f for f in r.json()["frameworks"]}
        self.assertEqual(by_key["nca_ecc_2.2024"]["control_count"], 199)
        self.assertEqual(by_key["nca_ccc_2.2024"]["control_count"], 15)

    def test_controls_filter_by_status_and_search(self):
        r = self.c1.get(f"{self.base}/assessments/{self.a.id}/controls", {"framework": FW, "status": "FAIL"})
        ids = {c["control_id"] for c in r.json()["results"]}
        self.assertIn("2-1-5", ids)
        self.assertNotIn("1-1-1", ids)
        r = self.c1.get(f"{self.base}/assessments/{self.a.id}/controls", {"framework": FW, "q": "asset classification"})
        self.assertTrue(all("lassif" in c["name"] for c in r.json()["results"]))

    def test_checks_and_findings_endpoints(self):
        r = self.c1.get(f"{self.base}/assessments/{self.a.id}/checks", {"status": "FAIL"})
        self.assertEqual(r.json()["count"], 1)
        r = self.c1.get(f"{self.base}/assessments/{self.a.id}/findings", {"status": "FAIL"})
        self.assertEqual(r.json()["results"][0]["resource_name"], "b")

    def test_other_tenant_cannot_read_assessment(self):
        other = NcaAssessment.objects.create(tenant_id=uuid.uuid4(), frameworks=[FW], status="completed")
        self.assertEqual(self.c1.get(f"{self.base}/assessments/{other.id}").status_code, 404)

    def test_reports_all_formats(self):
        for fmt, ctype in (("json", "application/json"), ("csv", "text/csv"), ("md", "text/markdown"),
                           ("html", "text/html"), ("text", "text/plain")):
            r = self.c1.get(f"{self.base}/assessments/{self.a.id}/report", {"fmt": fmt, "framework": FW})
            self.assertEqual(r.status_code, 200, fmt)
            self.assertIn(ctype, r["Content-Type"])
            self.assertIn("attachment", r["Content-Disposition"])
        self.assertEqual(self.c1.get(f"{self.base}/assessments/{self.a.id}/report", {"fmt": "exe"}).status_code, 400)

    def test_csv_is_one_row_per_control_and_long_form_is_separate(self):
        import csv, io
        rows = list(csv.DictReader(io.StringIO(self.c1.get(f"{self.base}/assessments/{self.a.id}/report", {"fmt": "csv", "framework": FW}).content.decode())))
        self.assertEqual(len(rows), len({r["control_id"] for r in rows}))
        self.assertEqual(len(rows), 199)
        long_rows = list(csv.DictReader(io.StringIO(self.c1.get(f"{self.base}/assessments/{self.a.id}/report", {"fmt": "csv_checks", "framework": FW}).content.decode())))
        self.assertTrue(all(r["check_id"] for r in long_rows))

    def test_csv_ids_are_kept_as_text_for_excel(self):
        from nca.reports import _id_cell
        self.assertEqual(_id_cell("1-1-2"), '="1-1-2"')        # would otherwise become the date 01-01-2002 in Excel
        self.assertEqual(_id_cell("2-2-3-2"), '="2-2-3-2"')
        self.assertEqual(_id_cell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0")  # non-id input still guarded

    def test_csv_neutralises_formula_injection(self):
        from nca.reports import _cell
        self.assertEqual(_cell("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        self.assertEqual(_cell("safe"), "safe")

    def test_evidence_review_flow_with_segregation_of_duties(self):
        url = f"{self.base}/controls/{FW}/1-1-1"
        r = self.c1.post(f"{url}/evidence", {"title": "Strategy", "description": "approved strategy v3",
                                             "url": "https://example.com/doc",
                                             "file": SimpleUploadedFile("s.pdf", b"%PDF-1.4 test")}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()["file_sha256"]), 64)
        self.assertEqual(self.c1.get(url).json()["manual_state"], "pending")
        # submitter cannot approve own evidence
        self.assertEqual(self.c1.post(f"{url}/review", {"decision": "approved"}, format="json").status_code, 403)
        # a different reviewer can
        self.assertEqual(self.c2.post(f"{url}/review", {"decision": "approved", "comment": "ok"}, format="json").status_code, 201)
        d = self.c1.get(url).json()
        self.assertEqual(d["manual_state"], "approved")
        self.assertEqual(d["result"]["status"], "PASS")
        self.assertEqual(len(d["reviews"]), 1)
        self.assertEqual(len(d["evidence"]), 1)
        # history is kept in the audit log
        acts = set(NcaAuditLog.objects.filter(tenant_id=self.tid).values_list("action", flat=True))
        self.assertTrue({"evidence.submit", "review.approved"} <= acts)

    def test_evidence_validation(self):
        url = f"{self.base}/controls/{FW}/1-1-1/evidence"
        self.assertEqual(self.c1.post(url, {"description": "x"}, format="json").status_code, 400)          # no title
        self.assertEqual(self.c1.post(url, {"title": "t"}, format="json").status_code, 400)               # nothing attached
        self.assertEqual(self.c1.post(url, {"title": "t", "url": "javascript:alert(1)"}, format="json").status_code, 400)
        bad = SimpleUploadedFile("x.exe", b"MZ")
        self.assertEqual(self.c1.post(url, {"title": "t", "file": bad}, format="multipart").status_code, 400)
        self.assertEqual(self.c1.post(f"{self.base}/controls/{FW}/9-9-9/evidence", {"title": "t", "description": "d"}, format="json").status_code, 404)

    def test_review_requires_comment_for_reject_and_na(self):
        url = f"{self.base}/controls/{FW}/1-2-1"
        self.c1.post(f"{url}/evidence", {"title": "t", "description": "d"}, format="json")
        self.assertEqual(self.c2.post(f"{url}/review", {"decision": "rejected"}, format="json").status_code, 400)
        self.assertEqual(self.c2.post(f"{url}/review", {"decision": "rejected", "comment": "missing signature page"}, format="json").status_code, 201)
        self.assertEqual(self.c1.get(url).json()["result"]["status"], "FAIL")
        self.assertEqual(self.c2.post(f"{url}/review", {"decision": "bogus"}, format="json").status_code, 400)

    def test_review_without_evidence_rejected(self):
        r = self.c2.post(f"{self.base}/controls/{FW}/1-3-1/review", {"decision": "approved"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_comments(self):
        url = f"{self.base}/controls/{FW}/1-1-1/comments"
        self.assertEqual(self.c1.post(url, {"body": ""}, format="json").status_code, 400)
        self.assertEqual(self.c1.post(url, {"body": "needs CISO sign-off"}, format="json").status_code, 201)
        self.assertEqual(len(self.c1.get(f"{self.base}/controls/{FW}/1-1-1").json()["comments"]), 1)

    @override_settings()
    def test_remediation_endpoints_dry_run_and_blocked_execute(self):
        fake = FakeRemediator()
        with mock.patch.dict(rem.REMEDIATORS, {self.finding.check_id: fake}):
            r = self.c1.post(f"{self.base}/remediations/dry-run", {"finding_id": self.finding.id}, format="json")
            self.assertEqual(r.status_code, 201, r.content)
            dr_id = r.json()["id"]
            with mock.patch.dict("os.environ", {"NCA_REMEDIATION_ENABLED": ""}):
                r = self.c1.post(f"{self.base}/remediations/execute",
                                 {"finding_id": self.finding.id, "dry_run_id": dr_id,
                                  "confirmation": rem.confirmation_phrase(self.finding), "reason": "ticket CHG-12345"}, format="json")
            self.assertEqual(r.status_code, 409)
            self.assertEqual(fake.applied, 0)
        self.assertEqual(self.c1.post(f"{self.base}/remediations/dry-run", {"finding_id": 999999}, format="json").status_code, 404)
        self.assertGreaterEqual(self.c1.get(f"{self.base}/remediations").json()["count"], 2)
        self.assertGreaterEqual(self.c1.get(f"{self.base}/audit-log").json()["count"], 1)

    def test_start_assessment_validates_and_runs_in_background(self):
        with mock.patch("nca.hooks.run_assessment") as run, mock.patch("nca.hooks.threading.Thread") as th:
            self.assertEqual(self.c1.post(f"{self.base}/assessments", {"frameworks": ["bogus"]}, format="json").status_code, 400)
            r = self.c1.post(f"{self.base}/assessments", {"frameworks": [FW]}, format="json")
            self.assertEqual(r.status_code, 202, r.content)
            th.return_value.start.assert_called_once()
            # a second run while one is in progress is refused
            self.assertEqual(self.c1.post(f"{self.base}/assessments", {"frameworks": [FW]}, format="json").status_code, 409)
            run.assert_not_called()


class SubcontrolFilterTests(ApiCase):
    def test_automation_filter_returns_only_full_rows(self):
        r = self.c1.get(f"{self.base}/assessments/{self.a.id}/subcontrols", {"automation": "FULL", "limit": 200})
        rows = r.json()["results"]
        self.assertEqual(len(rows), 42)
        self.assertTrue(all(x["workbook_automation"] == "FULL" for x in rows))
        self.assertEqual(self.c1.get(f"{self.base}/assessments/{self.a.id}/subcontrols", {"limit": 200}).json()["count"], 57)


class StartAssessmentHook(DbCase):
    def test_starts_once_and_reports_running_one_instead_of_starting_a_second(self):
        from nca.hooks import start_assessment
        with mock.patch("nca.hooks.threading.Thread") as th, mock.patch("nca.hooks.run_assessment"):
            a1, started1 = start_assessment(TENANT, ["nca_ecc_2.2024"], provider_id=None, triggered_by="scan")
            a2, started2 = start_assessment(TENANT, ["nca_ecc_2.2024"])
        self.assertTrue(started1)
        self.assertFalse(started2)
        self.assertEqual(a1.id, a2.id)
        th.return_value.start.assert_called_once()

    def test_background_failure_never_propagates(self):
        from nca.hooks import start_assessment
        captured = {}

        class T:
            def __init__(self, target, name, daemon):
                captured["target"] = target

            def start(self):
                pass
        with mock.patch("nca.hooks.threading.Thread", T), mock.patch("nca.hooks.run_assessment", side_effect=RuntimeError("boom")):
            start_assessment(uuid.uuid4(), ["nca_ecc_2.2024"])
            captured["target"]()   # must swallow the error (it is logged)
