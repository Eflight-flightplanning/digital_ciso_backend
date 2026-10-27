from cis_checks.base import Check
from cis_checks.context import federated_note
from cis_checks.perimeters import perimeter_summary, rules_with_perimeters


class identity_domain_network_perimeters_configured(Check):
    def execute(self, api, ctx):
        perimeters, wide_open = perimeter_summary(api, ctx)
        rules = rules_with_perimeters(api, ctx, perimeters)
        referencing = [
            {"policy": r["policy"], "rule": r["rule"], "effect": r["effect"], "perimeters": r["perimeters"]}
            for r in rules
            if r["perimeters"]
        ]
        evidence = {"perimeters": perimeters, "rules_referencing_perimeter": referencing, "wide_open": wide_open}
        note = federated_note(ctx)

        if not perimeters:
            return self.result("FAIL", f"No network perimeter is defined in the identity domain. {note}".strip(), evidence)
        if not referencing:
            reason = f"{len(perimeters)} network perimeter(s) are defined but no active sign-on rule references them, so they restrict nothing."
            return self.result("FAIL", f"{reason} {note}".strip(), evidence)
        if wide_open:
            ranges = ", ".join(f"{w['perimeter']}: {w['range']}" for w in wide_open[:5])
            reason = f"Network perimeters are referenced by sign-on rules but contain wide-open ranges ({ranges})."
            return self.result("FAIL", f"{reason} {note}".strip(), evidence)
        reason = f"{len(perimeters)} network perimeter(s) are defined and referenced by {len(referencing)} active sign-on rule(s), with no wide-open ranges."
        return self.result("PASS", f"{reason} {note}".strip(), evidence)
