import logging
import types
from unittest import mock

from django.test import SimpleTestCase

from nca import engine
from nca.engine import ErrorCapture, execute_checks, run_prowler_check


def _fake_module(check_id, reports=None, raises=None, log_error=None):
    class _Check:
        CheckTitle = "t"
        Severity = types.SimpleNamespace(value="high")
        ServiceName = check_id.split("_")[0]
        ResourceType = "Bucket"
        Remediation = None

        def execute(self):
            if log_error:
                logging.getLogger().error(log_error)
            if raises:
                raise raises
            return reports or []

    m = types.ModuleType(check_id)
    setattr(m, check_id, _Check)
    return m


def _rep(status, rid="r"):
    return types.SimpleNamespace(status=status, resource_id=rid, resource_name=rid, region="r1", compartment_id="c",
                                 status_extended="x", resource=None)


class RunProwlerCheck(SimpleTestCase):
    def run_check(self, mod, cid="objectstorage_x"):
        cap = ErrorCapture()
        logging.getLogger().addHandler(cap)
        try:
            with mock.patch.object(engine.importlib, "import_module", return_value=mod):
                return run_prowler_check(cid, cap)
        finally:
            logging.getLogger().removeHandler(cap)

    def test_pass(self):
        o = self.run_check(_fake_module("objectstorage_x", [_rep("PASS")]))
        self.assertEqual((o.status, o.counts["PASS"]), ("PASS", 1))

    def test_fail_dominates(self):
        self.assertEqual(self.run_check(_fake_module("objectstorage_x", [_rep("PASS"), _rep("FAIL", "b")])).status, "FAIL")

    def test_no_resources_is_not_applicable(self):
        o = self.run_check(_fake_module("objectstorage_x", []))
        self.assertEqual((o.status, o.reason), ("NOT_APPLICABLE", "NO_RESOURCES"))

    def test_logged_service_error_turns_empty_result_into_error(self):
        # Prowler services swallow API errors into logs; an empty result must not look like "no resources"
        o = self.run_check(_fake_module("objectstorage_x", [], log_error="Error listing: ServiceError status: 404 NotAuthorizedOrNotFound"))
        self.assertEqual((o.status, o.reason), ("ERROR", "PERMISSION_DENIED"))

    def test_generic_api_error(self):
        o = self.run_check(_fake_module("objectstorage_x", [], log_error="Error listing: connection reset"))
        self.assertEqual((o.status, o.reason), ("ERROR", "API_ERROR"))

    def test_exception_in_check_is_error(self):
        o = self.run_check(_fake_module("objectstorage_x", raises=RuntimeError("boom")))
        self.assertEqual(o.status, "ERROR")
        self.assertIn("boom", o.message)

    def test_missing_check_is_unsupported(self):
        cap = ErrorCapture()
        with mock.patch.object(engine.importlib, "import_module", side_effect=ModuleNotFoundError()):
            o = run_prowler_check("objectstorage_missing", cap)
        self.assertEqual((o.status, o.reason), ("ERROR", "UNSUPPORTED"))

    def test_partial_listing_failure_cannot_pass(self):
        o = self.run_check(_fake_module("objectstorage_x", [_rep("PASS")], log_error="Error in compartment B: timeout"))
        self.assertEqual(o.status, "ERROR")


class ExecuteChecks(SimpleTestCase):
    def test_native_and_prowler_dispatch(self):
        fake_native = {"fn": lambda ctx: [{"status": "FAIL", "resource_id": "v", "resource_name": "v"}],
                       "service": "s", "severity": "low", "title": "t", "remediation_text": "", "remediation_cli": ""}
        with mock.patch.dict(engine.NATIVE_CHECKS, {"oci_fake": fake_native}), \
                mock.patch.object(engine.importlib, "import_module", return_value=_fake_module("identity_a", [_rep("PASS")])):
            outs = execute_checks(object(), ["oci_fake", "identity_a"])
        self.assertEqual([(o.check_id, o.source, o.status) for o in outs],
                         [("oci_fake", "native", "FAIL"), ("identity_a", "prowler", "PASS")])

    def test_native_check_error_is_reported(self):
        def boom(ctx):
            ctx.add_error("denied", "somewhere")
            return []
        spec = {"fn": boom, "service": "s", "severity": "low", "title": "t", "remediation_text": "", "remediation_cli": ""}
        with mock.patch.dict(engine.NATIVE_CHECKS, {"oci_fake": spec}):
            (o,) = execute_checks(object(), ["oci_fake"])
        self.assertEqual(o.status, "ERROR")


class BuildProviderCredentials(SimpleTestCase):
    KW = {"tenancy": "ocid1.tenancy", "user": "ocid1.user", "fingerprint": "aa:bb", "key_content": "PEM"}

    def run_build(self, file_exists, platform_kw, **kwargs):
        calls = {}

        class P:
            _bootstrap_region = "us-ashburn-1"

            def __init__(self, **kw):
                calls.update(kw)
        fake_mod = types.SimpleNamespace(OraclecloudProvider=P)
        reason = "" if platform_kw else "no OCI provider is registered in the platform"
        with mock.patch.dict("sys.modules", {"prowler.providers.oraclecloud.oraclecloud_provider": fake_mod}), \
                mock.patch.object(engine.os.path, "isfile", return_value=file_exists), \
                mock.patch.object(engine, "platform_oci_credentials", return_value=(platform_kw, reason)):
            engine.build_provider(tenant_id="t", **kwargs)
        return calls

    def test_platform_database_credentials_are_used_first_even_if_a_config_file_exists(self):
        calls = self.run_build(True, self.KW)
        self.assertEqual(calls["user"], "ocid1.user")
        self.assertNotIn("oci_config_file", calls)

    def test_stored_region_is_the_session_region_and_is_restored_afterwards(self):
        seen = {}

        class P:
            _bootstrap_region = "us-ashburn-1"

            def __init__(self, **kw):
                seen["during"] = P._bootstrap_region
                seen["kwargs"] = kw
        fake_mod = types.SimpleNamespace(OraclecloudProvider=P)
        kw = {**self.KW, "bootstrap_region": "uk-london-1"}
        with mock.patch.dict("sys.modules", {"prowler.providers.oraclecloud.oraclecloud_provider": fake_mod}), \
                mock.patch.object(engine.os.path, "isfile", return_value=False), \
                mock.patch.object(engine, "platform_oci_credentials", return_value=(kw, "")):
            engine.build_provider(tenant_id="t")
        self.assertEqual(seen["during"], "uk-london-1")
        self.assertNotIn("bootstrap_region", seen["kwargs"])   # not passed to the provider: all regions are still audited
        self.assertIsNone(seen["kwargs"].get("region"))
        self.assertEqual(P._bootstrap_region, "us-ashburn-1")  # global default restored

    def test_config_file_is_only_a_fallback(self):
        calls = self.run_build(True, None)
        self.assertIn("oci_config_file", calls)

    def test_explicit_config_file_overrides_the_database(self):
        calls = self.run_build(True, self.KW, config_file="/tmp/oci")
        self.assertIn("oci_config_file", calls)
        self.assertNotIn("user", calls)

    def test_clear_error_when_no_credentials_anywhere(self):
        with self.assertRaises(engine.OciCredentialsMissing) as cm:
            self.run_build(False, None)
        self.assertIn("No OCI credentials", str(cm.exception))
        self.assertIn("no OCI provider is registered", str(cm.exception))
