from cis_checks.base import Check
from cis_checks.context import console_policies, federated_note, signon_policies
from cis_checks.perimeters import perimeter_summary, rules_with_perimeters

SCOPE = "Identity domain side only; tenancy-level IAM network sources are NOT assessed from here."


class identity_domain_console_restricted_trusted_networks(Check):
    def execute(self, api, ctx):
        perimeters, wide_open = perimeter_summary(api, ctx)
        console = console_policies(signon_policies(api, ctx))
        rules = rules_with_perimeters(api, ctx, perimeters, console)
        console_rules = [
            {
                "policy": r["policy"],
                "name": r["rule"],
                "effect": r["effect"],
                "condition_group": r["condition_group"],
                "mentions_network": r["mentions_network"],
                "perimeters": r["perimeters"],
            }
            for r in rules
        ]
        conditions = [{"rule": r["rule"], "condition_group": r["condition_group"], "conditions": r["conditions"]} for r in rules]
        open_allow = [r for r in console_rules if r["effect"] != "DENY" and not r["mentions_network"]]
        wide_used = [w for w in wide_open if any(w["perimeter"] in r["perimeters"] for r in console_rules)]
        evidence = {
            "console_policies": [p["name"] for p in console],
            "console_rules": console_rules,
            "perimeters_defined": [p["name"] for p in perimeters],
            "condition_groups": conditions,
            "wide_open": wide_used,
        }
        note = federated_note(ctx)

        if not console:
            reason = f"Provisional: no OCI Console sign-on policy was found by name. {SCOPE}"
            return self.result("FAIL (provisional)", f"{reason} {note}".strip(), evidence)
        if not console_rules:
            reason = f"Provisional: the OCI Console sign-on policy was found but none of its rules could be read, so nothing proves access is network-restricted. {SCOPE}"
            return self.result("FAIL (provisional)", f"{reason} {note}".strip(), evidence)
        if open_allow:
            names = ", ".join(r["name"] or "?" for r in open_allow[:5])
            reason = f"{len(open_allow)} console sign-on rule(s) allow access without a network condition ({names}). {SCOPE}"
            return self.result("FAIL", f"{reason} {note}".strip(), evidence)
        if wide_used:
            reason = f"Console rules are network-restricted, but the perimeter allows a wide-open range. {SCOPE}"
            return self.result("FAIL", f"{reason} {note}".strip(), evidence)
        reason = f"Every console sign-on rule that allows access is limited to a network perimeter. {SCOPE}"
        return self.result("PASS", f"{reason} {note}".strip(), evidence)
