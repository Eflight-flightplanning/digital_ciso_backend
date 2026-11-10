"""CIS 4.2.1: changes to payment setups are monitored.

Outcome delta: each run takes a snapshot of the payment setups and compares it with the previous run's.
  - employees' personal payment methods (HCM REST personalPaymentMethods): where salaries are paid
  - external (supplier / payee) bank accounts (Financials REST externalBankAccounts), when the pod user can read them
Combined with role assignments (HCM REST userAccounts): who holds roles that can change payment setups.

FAIL when, since the previous run, a payment method or bank account was changed or removed, or one was added for a
person who holds payment-setup roles or entered by someone else. New payment methods alone (normal for new hires)
are listed for review. The first run records the baseline. Whether Fusion audit policies or Risk Management controls
(60002, 60005, 60007) are enabled is not visible through the API and stays with the assessor.
"""
from cis_checks import fusion_roles, payment_setup
from cis_checks.base import Check, env_list
from cis_checks.fusion_client import FusionError

SAMPLE = 100
PAYMENT_ROLE_PATTERNS = fusion_roles.PAYROLL_PATTERNS + [
    "ACCOUNTS_PAYABLE_MANAGER", "PAYABLES_MANAGER", "CASH_MANAGER", "DISBURSEMENT_PROCESS_MANAGER", "SUPPLIER_ADMINISTRATOR",
]
NOT_VISIBLE = "Whether Fusion audit policies for payment setup fields, or Risk Management controls 60002, 60005 and 60007, are enabled."


def payment_role_patterns():
    return [p.upper() for p in env_list("PAYMENT_ROLE_PATTERNS")] or PAYMENT_ROLE_PATTERNS


class fusion_payment_setup_changes_monitored(Check):
    def execute(self, api, ctx):
        client = ctx.get("fusion_client")
        if client is None or not client.configured:
            result = self.result("MANUAL", "Could not complete: no Fusion pod is configured (Connection page), so payment setups cannot be read.")
            result["not_assessed"] = True
            return result
        key = ctx.get("fingerprint_key")
        methods, methods_path = client.payment_methods()  # an error here means the control could not complete
        current = {"payment_methods": payment_setup.payment_method_snapshot(methods, key)}
        sources = {"payment_methods": methods_path}
        bank_note = None
        try:
            banks, banks_path = client.external_bank_accounts()
            current["bank_accounts"] = payment_setup.bank_account_snapshot(banks, key)
            sources["bank_accounts"] = banks_path
        except FusionError as exc:  # optional: the pod user may not have Financials access
            bank_note = f"Supplier bank accounts not read ({exc}); only employee payment methods are compared."
        ctx.setdefault("snapshot_current", {}).update(current)

        # who can change payment setups, by person number and by username
        holders_by_user, user_by_person = {}, {}
        roles_note = None
        try:
            pats = payment_role_patterns()
            for u in fusion_roles.load(ctx):
                if u.get("person_number"):
                    user_by_person[str(u["person_number"])] = u["user"]
                roles = fusion_roles.matching(u["roles"], pats) if not u["suspended"] else []
                if roles:
                    holders_by_user[(u["user"] or "").lower()] = roles
        except Exception as exc:
            roles_note = f"Role assignments not read ({type(exc).__name__}); changes are not matched to payment-setup roles."

        previous = ctx.get("snapshot_previous") or {}
        evidence = {
            "source": "Snapshot comparison with the previous run: " + ", ".join(f"{k} ({v})" for k, v in sources.items()),
            "rule": ("FAIL when a payment method or bank account was changed or removed since the previous run, or added for a "
                     "payment-setup role holder or by another user"),
            "payment_methods": len(current["payment_methods"]),
            "bank_accounts": len(current["bank_accounts"]) if "bank_accounts" in current else None,
            "payment_role_holders": len(holders_by_user),
            "fields_seen_payment_methods": payment_setup.fields_seen(methods),
            "previous_snapshot_at": previous.get("_taken_at"),
            "not_assessed_here": NOT_VISIBLE,
        }
        for note in (bank_note, roles_note):
            if note:
                evidence.setdefault("notes", []).append(note)

        if "payment_methods" not in previous:
            ctx["payment_changes_all"] = []
            return self.result(
                "ERROR",
                f"Could not complete: baseline recorded ({len(current['payment_methods'])} employee payment methods"
                + (f", {len(current['bank_accounts'])} supplier bank accounts" if "bank_accounts" in current else "")
                + "). Changes are reported from the next run, so run the assessment daily.",
                evidence,
            )

        changes = []
        for name, label in (("payment_methods", "Employee payment method"), ("bank_accounts", "Supplier bank account")):
            if name not in current or name not in previous:
                continue
            added, changed, removed = payment_setup.diff(previous[name], current[name])
            for c in added + changed + removed:
                owner_user = user_by_person.get(str(c.get("owner"))) if name == "payment_methods" else None
                by = (c.get("by") or "").lower()
                c.update({
                    "setup": label,
                    "owner_user": owner_user,
                    "owner_holds_payment_role": bool(owner_user and owner_user.lower() in holders_by_user),
                    "changed_by_other_user": bool(by and owner_user and by != owner_user.lower()),
                    "changed_by_payment_role_holder": bool(by and by in holders_by_user),
                })
                c["risky"] = c["change"] != "added" or c["owner_holds_payment_role"] or c["changed_by_other_user"]
                changes.append(c)
        ctx["payment_changes_all"] = changes  # full list, saved by the runner for the Identity risks page

        risky = [c for c in changes if c["risky"]]
        evidence.update({
            "changes": len(changes),
            "changes_needing_review": len(risky),
            "added": sum(c["change"] == "added" for c in changes),
            "changed": sum(c["change"] == "changed" for c in changes),
            "removed": sum(c["change"] == "removed" for c in changes),
            "changes_sample": [{k: v for k, v in c.items() if k not in ("hash", "key")} for c in changes[:SAMPLE]],
        })
        since = f"since the previous run ({previous.get('_taken_at') or 'date unknown'})"
        if risky:
            own = sum(c["owner_holds_payment_role"] for c in risky)
            reason = (f"{len(risky)} payment setup change(s) {since} need review: {evidence['changed']} changed, "
                      f"{evidence['removed']} removed" + (f", {own} for people who hold payment-setup roles" if own else "")
                      + ". Confirm each was authorised.")
            return self.result("FAIL", reason, evidence)
        added_note = f" {evidence['added']} new payment method(s) were added and are listed for review." if changes else ""
        return self.result("PASS", f"No payment method or bank account was changed or removed {since}.{added_note}", evidence)
