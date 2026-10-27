"""Check logic against the fake identity domain and Fusion pod."""
import base64
import copy
import io
import os
import zipfile
from unittest import mock

from django.test import SimpleTestCase

from cis_checks.context import prepare
from cis_checks.fusion_client import parse_inactive_users_report
from cis_checks.registry import load_checks

from .fakes import NO_FUSION, FakeFusion, FakeIdcs, compliant_tenant, user


def run_check(cis_id, data, fusion=NO_FUSION):
    check = next(c for c in load_checks() if c.cis_id == cis_id)
    api, ctx = FakeIdcs(data), {"fusion_client": fusion}
    prepare(api, ctx)
    return check.execute(api, ctx)


class CheckTests(SimpleTestCase):
    def test_compliant_tenant(self):
        expected = {"1.1": "PASS", "1.2": "PASS", "1.3": "PARTIAL", "1.5": "PASS", "1.14": "PASS", "2.1": "PASS", "2.2": "PASS", "3.1": "PASS"}
        for cis_id, status in expected.items():
            with self.subTest(cis_id=cis_id):
                self.assertEqual(run_check(cis_id, compliant_tenant())["status"], status)

    def test_weak_password_policy_fails(self):
        data = compliant_tenant()
        data["PasswordPolicies"][0]["minLength"] = 8
        data["PasswordPolicies"][0]["passwordExpiresAfter"] = 0
        result = run_check("1.1", data)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("minimum length 8", result["reason"])
        self.assertIn("expiry (days) not set", result["reason"])

    def test_unreferenced_or_wide_open_perimeter_fails(self):
        data = compliant_tenant()
        data["Rules"][0]["condition"] = '{"groups": ["g-admins"]}'
        self.assertEqual(run_check("2.1", data)["status"], "FAIL")

        data = compliant_tenant()
        data["NetworkPerimeters"][0]["ipAddresses"] = [{"type": "CIDR", "value": "0.0.0.0/0"}]
        result = run_check("2.1", data)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["wide_open"], [{"perimeter": "CorpVPN", "range": "0.0.0.0/0"}])

    def test_console_rule_without_network_fails(self):
        data = compliant_tenant()
        data["Rules"][0]["condition"] = '{"groups": ["g-admins"]}'
        self.assertEqual(run_check("2.2", data)["status"], "FAIL")

    def test_federation_note_is_appended(self):
        data = compliant_tenant()
        data["IdentityProviders"] = [{"id": "idp-1", "partnerName": "Entra ID"}]
        for cis_id in ("2.1", "2.2"):
            with self.subTest(cis_id=cis_id):
                self.assertIn("external identity provider (Entra ID)", run_check(cis_id, data)["reason"])

    def test_dormant_accounts_fail(self):
        data = compliant_tenant()
        data["Users"].append(user("u-old", "old@example.com", days_since_login=200))
        self.assertEqual(run_check("1.14", data)["status"], "FAIL")
        self.assertEqual(run_check("1.13", data)["status"], "FAIL")

    def test_missing_lifecycle_events_is_provisional_fail(self):
        data = compliant_tenant()
        data["AuditEvents"] = [e for e in data["AuditEvents"] if e["eventId"] != "sso.session.delete.success"]
        result = run_check("3.1", data)
        self.assertEqual(result["status"], "FAIL (provisional)")
        self.assertIn("Provisional", result["reason"])
        sign_out = next(s for s in result["evidence"]["lifecycle"] if s["key"] == "sign_out")
        self.assertFalse(sign_out["found"])

    def test_admin_with_sms_fails_phishing_resistant(self):
        data = copy.deepcopy(compliant_tenant())
        data["Users"][0] = user("u-admin", "admin@example.com", admin_group=True, factor="SMS")
        self.assertEqual(run_check("1.3", data)["status"], "FAIL")

    def test_manual_only_controls_return_manual(self):
        result = run_check("3.2", compliant_tenant())
        self.assertEqual(result["status"], "MANUAL")
        self.assertTrue(result["reason"].startswith("Manual control"))

    def test_audit_policy_check_cannot_complete_until_the_pod_works(self):
        result = run_check("4.1.1", compliant_tenant())
        self.assertEqual(result["status"], "ERROR")

    def test_system_password_policies_are_skipped(self):
        data = compliant_tenant()
        data["PasswordPolicies"].append({"id": "SimplePasswordPolicy", "name": "Simple", "minLength": 8})
        result = run_check("1.1", data)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["system_policies_skipped"], ["SimplePasswordPolicy"])

    def test_password_user_without_mfa_fails(self):
        data = compliant_tenant()
        data["Users"].append(user("u-nomfa", "carol@example.com", mfa="DISABLED", console=True))
        result = run_check("1.2", data)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["users_failed"], 1)

    def test_dormant_from_fusion_report(self):
        fusion = FakeFusion(
            [
                {"user": "OLD.ADMIN@EXAMPLE.COM", "days_inactive": 140, "suspended": False, "last_sign_in": "2026-05-27"},
                {"user": "gone@example.com", "days_inactive": 300, "suspended": True, "last_sign_in": None},
                {"user": "recent@example.com", "days_inactive": 40, "suspended": False, "last_sign_in": "2026-09-04"},
            ]
        )
        data = compliant_tenant()
        data["Users"].append(user("u-oa", "old.admin@example.com", admin_group=True))
        result = run_check("1.14", data, fusion)
        self.assertEqual(result["status"], "FAIL")
        ev = result["evidence"]
        self.assertIn("Fusion Inactive Users Report", ev["source"])
        self.assertEqual(ev["dormant_count"], 1)
        self.assertEqual(ev["already_suspended"], 1)
        self.assertTrue(ev["dormant_sample"][0]["privileged"])

    def test_fusion_failure_falls_back_to_identity_domain(self):
        result = run_check("1.14", compliant_tenant(), FakeFusion(error=RuntimeError("HTTP 401")))
        self.assertEqual(result["status"], "PASS")
        self.assertIn("HTTP 401", result["evidence"]["fusion_error"])
        self.assertIn("lastSuccessfulLoginDate", result["evidence"]["source"])

    def test_parse_inactive_users_report_nested_zip(self):
        xml = (
            "<DATA_DS><USER><USER-NAME>jane.doe</USER-NAME><DAYS-INACTIVE>120</DAYS-INACTIVE>"
            "<LAST-ACTIVITY-DATE>2026-06-16</LAST-ACTIVITY-DATE><SUSPENDED>N</SUSPENDED></USER>"
            "<USER><USER-NAME>no.days</USER-NAME></USER></DATA_DS>"
        )
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, "w") as z:
            z.writestr("Inactive_Users.xml", xml)
        outer = io.BytesIO()
        with zipfile.ZipFile(outer, "w") as z:
            z.writestr("report.zip", inner.getvalue())
        rows = parse_inactive_users_report(base64.b64encode(outer.getvalue()).decode())
        self.assertEqual(rows[0]["user"], "jane.doe")
        self.assertEqual(rows[0]["days_inactive"], 120)
        self.assertFalse(rows[0]["suspended"])
        self.assertIsNone(rows[1]["days_inactive"])  # unknown, not defaulted to 30

    def test_real_console_policy_shape(self):
        """Shape seen on a live domain: rules not embedded unless requested, active=null,
        ConditionGroup conditions, MFA as authenticationFactor IDP+2FA, no network condition."""
        data = compliant_tenant()
        data["NetworkPerimeters"] = []
        data["Policies"] = [{"id": "p-oci", "name": "Security Policy for OCI Console", "rules": [
            {"value": "OciConsoleAdminMFARule", "sequence": 1}, {"value": "OciConsoleMFANonAdminRule", "sequence": 2}]}]
        mfa = [{"name": "effect", "value": "ALLOW"}, {"name": "authenticationFactor", "value": "IDP+2FA"}]
        data["Rules"] = [
            {"id": "OciConsoleAdminMFARule", "name": "MFA for administrators", "active": None,
             "conditionGroup": {"type": "ConditionGroup", "value": "OciConsoleConditionGroups"}, "return": mfa},
            {"id": "OciConsoleMFANonAdminRule", "name": "MFA for all users", "active": None,
             "conditionGroup": {"type": "ConditionGroup", "value": "OciConsoleDefaultConditionGroups"}, "return": mfa},
        ]
        data["ConditionGroups"] = [
            {"id": "OciConsoleConditionGroups", "operator": "and", "conditions": [{"value": "c-group", "type": "Condition"}]},
            {"id": "OciConsoleDefaultConditionGroups", "operator": "and", "conditions": [{"value": "c-login", "type": "Condition"}]},
        ]
        data["Conditions"] = [
            {"id": "c-group", "attributeName": "user.groups[*].value", "operator": "coany", "attributeValue": '["g-admins"]'},
            {"id": "c-login", "attributeName": "target.action", "operator": "eq", "attributeValue": "Login"},
        ]
        result = run_check("2.2", data)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["evidence"]["console_rules"]), 2)
        self.assertEqual(result["evidence"]["condition_groups"][1]["conditions"]["conditions"][0]["attributeName"], "target.action")
        result_15 = run_check("1.5", data)
        self.assertEqual(result_15["status"], "FAIL")  # second rule allows everyone; no final deny
        rules = {r["rule"]: r for r in result_15["evidence"]["console_rules"]}
        self.assertTrue(rules["MFA for administrators"]["mentions_groups"])
        # Regression: "ConditionGroup" in the type name must not count as a group condition.
        self.assertFalse(rules["MFA for all users"]["mentions_groups"])

    def test_console_policy_without_readable_rules_is_not_a_pass(self):
        data = compliant_tenant()
        data["Rules"] = []
        self.assertEqual(run_check("2.2", data)["status"], "FAIL (provisional)")

    def test_rare_events_outside_sample_still_count(self):
        """Stages are counted over the whole window, not only in the newest EVENT_SAMPLE events."""
        import os
        from unittest import mock

        with mock.patch.dict(os.environ, {"EVENT_SAMPLE": "2"}):
            result = run_check("3.1", compliant_tenant())
        self.assertEqual(result["evidence"]["events_sampled"], 2)
        self.assertTrue(all(s["found"] for s in result["evidence"]["lifecycle"]))
        self.assertEqual(result["status"], "PASS")


