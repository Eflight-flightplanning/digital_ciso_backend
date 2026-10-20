from django.test import SimpleTestCase

from nca.aggregate import (
    ERROR, FAIL, MANUAL, NA, PASS, aggregate_automated, aggregate_check, compute_control_status, summarize,
)


class CheckAggregation(SimpleTestCase):
    def test_all_pass(self):
        self.assertEqual(aggregate_check([PASS, PASS], []), (PASS, ""))

    def test_any_fail_wins(self):
        self.assertEqual(aggregate_check([PASS, FAIL], [])[0], FAIL)

    def test_no_resources_is_not_applicable_not_pass(self):
        self.assertEqual(aggregate_check([], []), (NA, "NO_RESOURCES"))

    def test_api_error_never_looks_like_missing_resources(self):
        self.assertEqual(aggregate_check([], [{"kind": "API_ERROR"}]), (ERROR, "API_ERROR"))

    def test_permission_denied_reported_distinctly(self):
        self.assertEqual(aggregate_check([], [{"kind": "PERMISSION_DENIED"}]), (ERROR, "PERMISSION_DENIED"))

    def test_partial_collection_never_passes(self):
        # some resources passed but listing another compartment failed -> cannot claim PASS
        self.assertEqual(aggregate_check([PASS, PASS], [{"kind": "API_ERROR"}])[0], ERROR)

    def test_fail_still_reported_with_errors(self):
        self.assertEqual(aggregate_check([FAIL], [{"kind": "API_ERROR"}])[0], FAIL)


class ControlAggregation(SimpleTestCase):
    def test_no_checks_is_manual(self):
        self.assertEqual(aggregate_automated([]), (None, "NO_AUTOMATED_CHECK"))
        self.assertEqual(compute_control_status(None, "NO_AUTOMATED_CHECK", "partial", None), (MANUAL, "NO_AUTOMATED_CHECK"))

    def test_untested_check_is_error_not_pass(self):
        r = aggregate_automated([(PASS, ""), (ERROR, "NOT_EXECUTED")])
        self.assertEqual(r[0], ERROR)
        self.assertEqual(compute_control_status(*r, "partial", None)[0], ERROR)

    def test_fail_beats_error_and_pass(self):
        self.assertEqual(aggregate_automated([(PASS, ""), (ERROR, "API_ERROR"), (FAIL, "")])[0], FAIL)

    def test_scanned_control_with_all_checks_passing_passes(self):
        # MANUAL is reserved for controls that cannot be scanned through the OCI API
        self.assertEqual(compute_control_status(PASS, "", "partial", None), (PASS, "PARTIAL_AUTOMATION"))

    def test_full_scope_all_pass_is_pass(self):
        self.assertEqual(compute_control_status(PASS, "", "full", None)[0], PASS)

    def test_approved_evidence_plus_automated_pass_is_pass(self):
        self.assertEqual(compute_control_status(PASS, "", "partial", "approved"), (PASS, "MANUAL_APPROVED"))

    def test_approved_evidence_cannot_override_failed_check(self):
        self.assertEqual(compute_control_status(FAIL, "", "partial", "approved")[0], FAIL)

    def test_approved_evidence_cannot_override_error(self):
        self.assertEqual(compute_control_status(ERROR, "API_ERROR", "partial", "approved")[0], ERROR)

    def test_rejected_is_fail(self):
        self.assertEqual(compute_control_status(None, "NO_AUTOMATED_CHECK", "partial", "rejected"), (FAIL, "MANUAL_REJECTED"))

    def test_pending_review_stays_manual(self):
        self.assertEqual(compute_control_status(None, "", "partial", "pending"), (MANUAL, "MANUAL_REVIEW_PENDING"))

    def test_resources_not_found_is_not_applicable_even_when_scope_is_partial(self):
        self.assertEqual(compute_control_status(NA, "NO_RESOURCES", "partial", None), (NA, "NO_RESOURCES"))
        self.assertEqual(compute_control_status(NA, "NO_RESOURCES", "full", None), (NA, "NO_RESOURCES"))

    def test_no_resources_but_evidence_pending_stays_manual(self):
        self.assertEqual(compute_control_status(NA, "NO_RESOURCES", "partial", "pending")[0], MANUAL)

    def test_basis_separates_manual_from_no_resources(self):
        from nca.aggregate import basis
        self.assertEqual(basis("MANUAL", "NO_AUTOMATED_CHECK", False), "manual")
        self.assertEqual(basis("MANUAL", "PARTIAL_AUTOMATION", True), "automated")
        self.assertEqual(basis("NOT_APPLICABLE", "NO_RESOURCES", True), "no_resources")
        self.assertEqual(basis("ERROR", "API_ERROR", True), "error")

    def test_reviewer_not_applicable(self):
        self.assertEqual(compute_control_status(None, "", "partial", "not_applicable")[0], NA)


class Summary(SimpleTestCase):
    def test_coverage_is_separate_from_pass_rate(self):
        controls = ([{"status": PASS, "automated_result": PASS}] + [{"status": FAIL, "automated_result": FAIL}]
                    + [{"status": MANUAL, "automated_result": None}] * 8)
        s = summarize(controls, [{"status": PASS}, {"status": FAIL}])
        self.assertEqual(s["controls"]["pass_rate_pct"], 50.0)            # 1 of 2 decided
        self.assertEqual(s["coverage"]["assessment_coverage_pct"], 20.0)  # 2 of 10 decided
        self.assertEqual(s["checks"]["pass_rate_pct"], 50.0)

    def test_pass_rate_none_when_nothing_decided(self):
        s = summarize([{"status": MANUAL, "automated_result": None}], [])
        self.assertIsNone(s["controls"]["pass_rate_pct"])
        self.assertEqual(s["coverage"]["assessment_coverage_pct"], 0.0)
