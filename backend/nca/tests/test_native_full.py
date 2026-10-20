import types
from datetime import datetime, timedelta, timezone
from unittest import mock

from django.test import SimpleTestCase

from nca import native_checks_full as x
from nca.catalog import load_api_rows
from nca.native_checks import NATIVE_CHECKS, NativeContext

NS = types.SimpleNamespace


def ctx(**kw):
    prov = NS(regions=[NS(key="r1")], compartments=[NS(id="c1", name="c1")], home_region="r1",
              identity=NS(tenancy_id="t1"), session=NS(config={}, signer=None), **kw)
    return NativeContext(prov)


def st(rows):
    return [r["status"] for r in rows]


class WorkbookFullRows(SimpleTestCase):
    def test_every_full_row_is_mapped_full_and_implemented(self):
        for r in load_api_rows():
            if r["automation_level"] == "FULL":
                self.assertEqual(r["coverage"], "full", r["api_check"])
                self.assertTrue(r["checks"], r["api_check"])
                for c in r["checks"]:
                    if c.startswith("oci_"):
                        self.assertIn(c, NATIVE_CHECKS, c)


class Identity(SimpleTestCase):
    def users(self, c, rows):
        c.provider._nca_priv_cache = rows

    def u(self, name, mfa, idp=None, console=True):
        return NS(id=name, name=name, email=f"{name}@x.com", is_mfa_activated=mfa, identity_provider_id=idp,
                  capabilities=NS(can_use_console_password=console))

    def test_privileged_mfa(self):
        c = ctx()
        self.users(c, [(self.u("a", True), ["Administrators"]), (self.u("b", False), ["Administrators"]),
                       (self.u("fed", False, idp="idp"), ["Administrators"]), (self.u("svc", False, console=False), ["Administrators"])])
        self.assertEqual(st(x.oci_privileged_users_mfa_enabled(c)), ["PASS", "FAIL", "MANUAL"])

    @mock.patch.dict("os.environ", {"NCA_APPROVED_ADMINS": ""})
    def test_admin_population_manual_when_allowlist_missing(self):
        c = ctx()
        self.users(c, [(self.u("a", True), ["Administrators"])])
        self.assertEqual(st(x.oci_admin_population_approved(c)), ["MANUAL"])

    @mock.patch.dict("os.environ", {"NCA_APPROVED_ADMINS": "a@x.com"})
    def test_admin_population_with_allowlist(self):
        c = ctx()
        self.users(c, [(self.u("a", True), ["Administrators"]), (self.u("b", True), ["Administrators"])])
        self.assertEqual(st(x.oci_admin_population_approved(c)), ["PASS", "FAIL"])

    def test_public_and_cross_tenancy_grants(self):
        pols = [NS(id="1", name="ok", statements=["Allow group G to read buckets in tenancy", "Define tenancy Other as ocid1"]),
                NS(id="2", name="pub", statements=["Allow any-user to read objects in tenancy"]),
                NS(id="4", name="svc", statements=["Allow any-user to use fn-function in compartment x where all {request.principal.type='serviceconnector'}"]),
                NS(id="3", name="x", statements=["Endorse group G to read buckets in tenancy Other"]),
                NS(id="5", name="agent", statements=["Endorse any-user to { WLP_LOG_CREATE } in any-tenancy where all { request.principal.type = 'workloadprotectionagent' }"])]
        with mock.patch.object(x, "_all", return_value=pols):
            self.assertEqual(st(x.oci_iam_no_public_or_cross_tenancy_grants(ctx())), ["PASS", "FAIL", "PASS", "FAIL", "PASS"])

    def test_dynamic_group_without_rule_is_manual(self):
        with mock.patch.object(x, "_all", return_value=[NS(id="1", name="d", lifecycle_state="ACTIVE", matching_rule="")]):
            self.assertEqual(st(x.oci_iam_dynamic_groups_scoped(ctx())), ["MANUAL"])

    def test_dynamic_groups(self):
        gs = [NS(id="1", name="scoped", lifecycle_state="ACTIVE", matching_rule="ALL {instance.compartment.id = 'ocid1.compartment.x'}"),
              NS(id="2", name="wide", lifecycle_state="ACTIVE", matching_rule="ANY {resource.type = 'fnfunc'}")]
        with mock.patch.object(x, "_all", return_value=gs):
            self.assertEqual(st(x.oci_iam_dynamic_groups_scoped(ctx())), ["PASS", "FAIL"])