def fusion_user(name, *codes, assigned="2020-01-01T00:00:00+00:00", suspended=False):
    return {"user": name, "person_number": "1", "suspended": suspended,
            "roles": [{"code": c, "assigned": assigned, "assigned_by": "ADMIN"} for c in codes]}


class FusionRoleCheckTests(SimpleTestCase):
    def test_superuser_roles_fail_on_implementation_consultant(self):
        from cis_checks.base import iso, utc_now

        fusion = FakeFusion(roles=[
            fusion_user("aic.user", "ORA_ASM_APPLICATION_IMPLEMENTATION_CONSULTANT_JOB"),
            fusion_user("secmgr", "FND_IT_SECURITY_MANAGER_JOB", assigned=iso(utc_now())),
            fusion_user("old.aic", "ASM_APPLICATION_IMPLEMENTATION_CONSULTANT_JOB", suspended=True),
            fusion_user("clerk", "PER_EMPLOYEE_ABSTRACT"),
        ])
        result = run_check("4.3", compliant_tenant(), fusion)
        self.assertEqual(result["status"], "FAIL")
        ev = result["evidence"]
        self.assertEqual(ev["superuser_holders"], 2)
        self.assertEqual(ev["implementation_consultant_holders"], 1)
        self.assertEqual(ev["assigned_in_window"], 1)

    def test_superuser_roles_without_aic_is_partial(self):
        fusion = FakeFusion(roles=[fusion_user("secmgr", "ORA_FND_IT_SECURITY_MANAGER_JOB")])
        self.assertEqual(run_check("4.3", compliant_tenant(), fusion)["status"], "PARTIAL")

    def test_ghost_employee_combination(self):
        fusion = FakeFusion(roles=[
            fusion_user("both", "HR_SPECIALIST_-_VIEW_ALL_DATA", "PAYROLL_MANAGER_-_VIEW_ALL_DATA"),
            fusion_user("hire.time", "ORA_PER_HUMAN_RESOURCE_SPECIALIST_JOB", "ORA_HXT_TIME_AND_LABOR_MANAGER_JOB"),
            fusion_user("payroll.only", "PAYROLL_MANAGER_-_VIEW_ALL_DATA"),
            fusion_user("suspended", "HR_SPECIALIST_-_VIEW_ALL_DATA", "PAYROLL_ADMINISTRATOR_-_VIEW_ALL_DATA", suspended=True),
        ])
        result = run_check("5.3.7", compliant_tenant(), fusion)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["users_with_conflict"], 2)
        self.assertEqual(result["evidence"]["hire_and_timecards"], 1)

    def test_no_fusion_pod_is_not_assessed(self):
        for cis_id in ("4.3", "5.3.7"):
            with self.subTest(cis_id=cis_id):
                result = run_check(cis_id, compliant_tenant())
                self.assertEqual(result["status"], "MANUAL")
                self.assertTrue(result["not_assessed"])


