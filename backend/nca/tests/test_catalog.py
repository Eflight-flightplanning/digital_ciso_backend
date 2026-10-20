import json
from pathlib import Path

from django.test import SimpleTestCase

from nca.catalog import COMPLIANCE_DIR, FRAMEWORK_FILES, all_check_ids, load_api_rows, load_framework
from nca.native_checks import NATIVE_CHECKS

SERVICES = Path(COMPLIANCE_DIR).parents[1] / "providers" / "oraclecloud" / "services"


class Catalog(SimpleTestCase):
    def test_every_control_in_source_files_is_present(self):
        for key, (fname, _) in FRAMEWORK_FILES.items():
            if key == "nca_ecc_2.2024":
                continue  # built from the official document, see OfficialEcc2024
            raw = json.loads((COMPLIANCE_DIR / fname).read_text(encoding="utf-8", errors="replace"))
            fw = load_framework(key)
            self.assertEqual([c.control_id for c in fw.controls], [r["Id"] for r in raw["Requirements"]])

    def test_expected_counts(self):
        self.assertEqual(len(load_framework("nca_ecc_2.2024").controls), 108 + 91)
        self.assertEqual(len(load_framework("nca_ecc_1.2018").controls), 114)
        self.assertEqual(len(load_framework("nca_ccc_2.2024").controls), 15)

    def test_control_ids_unique(self):
        for key in FRAMEWORK_FILES:
            ids = [c.control_id for c in load_framework(key).controls]
            self.assertEqual(len(ids), len(set(ids)))

    def test_all_mapped_checks_are_implemented(self):
        missing = [c for c in all_check_ids()
                   if c not in NATIVE_CHECKS and not (SERVICES / c.split("_")[0] / c).is_dir()]
        self.assertEqual(missing, [], f"mapped checks with no implementation: {missing}")

    def test_framework_checks_preserved_and_supplement_labelled(self):
        c = next(c for c in load_framework("nca_ecc_2.2024").controls if c.control_id == "2-2-3")
        self.assertIn("identity_user_mfa_enabled_console_access", c.framework_checks)
        self.assertTrue(set(c.supplement_checks).isdisjoint(c.framework_checks))
        self.assertEqual(c.check_source("identity_password_policy_prevents_reuse"), "platform-supplement")
        self.assertEqual(c.check_source("identity_user_mfa_enabled_console_access"), "framework")

    def test_manual_controls_have_no_checks(self):
        c = next(c for c in load_framework("nca_ecc_2.2024").controls if c.control_id == "1-1-1")
        self.assertEqual(c.checks, [])

    def test_supplement_only_references_existing_controls(self):
        from nca.catalog import _supplement
        supp = _supplement()
        ecc_ids = {c.control_id for c in load_framework("nca_ecc_2.2024").controls}
        ecc18_ids = {c.control_id for c in load_framework("nca_ecc_1.2018").controls}
        ccc_ids = {c.control_id for c in load_framework("nca_ccc_2.2024").controls}
        self.assertTrue(set(supp["common"]) <= ecc_ids & ecc18_ids)
        self.assertTrue(set(supp["nca_ccc_2.2024"]) <= ccc_ids)


class EveryControlAccountedFor(SimpleTestCase):
    def test_every_control_has_checks_or_a_manual_reason(self):
        from nca.catalog import manual_category
        for key in FRAMEWORK_FILES:
            for c in load_framework(key).controls:
                if not c.checks:
                    cat, label = manual_category(c)
                    self.assertTrue(cat and label, c.control_id)

    def test_workbook_rows_feed_their_controls(self):
        c = next(c for c in load_framework("nca_ecc_2.2024").controls if c.control_id == "2-4-3")
        self.assertIn("oci_dns_mail_domain_spf_dmarc", c.checks)
        self.assertEqual(c.check_source("oci_dns_mail_domain_spf_dmarc"), "workbook")
        inv = next(c for c in load_framework("nca_ecc_2.2024").controls if c.control_id == "2-1-2")
        self.assertIn("oci_resource_inventory_available", inv.checks)  # workbook row "2-1" aliased to 2-1-2

    def test_manual_categories(self):
        from nca.catalog import manual_category
        get = lambda k, i: next(c for c in load_framework(k).controls if c.control_id == i)
        self.assertEqual(manual_category(get("nca_ecc_2.2024", "2-14-3"))[0], "physical_security")
        self.assertEqual(manual_category(get("nca_ecc_2.2024", "2-1-6"))[0], "periodic_review")
        self.assertEqual(manual_category(get("nca_ecc_2.2024", "1-9-3"))[0], "hr")
        self.assertEqual(manual_category(get("nca_ecc_1.2018", "5-1-1"))[0], "ics")
        self.assertEqual(manual_category(get("nca_ecc_2.2024", "2-6-3"))[0], "mobile_devices")


class OfficialEcc2024(SimpleTestCase):
    def fw(self):
        return load_framework("nca_ecc_2.2024")

    def test_matches_the_official_document_structure(self):
        main = [c for c in self.fw().controls if not c.parent_id]
        subs = [c for c in self.fw().controls if c.parent_id]
        self.assertEqual((len(main), len(subs)), (108, 91))   # document states 108 main / 92 sub-controls
        self.assertEqual(len({c.control_id for c in self.fw().controls}), 108 + 91)

    def test_controls_that_do_not_exist_in_the_2024_document_are_absent(self):
        ids = {c.control_id for c in self.fw().controls}
        self.assertNotIn("2-7-4", ids)   # 2-7 has only 2-7-1..2-7-3 in ECC-2:2024
        self.assertNotIn("1-7-2", ids)   # 1-7 has only 1-7-1
        self.assertEqual({"2-7-1", "2-7-2", "2-7-3"}, {i for i in ids if i.startswith("2-7-")})

    def test_every_subcontrol_has_a_parent_container_and_official_text(self):
        by = {c.control_id: c for c in self.fw().controls}
        for c in self.fw().controls:
            if c.parent_id:
                self.assertTrue(by[c.parent_id].is_container, c.control_id)
                self.assertGreater(len(c.description), 15, c.control_id)
        self.assertIn("Multi-factor authentication", by["2-2-3-2"].description)
        self.assertEqual(by["2-2-3-2"].parent_id, "2-2-3")

    def test_2018_meaning_of_2_7_3_is_not_carried_into_2024(self):
        c = next(c for c in self.fw().controls if c.control_id == "2-7-3")
        self.assertIn("periodically reviewed", c.description)
        self.assertEqual(c.checks, [])
        self.assertEqual(c.framework_checks + c.supplement_checks, [])

    def test_workbook_row_attaches_to_its_official_subcontrol(self):
        by = {c.control_id: c for c in self.fw().controls}
        self.assertIn("oci_privileged_users_mfa_enabled", by["2-2-3-2"].checks)
        self.assertEqual(by["2-2-3-2"].workbook_rows, ["2-2-3.2"])
        self.assertTrue(by["2-2-3-2"].workbook_detail[0]["pass_condition"])
        self.assertIn("oci_privileged_users_mfa_enabled", by["2-2-3"].checks)   # container keeps the roll-up

    def test_every_workbook_row_lands_on_an_existing_item(self):
        ids = {c.control_id for c in self.fw().controls}
        for r in load_api_rows():
            target = r["sub_control"].replace(".", "-")
            alias = {"2-1": "2-1-2"}.get(r["control_id"], r["control_id"])
            self.assertTrue(target in ids or alias in ids, r["sub_control"])
