from cis_checks.base import EXT_MFA, Check
from cis_checks.context import admin_user_ids, factor_settings, federated_note, user_ext, users

PHISHING_RESISTANT = {"FIDO_AUTHENTICATOR", "FIDO", "PASSKEY"}
WEAK_FLAGS = {"smsEnabled": "SMS", "emailEnabled": "Email", "phoneCallEnabled": "Phone call"}


class identity_domain_phishing_resistant_mfa_admins(Check):
    def execute(self, api, ctx):
        settings = factor_settings(api, ctx)
        fido_enabled = bool(settings.get("fidoAuthenticatorEnabled"))
        weak_enabled = [label for flag, label in WEAK_FLAGS.items() if settings.get(flag)]

        admin_ids = admin_user_ids(api, ctx)["user_ids"]
        admins = [u for u in users(api, ctx) if u["id"] in admin_ids and u.get("active")]
        rows, not_enrolled, weak = [], 0, 0
        for u in admins:
            status = (user_ext(u, EXT_MFA, "mfaStatus") or "").upper()
            factor = (user_ext(u, EXT_MFA, "preferredAuthenticationFactor") or "").upper()
            resistant = factor in PHISHING_RESISTANT
            not_enrolled += status != "ENROLLED"
            weak += status == "ENROLLED" and not resistant
            rows.append({"user": u.get("userName"), "mfa_status": status or None, "preferred_factor": factor or None, "phishing_resistant": resistant})

        evidence = {
            "fido_enabled": fido_enabled,
            "weak_factors_enabled_in_domain": weak_enabled,
            "admins": rows,
            "admin_count": len(rows),
            "admins_not_enrolled": not_enrolled,
            "admins_with_non_resistant_factor": weak,
        }
        note = federated_note(ctx)

        if not fido_enabled:
            return self.result("FAIL", f"FIDO authenticators are not enabled in the identity domain, so administrators cannot use a phishing-resistant factor. {note}".strip(), evidence)
        if not rows:
            return self.result("PARTIAL", f"No identity domain administrators were identified; confirm the privileged user categories in Fusion. {note}".strip(), evidence)
        if not_enrolled or weak:
            reason = f"{not_enrolled} of {len(rows)} administrators are not enrolled in MFA and {weak} use a factor that is not phishing-resistant."
            return self.result("FAIL", f"{reason} {note}".strip(), evidence)
        reason = (
            f"All {len(rows)} administrators prefer a phishing-resistant factor. The API shows the preferred factor, not an "
            "enforcement rule, so confirm that weaker factors are disallowed for privileged user categories."
        )
        return self.result("PARTIAL", f"{reason} {note}".strip(), evidence)