class Network(SimpleTestCase):
    def rules(self, c, rows):
        c.provider._nca_net_cache = [("r1", NS(id="c1"), "SecurityList", "id%d" % i, "sl%d" % i, r) for i, r in enumerate(rows)]

    @mock.patch.dict("os.environ", {"NCA_APPROVED_PUBLIC_PORTS": "80,443"})
    def test_unrestricted_ingress(self):
        c = ctx()
        self.rules(c, [[("0.0.0.0/0", "6", (443, 443))],            # approved
                       [("0.0.0.0/0", "6", (8080, 8080))],          # not approved
                       [("10.0.0.0/8", "6", (22, 22))],             # private
                       [("0.0.0.0/0", "all", None)],                # everything
                       [("::/0", "17", (1, 65535))]])               # all udp ports
        self.assertEqual(st(x.oci_network_no_unrestricted_ingress(c)), ["PASS", "FAIL", "PASS", "FAIL", "FAIL"])

    def test_database_ports(self):
        c = ctx()
        self.rules(c, [[("0.0.0.0/0", "6", (1521, 1521))], [("0.0.0.0/0", "6", (443, 443))], [("0.0.0.0/0", "6", (1000, 2000))]])
        self.assertEqual(st(x.oci_network_no_public_database_ports(c)), ["FAIL", "PASS", "FAIL"])

    def test_dns_dnssec_and_dkim(self):
        zones = [NS(id="z", name="a.com", lifecycle_state="ACTIVE", dnssec_state="DISABLED"),
                 NS(id="y", name="b.com", lifecycle_state="ACTIVE", dnssec_state="ENABLED")]
        with mock.patch.object(x, "_all", return_value=zones):
            self.assertEqual(st(x.oci_dns_security_configuration(ctx())), ["FAIL", "PASS"] * 1 + [] if False else ["FAIL", "PASS"])
        c = ctx()
        with mock.patch.object(x, "_all", return_value=zones[:1]), mock.patch.object(c, "client", return_value=object()), \
                mock.patch.object(x, "_rrset", side_effect=lambda cl, z, d, t, comp: [1] if t == "MX" or d.startswith("google._domainkey") else []):
            self.assertEqual(st(x.oci_dns_dkim_records(c)), ["PASS"])
        with mock.patch.object(x, "_all", return_value=zones[:1]), mock.patch.object(c, "client", return_value=object()), \
                mock.patch.object(x, "_rrset", side_effect=lambda cl, z, d, t, comp: [1] if t == "MX" else []):
            self.assertEqual(st(x.oci_dns_dkim_records(c)), ["MANUAL"])


