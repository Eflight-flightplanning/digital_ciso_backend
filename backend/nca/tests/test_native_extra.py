import types
from datetime import datetime, timedelta, timezone
from unittest import mock

from django.test import SimpleTestCase

from nca import native_checks_extra as x
from nca.native_checks import NativeContext

NS = types.SimpleNamespace


def ctx():
    prov = NS(regions=[NS(key="r1")], compartments=[NS(id="c1", name="c1")], home_region="r1",
              identity=NS(tenancy_id="t1"), session=NS(config={}, signer=None))
    return NativeContext(prov)


def lb(name, listeners, private=False):
    return NS(id=name, display_name=name, is_private=private, lifecycle_state="ACTIVE", listeners=listeners)


def listener(protocol="HTTP", ssl=None):
    return NS(protocol=protocol, ssl_configuration=ssl)


def statuses(rows):
    return [r["status"] for r in rows]


class LoadBalancerChecks(SimpleTestCase):
    def patch_lbs(self, lbs):
        return mock.patch.object(x, "_public_lbs", return_value=[("r1", NS(id="c1"), l) for l in lbs])

    def test_https_only(self):
        with self.patch_lbs([lb("a", {"l": listener("HTTP")}), lb("b", {"l": listener("HTTP", ssl=NS())})]):
            self.assertEqual(statuses(x.oci_lb_listeners_https_only(ctx())), ["FAIL", "PASS"])

    def test_no_public_lb_gives_no_rows(self):
        with self.patch_lbs([]):
            self.assertEqual(x.oci_lb_listeners_https_only(ctx()), [])
            self.assertEqual(x.oci_waf_protects_public_load_balancers(ctx()), [])

    def test_tls_policy(self):
        weak = NS(cipher_suite_name="oci-default-ssl-cipher-suite-v1", protocols=["TLSv1.2"])
        old = NS(cipher_suite_name="custom", protocols=["TLSv1.1"])
        good = NS(cipher_suite_name="custom", protocols=["TLSv1.2", "TLSv1.3"])
        with self.patch_lbs([lb("w", {"l": listener("HTTP", weak)}), lb("o", {"l": listener("HTTP", old)}),
                             lb("g", {"l": listener("HTTP", good)}), lb("plain", {"l": listener("HTTP")})]):
            self.assertEqual(statuses(x.oci_lb_tls_policy_secure(ctx())), ["FAIL", "FAIL", "PASS"])

    def test_waf(self):
        waf = NS(load_balancer_id="a", lifecycle_state="ACTIVE")
        with self.patch_lbs([lb("a", {}), lb("b", {})]), mock.patch.object(x, "_all", return_value=[waf]):
            self.assertEqual(statuses(x.oci_waf_protects_public_load_balancers(ctx())), ["PASS", "FAIL"])

    def test_waf_listing_error_is_recorded_not_passed(self):
        c = ctx()
        with self.patch_lbs([lb("a", {})]), mock.patch.object(x, "_all", side_effect=RuntimeError("denied")):
            x.oci_waf_protects_public_load_balancers(c)
        self.assertTrue(c.errors)


class IamChecks(SimpleTestCase):
    def test_policy_statements(self):
        pols = [NS(id="1", name="ok", statements=["Allow group Devs to read buckets in compartment x"]),
                NS(id="2", name="any", statements=["Allow any-user to read buckets in tenancy"]),
                NS(id="3", name="adm", statements=["Allow group Administrators to manage all-resources in tenancy"]),
                NS(id="4", name="wild", statements=["Allow group Devs to manage all-resources in tenancy"])]
        with mock.patch.object(x, "_all", return_value=pols):
            self.assertEqual(statuses(x.oci_iam_policy_no_overly_broad_statements(ctx())), ["PASS", "FAIL", "PASS", "FAIL"])

    def test_inactive_users(self):
        now = datetime.now(timezone.utc)
        users = [NS(id="a", name="recent", lifecycle_state="ACTIVE", last_successful_login_time=now - timedelta(days=5), time_created=now - timedelta(days=500)),
                 NS(id="b", name="old", lifecycle_state="ACTIVE", last_successful_login_time=now - timedelta(days=200), time_created=now - timedelta(days=500)),
                 NS(id="c", name="never", lifecycle_state="ACTIVE", last_successful_login_time=None, time_created=now - timedelta(days=400)),
                 NS(id="d", name="newbie", lifecycle_state="ACTIVE", last_successful_login_time=None, time_created=now - timedelta(days=3)),
                 NS(id="e", name="gone", lifecycle_state="INACTIVE", last_successful_login_time=None, time_created=now - timedelta(days=900))]
        with mock.patch.object(x, "_all", return_value=users):
            self.assertEqual(statuses(x.oci_iam_users_inactive_90_days(ctx())), ["PASS", "FAIL", "FAIL", "PASS"])

    def test_api_error_gives_no_rows_and_error(self):
        c = ctx()
        with mock.patch.object(x, "_all", side_effect=RuntimeError("403")):
            self.assertEqual(x.oci_iam_users_inactive_90_days(c), [])
        self.assertTrue(c.errors)


class OtherChecks(SimpleTestCase):
    def test_agent_plugin(self):
        on = NS(is_management_disabled=False, plugins_config=[NS(name="OS Management Hub Agent", desired_state="ENABLED")])
        off = NS(is_management_disabled=False, plugins_config=[NS(name="OS Management Hub Agent", desired_state="DISABLED")])
        mk = lambda n, cfg: NS(id=n, display_name=n, lifecycle_state="RUNNING", agent_config=cfg)
        items = [("r1", NS(id="c1"), mk("a", on)), ("r1", NS(id="c1"), mk("b", off))]
        with mock.patch.object(x, "_each_comp_region", return_value=items):
            self.assertEqual(statuses(x.oci_instance_os_management_agent_enabled(ctx())), ["PASS", "FAIL"])

    def test_db_encryption_none_when_no_databases(self):
        with mock.patch.object(x, "_each_comp_region", return_value=[]):
            self.assertEqual(x.oci_database_encryption_at_rest(ctx()), [])
            self.assertEqual(x.oci_database_backup_enabled(ctx()), [])

    def test_network_firewall_not_applicable_without_igw(self):
        with mock.patch.object(x, "_each_comp_region", return_value=[]):
            self.assertEqual(x.oci_network_firewall_deployed(ctx()), [])

    def test_network_firewall_missing(self):
        igw = NS(id="i", display_name="igw", lifecycle_state="AVAILABLE", is_enabled=True)
        with mock.patch.object(x, "_each_comp_region", return_value=[("r1", NS(id="c1"), igw)]), mock.patch.object(x, "_all", return_value=[]):
            self.assertEqual(statuses(x.oci_network_firewall_deployed(ctx())), ["FAIL"])

    def test_registered(self):
        from nca.native_checks import NATIVE_CHECKS
        for k in ("oci_waf_protects_public_load_balancers", "oci_dns_mail_domain_spf_dmarc", "oci_resource_inventory_available"):
            self.assertIn(k, NATIVE_CHECKS)
