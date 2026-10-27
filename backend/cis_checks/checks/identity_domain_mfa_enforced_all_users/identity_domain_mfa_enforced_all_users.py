"""CIS 1.2. With PROWLER_ROOT / PROWLER_PYTHON set, this runs security_platform's Prowler check
identity_user_mfa_enabled_console_access on the identity domain users (as idcs_to_prowler_oci.py does):
every user who can use a console password must have MFA activated (mfaStatus ENROLLED).
Without Prowler, the same rule is applied by the built-in logic below."""
from cis_checks import prowler_bridge
from cis_checks.base import EXT_CAPABILITIES, EXT_MFA, Check
from cis_checks.context import admin_user_ids, federated_note, is_federated_user, user_ext, users

PROWLER_CHECK = "identity_user_mfa_enabled_console_access"
SAMPLE = 25


def _builtin(all_users):
    """Same rule as the Prowler check: users with a console password and MFA not activated."""
    out = []
    for u in all_users:
        if not user_ext(u, EXT_CAPABILITIES, "canUseConsolePassword", True):
            continue
        ok = (user_ext(u, EXT_MFA, "mfaStatus") or "").upper() == "ENROLLED"
        out.append({"id": u["id"], "status": "PASS" if ok else "FAIL"})
    return out


class identity_domain_mfa_enforced_all_users(Check):
    def execute(self, api, ctx):
        all_users = users(api, ctx)
        by_id = {u["id"]: u for u in all_users}
        admins = admin_user_ids(api, ctx)["user_ids"]
        evidence, severity, engine_note = {}, None, ""

        findings = None
        if prowler_bridge.configured():
            try:
                result = prowler_bridge.run(api, ctx)[PROWLER_CHECK]
                findings = [{"id": f["resource_id"], "status": f["status"]} for f in result["findings"]]
                severity = result["severity"]
                evidence["engine"] = "OCI identity check: console-password users must have MFA"
                evidence["check_severity"] = severity
            except prowler_bridge.ProwlerError as exc:
                evidence["check_error"] = str(exc)
                engine_note = f" The OCI identity check could not run ({exc}), so the built-in check was used."
        if findings is None:
            evidence["engine"] = "Built-in check: console-password users must have MFA"
            findings = _builtin(all_users)

        failed = []
        for f in findings:
            if f["status"] != "FAIL":
                continue
            u = by_id.get(f["id"], {})
            failed.append(
                {
                    "user": u.get("userName") or f["id"],
                    "active": u.get("active", True),
                    "federated": is_federated_user(u) if u else None,
                    "privileged": f["id"] in admins,
                    "mfa_status": user_ext(u, EXT_MFA, "mfaStatus") if u else None,
                }
            )
        failed.sort(key=lambda r: (not r["privileged"], not r["active"]))
        active_failed = [r for r in failed if r["active"]]
        evidence.update(
            {
                "users_checked": len(findings),
                "users_passed": len(findings) - len(failed),
                "users_failed": len(failed),
                "failed_active": len(active_failed),
                "failed_inactive": len(failed) - len(active_failed),
                "failed_privileged": sum(r["privileged"] for r in failed),
                "users_without_console_password": len(all_users) - len(findings),
                "failed_sample": failed[:SAMPLE],
            }
        )
        note = federated_note(ctx)

        if failed:
            inactive = evidence["failed_inactive"]
            reason = (
                f"{len(active_failed):,} active users with a console password have not activated MFA"
                f"{f', including {evidence['failed_privileged']:,} administrators' if evidence['failed_privileged'] else ''}."
            )
            if inactive:
                reason += f" Another {inactive:,} inactive accounts also have a console password without MFA ({len(failed):,} of {len(findings):,} in total)."
            out = self.result("FAIL", f"{reason}{engine_note} {note}".strip(), evidence)
        elif note:
            reason = f"All {len(findings)} users with a console password have MFA activated; federated users' MFA must also be confirmed in the external identity provider.{engine_note}"
            out = self.result("PARTIAL", f"{reason} {note}", evidence)
        else:
            out = self.result("PASS", f"All {len(findings)} users with a console password have MFA activated.{engine_note}", evidence)
        if severity:
            out["severity"] = severity
        return out