class Vulnerability(SimpleTestCase):
    def test_cloud_guard_sla(self):
        now = datetime.now(timezone.utc)
        mk = lambda lvl, age: NS(id=lvl + str(age), risk_level=lvl, resource_name="r", resource_type="t", compartment_id="c",
                                 time_first_detected=now - timedelta(days=age))
        c = ctx()
        c.provider._nca_cg_cache = [mk("CRITICAL", 40), mk("HIGH", 5), mk("LOW", 400)]
        self.assertEqual(st(x.oci_cloudguard_critical_high_sla(c)), ["FAIL"])
        c2 = ctx()
        c2.provider._nca_cg_cache = [mk("HIGH", 5)]
        self.assertEqual(st(x.oci_cloudguard_critical_high_sla(c2)), ["PASS"])
        c3 = ctx()
        c3.provider._nca_cg_cache = [mk("LOW", 400)]
        self.assertEqual(x.oci_cloudguard_critical_high_sla(c3), [])  # nothing in scope -> not applicable

    def test_scan_freshness(self):
        now = datetime.now(timezone.utc)
        inst = lambda i: NS(id=i, display_name=i, lifecycle_state="RUNNING")
        results = [NS(instance_id="fresh", time_finished=now - timedelta(days=2), time_started=None),
                   NS(instance_id="stale", time_finished=now - timedelta(days=90), time_started=None)]
        items = [("r1", NS(id="c1", name="c1"), inst(i)) for i in ("fresh", "stale", "never")]
        with mock.patch.object(x, "_each_comp_region", return_value=items), mock.patch.object(x, "_all", return_value=results):
            self.assertEqual(st(x.oci_vss_scans_recent(ctx())), ["PASS", "FAIL", "FAIL"])

    def test_patch_compliance(self):
        inst = lambda i: NS(id=i, display_name=i, lifecycle_state="RUNNING")
        items = [("r1", NS(id="c1", name="c1"), inst(i)) for i in ("ok", "behind", "unmanaged")]
        mis = [NS(display_name="ok", updates_available=0), NS(display_name="behind", updates_available=3)]
        with mock.patch.object(x, "_each_comp_region", return_value=items), mock.patch.object(x, "_all", return_value=mis):
            self.assertEqual(st(x.oci_os_patch_compliance(ctx())), ["PASS", "FAIL", "FAIL"])

    def test_api_error_surfaces(self):
        c = ctx()
        with mock.patch.object(x, "_each_comp_region", return_value=[("r1", NS(id="c1", name="c"), NS(id="i", display_name="i", lifecycle_state="RUNNING"))]), \
                mock.patch.object(x, "_all", side_effect=RuntimeError("403")):
            x.oci_os_patch_compliance(c)
        self.assertTrue(c.errors)


class Logging(SimpleTestCase):
    def test_log_retention_requires_archive(self):
        log = NS(id="l", display_name="l", is_enabled=True, retention_duration=180)  # Logging service retention is expressed in days (max 180)
        c = ctx()
        with mock.patch.object(x, "_all", side_effect=[[NS(id="lg")], [log]]), mock.patch.object(x, "_connectors", return_value=[]):
            self.assertEqual(st(x.oci_log_retention_12_months(c)), ["FAIL"])

    def test_log_bucket_lock(self):
        conn = NS(target=NS(bucket_name="b", namespace="ns"))
        for rules, expected in (([NS(time_rule_locked=datetime.now(timezone.utc))], "PASS"), ([NS(time_rule_locked=None)], "FAIL")):
            with mock.patch.object(x, "_connectors", return_value=[("r1", NS(id="c1"), conn)]), mock.patch.object(x, "_bucket_rules", return_value=rules):
                self.assertEqual(st(x.oci_log_bucket_retention_locked(ctx())), [expected])
        with mock.patch.object(x, "_connectors", return_value=[]):
            self.assertEqual(x.oci_log_bucket_retention_locked(ctx()), [])


class MultiTier(SimpleTestCase):
    def test_public_ip_instance_fails_private_passes_and_adb(self):
        inst = lambda n: NS(id=n, display_name=n, lifecycle_state="RUNNING")
        items = [("r1", NS(id="c1", name="c1"), inst("pub")), ("r1", NS(id="c1", name="c1"), inst("priv"))]
        vnics = {"pub": NS(public_ip="1.2.3.4"), "priv": NS(public_ip=None)}
        c = ctx()
        fake_vnet = NS(get_vnic=lambda vid: NS(data=vnics[vid]))
        with mock.patch.object(x, "_each_comp_region", side_effect=[items, []]),                 mock.patch.object(x, "_all", side_effect=lambda ctx_, cls, m, region, **kw: [NS(vnic_id=kw["instance_id"], lifecycle_state="ATTACHED")]),                 mock.patch.object(c, "client", return_value=fake_vnet):
            rows = x.oci_backend_tiers_not_publicly_addressable(c)
        self.assertEqual(st(rows), ["FAIL", "PASS"])
