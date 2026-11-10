"""Keeping clients apart: per-client Oracle users, per-client files, authenticator codes.

The database-level rules need PostgreSQL, so `manage.py verify_tenant_isolation` checks those.
"""
import tempfile
import uuid
from pathlib import Path

from django.test import SimpleTestCase, TestCase, override_settings

from api.client_reports import report_key, scan_csv, spreadsheet_safe, valid_location
from api.client_storage import get_storage
from api.totp import STEP_SECONDS, code_at, matching_step, new_secret, provisioning_uri
from oracle_cis.pod_users import load_pod_users, merge_pod_users, save_pod_users

A, B = uuid.uuid4(), uuid.uuid4()


class PodUsersTests(TestCase):
    def test_each_client_sees_only_its_own_users(self):
        save_pod_users(A, [{"username": "ann"}])
        save_pod_users(B, [{"username": "bob"}])
        self.assertEqual([u["username"] for u in load_pod_users(A)], ["ann"])
        self.assertEqual([u["username"] for u in load_pod_users(B)], ["bob"])

    def test_saving_one_client_leaves_the_other_alone(self):
        save_pod_users(A, [{"username": "ann"}])
        save_pod_users(B, [{"username": "bob"}])
        save_pod_users(A, [])
        self.assertEqual(len(load_pod_users(B)), 1)

    def test_same_username_can_exist_for_two_clients(self):
        save_pod_users(A, [{"username": "sam"}])
        save_pod_users(B, [{"username": "sam"}])
        self.assertEqual(len(load_pod_users(A)) + len(load_pod_users(B)), 2)

    def test_merge_keeps_existing_values_and_renumbers(self):
        save_pod_users(A, [{"username": "ann", "department": "Finance", "id": "x"}])
        merged = merge_pod_users(A, [{"username": "ANN", "department": ""}, {"username": "bob"}])
        self.assertEqual(merged[0]["department"], "Finance")
        self.assertEqual([u["id"] for u in merged], ["USR-HCM-0001", "USR-HCM-0002"])
        self.assertEqual(len(load_pod_users(A)), 2)


class ClientStorageTests(SimpleTestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        override = override_settings(CLIENT_FILES_DIR=self.root)
        override.enable()
        self.addCleanup(override.disable)
        self.storage = get_storage()

    def test_file_goes_in_the_clients_own_area(self):
        key = self.storage.save(A, "evidence", "proof.pdf", [b"a", b"b"])
        self.assertTrue((self.root / str(A) / key).is_file())
        with self.storage.open(A, key) as fh:
            self.assertEqual(fh.read(), b"ab")

    def test_another_clients_key_finds_nothing(self):
        key = self.storage.save(A, "evidence", "proof.pdf", [b"a"])
        self.assertFalse(self.storage.exists(B, key))

    def test_keys_cannot_leave_the_clients_area(self):
        key = self.storage.save(A, "evidence", "proof.pdf", [b"a"])
        for bad in (f"../{A}/{key}", "..", "/etc/passwd", "C:/Windows/win.ini", ""):
            with self.assertRaises(PermissionError, msg=bad):
                self.storage.open(B, bad)

    def test_unsafe_names_and_categories(self):
        key = self.storage.save(A, "evidence", "../../evil name.pdf", [b"a"])
        self.assertNotIn("..", key)
        with self.assertRaises(ValueError):
            self.storage.save(A, "../x", "a.pdf", [b"a"])

    def test_two_files_with_one_name_do_not_collide(self):
        self.assertNotEqual(self.storage.save(A, "evidence", "a.pdf", [b"1"]),
                            self.storage.save(A, "evidence", "a.pdf", [b"2"]))

    def test_delete_client_removes_only_that_client(self):
        self.storage.save(A, "evidence", "a.pdf", [b"1"])
        kept = self.storage.save(B, "evidence", "b.pdf", [b"2"])
        self.storage.delete_client(A)
        self.assertFalse((self.root / str(A)).exists())
        self.assertTrue(self.storage.exists(B, kept))


class TotpTests(SimpleTestCase):
    def test_published_test_vector(self):
        # RFC 6238 appendix B, SHA-1, time 59: step 1, last six digits of 94287082
        import base64

        secret = base64.b32encode(b"12345678901234567890").decode()
        self.assertEqual(code_at(secret, 1), "287082")

    def test_accepts_current_and_adjacent_steps_only(self):
        secret, now = new_secret(), 1_000_000 * STEP_SECONDS
        step = 1_000_000
        for s in (step - 1, step, step + 1):
            self.assertEqual(matching_step(secret, code_at(secret, s), now=now), s)
        self.assertIsNone(matching_step(secret, code_at(secret, step + 5), now=now))

    def test_used_code_is_refused(self):
        secret, now, step = new_secret(), 1_000_000 * STEP_SECONDS, 1_000_000
        self.assertIsNone(matching_step(secret, code_at(secret, step), after_step=step, now=now))

    def test_malformed_codes(self):
        for bad in ("", "12345", "1234567", "abcdef", "١٢٣٤٥٦"):
            self.assertIsNone(matching_step(new_secret(), bad))

    def test_setup_link_names_the_product_and_user(self):
        uri = provisioning_uri("ABC", "ann@example.com")
        self.assertTrue(uri.startswith("otpauth://totp/Digital%20CISO%3Aann%40example.com?"))


class SavedReportTests(SimpleTestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.override = override_settings(CLIENT_FILES_DIR=self.root)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.storage = get_storage()
        self.key = report_key("nca", "run-1", "report-html.html")

    def test_a_report_is_kept_in_its_own_clients_folder(self):
        self.storage.put(A, self.key, b"a")
        self.assertTrue((Path(self.root) / str(A) / self.key).is_file())
        self.assertFalse(self.storage.exists(B, self.key))

    def test_listing_shows_only_this_clients_reports(self):
        self.storage.put(A, self.key, b"abc")
        self.assertEqual(self.storage.list_files(A, "reports"), [(self.key, 3)])
        self.assertEqual(self.storage.list_files(B, "reports"), [])

    def test_saving_again_replaces_the_copy_and_leaves_nothing_behind(self):
        self.storage.put(A, self.key, b"old")
        self.storage.put(A, self.key, b"new")
        with self.storage.open(A, self.key) as saved:
            self.assertEqual(saved.read(), b"new")
        self.assertEqual(len(self.storage.list_files(A, "reports")), 1)

    def test_a_folder_can_be_made_before_any_report_exists(self):
        self.storage.create_client(A)
        self.assertTrue((Path(self.root) / str(A)).is_dir())
        self.assertEqual(self.storage.list_files(A, "reports"), [])

    def test_a_report_location_cannot_leave_the_reports_area(self):
        for kind, run, name in [("nca", "..", "report-html.html"), ("other", "1", "report-html.html"), ("nca", "1", "../../secret"), ("nca", "a/b", "report-csv.csv")]:
            self.assertFalse(valid_location(kind, run, name))
            with self.assertRaises(ValueError):
                report_key(kind, run, name)

    def test_cells_cannot_run_as_formulas(self):
        self.assertEqual(spreadsheet_safe("=cmd()"), "'=cmd()")
        self.assertEqual(spreadsheet_safe("ok"), "ok")
        self.assertEqual(spreadsheet_safe(None), "")
        self.assertIn("'@x", scan_csv([["c", "high", "@x", "uk", "text"]]))
