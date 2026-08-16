"""
Policy Engine — Deterministic policy rules that override AI decisions.

The Policy Engine runs AFTER the Decision AI. If a policy rule matches,
it overrides the AI recommendation. AI never overrides policy.

This is the final safety layer before any recommended action is surfaced to users.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ─────────────────────────────────────────────────────────────
# Policy Rule definition
# ─────────────────────────────────────────────────────────────

@dataclass
class PolicyRule:
    name: str
    condition: str  # Human-readable condition for audit logging
    decision_override: str | None = None
    priority_override: str | None = None
    sla_hours_override: int | None = None
    force_human_review: bool = True


# ─────────────────────────────────────────────────────────────
# Default Policy Rules
# Override with organization-specific rules via configuration
# ─────────────────────────────────────────────────────────────

DEFAULT_POLICY_RULES: list[PolicyRule] = [
    # Critical severity + internet exposed → REMEDIATE_NOW, P1, 4h SLA
    PolicyRule(
        name="critical_internet_exposure",
        condition="severity=CRITICAL AND exposure=INTERNET",
        decision_override="REMEDIATE_NOW",
        priority_override="P1",
        sla_hours_override=4,
        force_human_review=True,
    ),
    # CRITICAL risk score → always P1
    PolicyRule(
        name="critical_risk_score",
        condition="risk_score>=90",
        decision_override=None,  # Don't override decision, just priority
        priority_override="P1",
        sla_hours_override=4,
        force_human_review=True,
    ),
    # HIGH risk score → P2 with 24h SLA
    PolicyRule(
        name="high_risk_score",
        condition="risk_score>=75",
        decision_override=None,
        priority_override="P2",
        sla_hours_override=24,
        force_human_review=True,
    ),
    # IAM/Identity findings → always ESCALATE at minimum
    PolicyRule(
        name="iam_finding",
        condition="domain=IDENTITY_ACCESS AND risk_score>=75",
        decision_override="ESCALATE",
        priority_override="P2",
        sla_hours_override=24,
        force_human_review=True,
    ),
    # Correlated attack path findings → bump up priority
    PolicyRule(
        name="correlated_attack_path",
        condition="correlation_amplification>=15",
        decision_override=None,
        priority_override="P2",
        sla_hours_override=24,
        force_human_review=True,
    ),
]

# ─────────────────────────────────────────────────────────────
# Default SLA by priority (when no rule sets a specific SLA)
# ─────────────────────────────────────────────────────────────

DEFAULT_SLA_BY_PRIORITY = {
    "P1": 4,
    "P2": 24,
    "P3": 72,
    "P4": 168,  # 1 week
}


class PolicyEngine:
    """
    Deterministic Policy Engine.

    Takes the Decision AI recommendation and applies organization policy.
    Policy rules can override decision, priority, and SLA.
    AI never overrides policy.
    """

    def __init__(self, rules: list[PolicyRule] | None = None) -> None:
        self.rules = rules or DEFAULT_POLICY_RULES

    def apply(
        self,
        ai_decision: dict[str, Any],
        risk_result: dict[str, Any],
        reasoning: dict[str, Any],
        correlation_amplification: int = 0,
    ) -> dict[str, Any]:
        """
        Apply policy rules to the AI decision.

        Returns:
            Final decision dict with applied overrides and audit trail.
        """
        risk_score = risk_result["risk_score"]
        risk_level = risk_result["risk_level"]
        exposure = reasoning.get("exposure", "UNKNOWN")
        domain = reasoning.get("domain", "OTHER")

        decision = ai_decision.get("decision", "INVESTIGATE")
        priority = ai_decision.get("priority", "P3")
        reason = ai_decision.get("reason", "")
        recommended_owner = ai_decision.get("recommended_owner", "Security Team")
        requires_human_approval = ai_decision.get("requires_human_approval", True)
        requires_rescan = ai_decision.get("requires_rescan", True)

        applied_rules: list[str] = []

        for rule in self.rules:
            override = self._evaluate_rule(
                rule=rule,
                risk_score=risk_score,
                risk_level=risk_level,
                exposure=exposure,
                domain=domain,
                correlation_amplification=correlation_amplification,
            )
            if not override:
                continue

            applied_rules.append(rule.name)

            if rule.decision_override:
                decision = rule.decision_override
            if rule.priority_override:
                priority = rule.priority_override
            if rule.sla_hours_override is not None:
                sla_hours = rule.sla_hours_override
            if rule.force_human_review:
                requires_human_approval = True

        # Set SLA if not already set by a rule
        sla_hours = ai_decision.get("sla_hours") or DEFAULT_SLA_BY_PRIORITY.get(priority, 72)

        return {
            "decision": decision,
            "priority": priority,
            "reason": reason,
            "recommended_owner": recommended_owner,
            "sla_hours": sla_hours,
            "requires_human_approval": requires_human_approval,
            "requires_rescan": requires_rescan,
            "applied_policy_rules": applied_rules,
        }

    def _evaluate_rule(
        self,
        rule: PolicyRule,
        risk_score: int,
        risk_level: str,
        exposure: str,
        domain: str,
        correlation_amplification: int,
    ) -> bool:
        """Evaluate whether a policy rule fires."""
        condition = rule.condition

        if "severity=CRITICAL" in condition and risk_level != "CRITICAL":
            return False
        if "exposure=INTERNET" in condition and exposure != "INTERNET":
            return False
        if "domain=IDENTITY_ACCESS" in condition and domain != "IDENTITY_ACCESS":
            return False

        if "risk_score>=" in condition:
            threshold = int(condition.split("risk_score>=")[1].split()[0])
            if risk_score < threshold:
                return False

        if "correlation_amplification>=" in condition:
            threshold = int(condition.split("correlation_amplification>=")[1].split()[0])
            if correlation_amplification < threshold:
                return False

        return True


# ─────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────

policy_engine = PolicyEngine()
