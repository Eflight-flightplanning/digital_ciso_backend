"""Payment setup snapshots for CIS 4.2.1: fingerprint today's payment setups and compare with the previous run.

Full bank account numbers are never kept: each record keeps the bank, the last 4 characters and a keyed hash
(HMAC-SHA256 with ctx["fingerprint_key"], which the runner derives from the server's secret key), so a changed
account is detected without storing the account itself.

Field names differ between pods and releases, so each value is read from the first field that is present;
`fields_seen` in the evidence records which fields the pod actually returned.
"""
import hashlib
import hmac

# value fields: a change in any of these is a change in where or how money is paid
VALUE_FIELDS = ("hash", "bank", "type", "amount", "order")


def _first(row, *names):
    for n in names:
        v = row.get(n)
        if v not in (None, ""):
            return v
    return None


def _digest(key, *parts):
    text = "|".join("" if p is None else str(p).strip().upper().replace(" ", "") for p in parts)
    if key:
        return hmac.new(key, text.encode(), hashlib.sha256).hexdigest()[:24]
    return hashlib.sha256(text.encode()).hexdigest()[:24]


def _last4(account):
    a = "".join(ch for ch in str(account or "") if ch.isalnum())
    return f"…{a[-4:]}" if a else None


def payment_method_snapshot(items, key=None):
    """{record key: fingerprint} for HCM personalPaymentMethods items."""
    snap = {}
    for it in items:
        person = _first(it, "PersonNumber", "PersonId", "PayrollRelationshipNumber", "AssignmentNumber")
        method = _first(it, "PersonalPaymentMethodId", "PersonalPaymentMethodCode", "Name")
        account = _first(it, "BankAccountNumber", "AccountNumber", "IBAN", "Iban", "BankAccountId")
        bank = _first(it, "BankName", "BankBranchName", "BankId")
        rec_key = f"{person}:{method}"
        snap[rec_key] = {
            "owner": str(person) if person is not None else None,
            "label": _first(it, "Name", "PersonalPaymentMethodCode", "OrganizationPaymentMethodName"),
            "bank": bank,
            "last4": _last4(account),
            "hash": _digest(key, account, bank, _first(it, "BankBranchName", "BranchNumber")),
            "type": _first(it, "PaymentAmountType", "PaymentType"),
            "amount": _first(it, "Amount", "Percentage", "PercentageValue"),
            "order": _first(it, "ProcessingOrder", "Priority"),
            "updated": _first(it, "LastUpdateDate", "LastUpdatedDate"),
            "by": _first(it, "LastUpdatedBy"),
        }
    return snap


def bank_account_snapshot(items, key=None):
    """{record key: fingerprint} for Financials externalBankAccounts items (supplier and payee bank accounts)."""
    snap = {}
    for it in items:
        account = _first(it, "BankAccountNumber", "AccountNumber", "IBAN", "Iban")
        bank = _first(it, "BankName", "BankNumber", "BankId")
        rec_key = str(_first(it, "BankAccountId", "ExternalBankAccountId") or _digest(key, account, bank))
        snap[rec_key] = {
            "owner": _first(it, "AccountName", "PartyName", "SupplierName", "AccountHolderName"),
            "label": _first(it, "AccountName", "AccountType"),
            "bank": bank,
            "last4": _last4(account),
            "hash": _digest(key, account, bank, _first(it, "BranchNumber", "BankBranchName")),
            "type": _first(it, "AccountType", "CurrencyCode"),
            "amount": None,
            "order": None,
            "updated": _first(it, "LastUpdateDate", "LastUpdatedDate"),
            "by": _first(it, "LastUpdatedBy"),
        }
    return snap


def fields_seen(items):
    return sorted({k for it in items[:50] for k, v in it.items() if v not in (None, "")})


def diff(previous, current):
    """Added, changed and removed records between two snapshots (each a list of dicts)."""
    added = [{"key": k, "change": "added", **current[k]} for k in current.keys() - previous.keys()]
    removed = [{"key": k, "change": "removed", **previous[k]} for k in previous.keys() - current.keys()]
    changed = []
    for k in current.keys() & previous.keys():
        before, after = previous[k], current[k]
        fields = [f for f in VALUE_FIELDS if before.get(f) != after.get(f)]
        if fields:
            what = ["bank account" if f == "hash" else f for f in fields]
            changed.append({
                "key": k, "change": "changed", "fields_changed": what, **after,
                "before": {"bank": before.get("bank"), "last4": before.get("last4"), "type": before.get("type"),
                           "amount": before.get("amount"), "order": before.get("order")},
            })
    order = lambda r: (str(r.get("owner") or ""), r["key"])
    return sorted(added, key=order), sorted(changed, key=order), sorted(removed, key=order)