class IdcsClientRetryTests(SimpleTestCase):
    def test_timeouts_are_retried_then_reported(self):
        from unittest import mock

        import requests

        from cis_checks.idcs_client import Idcs, IdcsError

        session = mock.Mock()
        ok = mock.Mock(status_code=200)
        ok.json.return_value = {"Resources": []}
        session.get.side_effect = [requests.ReadTimeout("slow"), ok]
        api = Idcs(base="https://idcs.example.com", client_id="c", client_secret="s", session=session)
        api._token, api._token_expires = "t", 10**12
        with mock.patch("cis_checks.idcs_client.time.sleep"):
            self.assertEqual(api.get("/admin/v1/Users"), {"Resources": []})
            session.get.side_effect = requests.ReadTimeout("slow")
            with self.assertRaises(IdcsError):
                api.get("/admin/v1/Users")


class SubstantialAccessTests(SimpleTestCase):
    def test_new_grant_in_window_fails(self):
        from cis_checks.base import iso, utc_now

        fusion = FakeFusion(roles=[
            fusion_user("new.loader", "ORA_HRC_HUMAN_CAPITAL_MANAGEMENT_INTEGRATION_SPECIALIST_JOB", assigned=iso(utc_now())),
            fusion_user("old.sec", "FND_IT_SECURITY_MANAGER_JOB"),
            fusion_user("clerk", "PER_EMPLOYEE_ABSTRACT", assigned=iso(utc_now())),
        ])
        result = run_check("5.1.2", compliant_tenant(), fusion)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["granted_in_window"], 1)
        self.assertEqual(result["evidence"]["holders"], 2)

    def test_no_new_grants_passes(self):
        fusion = FakeFusion(roles=[fusion_user("old.sec", "ORA_FND_IT_SECURITY_MANAGER_JOB")])
        result = run_check("5.1.2", compliant_tenant(), fusion)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["holders"], 1)


