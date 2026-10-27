from cis_checks.base import EXT_CAPABILITIES, Check
from cis_checks.context import (
    admin_user_ids,
    console_policies,
    is_federated_user,
    rule_effect,
    rule_tests_groups,
    rule_text,
    signon_policies,
    user_ext,
    users,
)

SAMPLE = 25


class identity_domain_console_access_admins_only(Check):
    def execute(self, api, ctx):
        admins = admin_user_ids(api, ctx)
        capable = [
            u
            for u in users(api, ctx)
            if u.get("active")
            and not is_federated_user(u)
            and u["id"] not in admins["user_ids"]
            and user_ext(u, EXT_CAPABILITIES, "canUseConsolePassword", True)
        ]

        console = console_policies(signon_policies(api, ctx))
        rules = []
        for policy in console:
            for rule in policy["rules"]:
                if not rule["active"]:
                    continue
                text = rule_text(rule)
                rules.append(
                    {
                        "policy": policy["name"],
                        "rule": rule["name"],
                        "effect": rule_effect(rule),
                        "restricts_to_admin_group": any(g.lower() in text for g in admins["group_ids"] if g),
                        "mentions_groups": rule_tests_groups(rule),
                    }
                )
        group_rule = any(r["effect"] != "DENY" and (r["restricts_to_admin_group"] or r["mentions_groups"]) for r in rules)
        default_deny = bool(rules) and rules[-1]["effect"] == "DENY"

        evidence = {
            "admin_users": len(admins["user_ids"]),
            "non_admin_users_with_console_password": len(capable),
            "sample": [{"user": u.get("userName")} for u in capable[:SAMPLE]],
            "console_policies": [p["name"] for p in console],
            "console_rules": rules,
            "group_restricted_rule": group_rule,
            "default_deny_rule": default_deny,
        }

        if not console:
            return self.result("FAIL (provisional)", "Provisional: no OCI Console sign-on policy was found by name; confirm which policy protects the OCI Console.", evidence)
        if not (group_rule and default_deny):
            missing = [m for m, ok in (("a rule limited to administrative groups", group_rule), ("a final deny rule", default_deny)) if not ok]
            return self.result("FAIL", f"The OCI Console sign-on policy is missing {' and '.join(missing)}.", evidence)
        if capable:
            reason = (
                f"The console sign-on policy is limited to groups with a final deny rule, but {len(capable)} non-admin users still "
                "have the console password capability. In a Fusion identity domain this capability can be needed for application "
                "sign-in, so confirm whether it can be removed."
            )
            return self.result("PARTIAL", reason, evidence)
        return self.result("PASS", "Only administrators can use the console password, and the console sign-on policy is limited to groups with a final deny rule.", evidence)
