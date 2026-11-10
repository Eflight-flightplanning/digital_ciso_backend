"""CIS 4.2.1 payment setup changes by outcome delta: baseline, then compare with the previous run."""
import copy

from django.test import SimpleTestCase

from cis_checks.context import prepare
from cis_checks.registry import load_checks

from .fakes import FakeFusion, FakeIdcs, compliant_tenant

KEY = b"test-key"


def method(person, account, bank="Bank A", pm_id=None, **extra):
    return {"PersonNumber": person, "PersonalPaymentMethodId": pm_id or f"PM{person}", "Name": "Salary", "BankName": bank,
            "BankAccountNumber": account, "PaymentAmountType": "PERCENTAGE", "Percentage": 100, **extra}


def user(name, person, *roles, suspended=False):
    return {"user": name, "person_number": person, "suspended": suspended, "guid": "G" + person,
            "roles": [{"code": r, "assigned": "2020-01-01T00:00:00+00:00", "assigned_by": "A"} for r in roles]}


USERS = [user("pay.admin", "100", "ORA_PAY_PAYROLL_ADMINISTRATOR_JOB"), user("emp", "200", "ORA_PER_EMPLOYEE_ABSTRACT")]
BASE = [method("100", "GB00BANK1234567"), method("200", "GB00BANK7654321")]


def run(fusion, previous=None):
    check = next(c for c in load_checks() if c.cis_id == "4.2.1")
    api = FakeIdcs(compliant_tenant())
    ctx = {"fusion_client": fusion, "fingerprint_key": KEY, "snapshot_previous": previous or {}}
    prepare(api, ctx)
    return check.execute(api, ctx), ctx


def baseline():
    _, ctx = run(FakeFusion(roles=USERS, payments=BASE))
    return {**ctx["snapshot_current"], "_taken_at": "2026-10-30T06:00:00+00:00"}


class PaymentSetupTests(SimpleTestCase):
    def test_first_run_records_the_baseline(self):
        result, ctx = run(FakeFusion(roles=USERS, payments=BASE))
        self.assertEqual(result["status"], "ERROR")
        self.assertIn("baseline recorded", result["reason"])
        snap = ctx["snapshot_current"]["payment_methods"]
        self.assertEqual(len(snap), 2)
        self.assertNotIn("GB00BANK1234567", str(snap))  # only last 4 and a keyed hash are kept
        self.assertEqual(snap["100:PM100"]["last4"], "\u20264567")

    def test_changed_bank_account_fails_and_flags_role_holder(self):
        changed = copy.deepcopy(BASE)
        changed[0]["BankAccountNumber"] = "GB00EVIL0000001"
        result, ctx = run(FakeFusion(roles=USERS, payments=changed), baseline())
        self.assertEqual(result["status"], "FAIL")
        (change,) = ctx["payment_changes_all"]
        self.assertEqual(change["change"], "changed")
        self.assertEqual(change["fields_changed"], ["bank account"])
        self.assertEqual(change["owner_user"], "pay.admin")
        self.assertTrue(change["owner_holds_payment_role"])
        self.assertEqual(change["before"]["last4"], "\u20264567")

    def test_new_hire_payment_method_alone_passes(self):
        result, ctx = run(FakeFusion(roles=USERS, payments=BASE + [method("300", "GB00NEWH1111111")]), baseline())
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"]["added"], 1)
        self.assertEqual(len(ctx["payment_changes_all"]), 1)

    def test_removed_method_fails(self):
        result, _ = run(FakeFusion(roles=USERS, payments=[BASE[1]]), baseline())
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"]["removed"], 1)

    def test_supplier_bank_accounts_compared_when_readable(self):
        banks = [{"BankAccountId": "B1", "AccountName": "Acme Ltd", "BankName": "Bank Z", "BankAccountNumber": "DE001234"}]
        _, ctx = run(FakeFusion(roles=USERS, payments=BASE, banks=banks))
        prev = {**ctx["snapshot_current"], "_taken_at": "2026-10-30T06:00:00+00:00"}
        banks2 = [{**banks[0], "BankAccountNumber": "DE009999"}]
        result, ctx = run(FakeFusion(roles=USERS, payments=BASE, banks=banks2), prev)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(ctx["payment_changes_all"][0]["setup"], "Supplier bank account")

    def test_missing_financials_access_is_a_note(self):
        result, _ = run(FakeFusion(roles=USERS, payments=BASE), baseline())
        self.assertEqual(result["status"], "PASS")
        self.assertIn("Supplier bank accounts not read", result["evidence"]["notes"][0])

    def test_unavailable_payment_api_raises_for_the_runner(self):
        from cis_checks.fusion_client import FusionError

        with self.assertRaises(FusionError):
            run(FakeFusion(roles=USERS))
