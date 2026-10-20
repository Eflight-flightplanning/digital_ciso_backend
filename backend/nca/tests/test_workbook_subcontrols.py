from pathlib import Path

from django.test import SimpleTestCase, TestCase

from nca.catalog import COMPLIANCE_DIR, all_check_ids, load_api_rows, load_framework
from nca.manual import finalize_controls
from nca.models import NcaAssessment, NcaCheckRun, NcaSubcontrolResult
from nca.native_checks import NATIVE_CHECKS

SERVICES = Path(COMPLIANCE_DIR).parents[1] / "providers" / "oraclecloud" / "services"


class WorkbookCatalog(SimpleTestCase):
    def test_all_57_workbook_rows_loaded_with_unique_ids(self):
        rows = load_api_rows()
        self.assertEqual(len(rows), 57)
        self.assertEqual(len({r["row_id"] for r in rows}), 57)
        self.assertEqual({r["automation_level"] for r in rows}, {"FULL", "PARTIAL"})

    def test_mapped_checks_exist_and_are_scheduled(self):
        scheduled = set(all_check_ids(["nca_ecc_2.2024"]))
        for r in load_api_rows():
            for c in r["checks"]:
                self.assertTrue(c in NATIVE_CHECKS or (SERVICES / c.split("_")[0] / c).is_dir(), c)
                self.assertIn(c, scheduled)

    def test_every_mapped_row_declares_coverage(self):
        for r in load_api_rows():
            if r["checks"]:
                self.assertIn(r["coverage"], ("full", "partial"), r["api_check"])

    def test_not_scheduled_for_other_frameworks(self):
        self.assertNotIn("identity_user_db_passwords_rotated_90_days", all_check_ids(["nca_ccc_2.2024"]))

    def test_parent_controls_exist_where_numbered(self):
        ids = {c.control_id for c in load_framework("nca_ecc_2.2024").controls}
        missing = {r["control_id"] for r in load_api_rows()} - ids
        self.assertLessEqual(missing, {"2-1"})  # "2-1" is a sub-domain row, not a numbered control


class WorkbookResults(TestCase):
    databases = {"default"}

    def result(self, statuses):
        a = NcaAssessment.objects.create(frameworks=["nca_ecc_2.2024"], status="completed")
        for k, v in statuses.items():
            NcaCheckRun.objects.create(assessment=a, check_id=k, status=v)
        finalize_controls(a)
        return a

    def row(self, a, api_check):
        return NcaSubcontrolResult.objects.get(assessment=a, api_check=api_check)

    def test_unmapped_row_is_manual_not_pass(self):
        a = self.result({})
        r = self.row(a, "Check SIEM integration for security logs")
        self.assertEqual((r.status, r.reason), ("MANUAL", "NO_AUTOMATED_CHECK"))

    def test_full_row_with_all_pass_passes(self):
        a = self.result({"network_security_list_ingress_from_internet_to_ssh_port": "PASS",
                         "network_security_group_ingress_from_internet_to_ssh_port": "PASS"})
        self.assertEqual(self.row(a, "Detect unrestricted SSH (22) exposure").status, "PASS")

    def test_partial_mapping_with_passing_checks_passes(self):
        a = self.result({"oci_network_firewall_deployed": "PASS"})
        self.assertEqual(self.row(a, "Check network intrusion-prevention capability").status, "PASS")

    def test_failure_and_unexecuted_check(self):
        a = self.result({"network_security_list_ingress_from_internet_to_ssh_port": "FAIL"})
        self.assertEqual(self.row(a, "Detect unrestricted SSH (22) exposure").status, "FAIL")
        b = self.result({"network_security_list_ingress_from_internet_to_ssh_port": "PASS"})  # NSG check never ran
        self.assertEqual(self.row(b, "Detect unrestricted SSH (22) exposure").status, "ERROR")

    def test_summary_includes_workbook_subcontrols(self):
        a = self.result({})
        s = a.summary["workbook_subcontrols"]
        self.assertEqual(s["total"], 57)
        self.assertEqual(s["PASS"], 0)
