"""CIS 1.1. With PROWLER_ROOT / PROWLER_PYTHON set, length and expiry come from security_platform's
Prowler checks (identity_password_policy_minimum_length_14, identity_password_policy_expires_within_365_days).
CIS 1.1 also requires history >= 5 and lockout <= 5 attempts, which Prowler does not check (its
prevents_reuse check wants 24), so those two are evaluated here. Without Prowler, all four are built in."""
from cis_checks import prowler_bridge
from cis_checks.base import Check
from cis_checks.context import federated_note

# System-managed, immutable policies hidden in the OCI Console (skipped, as Prowler does).
SYSTEM_POLICIES = {"SimplePasswordPolicy", "StandardPasswordPolicy"}
PROWLER_CHECKS = ["identity_password_policy_minimum_length_14", "identity_password_policy_expires_within_365_days"]
# Labels shown in the app for each external check.
CHECK_LABELS = {
    "identity_password_policy_minimum_length_14": "Minimum length (>= 14)",
    "identity_password_policy_expires_within_365_days": "Expiry (<= 365 days)",
}

# attribute: (comparison, benchmark value, label)
LENGTH_EXPIRY = {
    "minLength": (">=", 14, "minimum length"),
    "passwordExpiresAfter": ("<=", 365, "expiry (days)"),
}
HISTORY_LOCKOUT = {
    "numPasswordsInHistory": (">=", 5, "password history"),
    "maxIncorrectAttempts": ("<=", 5, "lockout after failed attempts"),
}


def _meets(op, actual, required):
    # A missing value, or 0 for expiry / lockout, means the setting is not enforced.
    if actual in (None, "", 0):
        return False
    return actual >= required if op == ">=" else actual <= required


def _evaluate(policy, requirements, source="CIS history / lockout"):
    rows = []
    for attr, (op, required, label) in requirements.items():
        actual = policy.get(attr)
        ok = _meets(op, actual, required)
        shown = "not set" if actual in (None, "", 0) else actual
        rows.append(
            {
                "source": source,
                "check": label,
                "policy": policy.get("name") or policy.get("id"),
                "status": "PASS" if ok else "FAIL",
                "detail": f"{label} {shown} (needs {op} {required})",
            }
        )
    return rows


class identity_domain_password_policy_length_rotation(Check):
    def execute(self, api, ctx):
        all_policies = prowler_bridge.password_policies(api, ctx)
        policies = [p for p in all_policies if p.get("id") not in SYSTEM_POLICIES]
        evidence = {
            "requirements": {"minLength": ">= 14", "passwordExpiresAfter": "<= 365", "numPasswordsInHistory": ">= 5", "maxIncorrectAttempts": "<= 5"},
            "system_policies_skipped": sorted(p.get("id") for p in all_policies if p.get("id") in SYSTEM_POLICIES),
        }
        note = federated_note(ctx)
        if not policies:
            return self.result("FAIL", "The identity domain has no configurable password policy.", evidence)

        rows, severity, engine_note = [], None, ""
        if prowler_bridge.configured():
            try:
                results = prowler_bridge.run(api, ctx)
                for check_id in PROWLER_CHECKS:
                    for f in results[check_id]["findings"]:
                        rows.append(
                            {
                                "source": CHECK_LABELS[check_id],
                                "check": results[check_id]["title"],
                                "policy": f["resource_name"],
                                "status": f["status"],
                                "detail": f["status_extended"],
                            }
                        )
                severity = prowler_bridge.highest(results[c]["severity"] for c in PROWLER_CHECKS)
                evidence["engine"] = "OCI identity checks (length, expiry) + CIS history and lockout"
                evidence["check_severity"] = {CHECK_LABELS[c]: results[c]["severity"] for c in PROWLER_CHECKS}
            except prowler_bridge.ProwlerError as exc:
                evidence["check_error"] = str(exc)
                engine_note = f" The OCI identity checks could not run ({exc}), so the built-in checks were used."
        if not rows:
            evidence.setdefault("engine", "Built-in password policy checks")
            for p in policies:
                rows.extend(_evaluate(p, LENGTH_EXPIRY, "Built-in length / expiry"))
        for p in policies:
            rows.extend(_evaluate(p, HISTORY_LOCKOUT))
        evidence["findings"] = rows

        failed = [r for r in rows if r["status"] == "FAIL"]
        if failed:
            detail = "; ".join(f"{r['policy']}: {r['detail']}" for r in failed[:6])
            reason = f"{len(failed)} of {len(rows)} password policy findings fail. {detail}.{engine_note}"
            result = self.result("FAIL", f"{reason} {note}".strip(), evidence)
        else:
            reason = (
                f"All {len(policies)} password policies require length >= 14, expiry <= 365 days, "
                f"history >= 5 and lockout after <= 5 failed attempts.{engine_note}"
            )
            result = self.result("PASS", f"{reason} {note}".strip(), evidence)
        if severity:
            result["severity"] = severity
        return result