def catalogue_role(code, category="JOB"):
    return {"code": code, "name": code.title(), "category": category}


class UnusedCustomRoleTests(SimpleTestCase):
    def catalogue(self):
        return [
            catalogue_role("ORA_PER_EMPLOYEE_ABSTRACT", "ABSTRACT"),  # predefined: ignored
            catalogue_role("XX_PAYROLL_VIEWER"),                      # custom, held
            catalogue_role("XX_LEGACY_APPROVER"),                     # custom, nobody holds it
            catalogue_role("XX_OLD_CLERK"),                           # custom, only a suspended user
            catalogue_role("XX_REPORTING_DUTY", "DUTY"),              # duty role: ignored
        ]

    def users(self):
        return [
            fusion_user("anna", "XX_PAYROLL_VIEWER", "ORA_PER_EMPLOYEE_ABSTRACT"),
            fusion_user("gone", "XX_OLD_CLERK", suspended=True),
        ]

    def test_unassigned_custom_role_fails(self):
        result = run_check("4.1.3", compliant_tenant(), FakeFusion(roles=self.users(), catalogue=self.catalogue()))
        self.assertEqual(result["status"], "FAIL")
        ev = result["evidence"]
        self.assertEqual(ev["custom_roles"], 3)
        self.assertEqual([r["role"] for r in ev["unused"]], ["XX_LEGACY_APPROVER"])
        self.assertEqual([r["role"] for r in ev["held_only_by_suspended_users"]], ["XX_OLD_CLERK"])

    def test_all_custom_roles_assigned_passes(self):
        users = self.users() + [fusion_user("bob", "XX_LEGACY_APPROVER")]
        result = run_check("4.1.3", compliant_tenant(), FakeFusion(roles=users, catalogue=self.catalogue()))
        self.assertEqual(result["status"], "PASS")

    def test_custom_prefix_setting(self):
        catalogue = self.catalogue() + [catalogue_role("HR_SPECIALIST_JOB")]  # older predefined code without ORA_
        with mock.patch.dict(os.environ, {"CUSTOM_ROLE_PREFIXES": "XX_"}):
            result = run_check("4.1.3", compliant_tenant(), FakeFusion(roles=self.users(), catalogue=catalogue))
        self.assertEqual(result["evidence"]["custom_roles"], 3)

    def test_no_pod_is_manual(self):
        result = run_check("4.1.3", compliant_tenant(), NO_FUSION)
        self.assertEqual(result["status"], "MANUAL")
        self.assertTrue(result["not_assessed"])

    def test_missing_catalogue_raises_for_the_runner(self):
        from cis_checks.fusion_client import FusionError

        with self.assertRaises(FusionError):
            run_check("4.1.3", compliant_tenant(), FakeFusion(roles=self.users()))


class FusionRoleCatalogueClientTests(SimpleTestCase):
    def response(self, status, body=None):
        resp = mock.Mock(status_code=status, content=b"x")
        resp.json.return_value = body or {}
        return resp

    def test_falls_back_to_rest_when_scim_is_404(self):
        from cis_checks.fusion_client import FusionClient

        session = mock.Mock()
        session.request.side_effect = [
            self.response(404),
            self.response(200, {"items": [{"RoleCode": "XX_A", "RoleName": "A"}], "hasMore": False}),
        ]
        roles, source = FusionClient("https://pod", "u", "p", session=session).roles()
        self.assertEqual(source, "/hcmRestApi/resources/11.13.18.05/roles")
        self.assertEqual(roles[0]["code"], "XX_A")

    def test_401_is_not_hidden(self):
        from cis_checks.fusion_client import FusionClient, FusionError

        session = mock.Mock()
        session.request.return_value = self.response(401)
        with self.assertRaisesRegex(FusionError, "401"):
            FusionClient("https://pod", "u", "p", session=session).roles()
