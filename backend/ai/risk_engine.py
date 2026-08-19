"""
Deterministic Risk Engine

Calculates a risk score (0–100) from structured security assessment data.
This is NOT AI-controlled. The Risk Engine always runs AFTER Claude analysis
but scores are computed deterministically from weighted factors.

Claude's output feeds into this engine as inputs but cannot override the formula.

Risk Score = sum(weighted factors, capped at 100)

This score is final — AI cannot overrule it.
"""
from __future__ import annotations

import os
from typing import Any

# ─────────────────────────────────────────────────────────────
# Risk Engine Configuration (from environment)
# ─────────────────────────────────────────────────────────────

# Factor weights — must sum to 100
WEIGHT_SEVERITY = int(os.getenv("RISK_WEIGHT_SEVERITY", "30"))
WEIGHT_ASSET_CRITICALITY = int(os.getenv("RISK_WEIGHT_ASSET_CRITICALITY", "20"))
WEIGHT_EXPOSURE = int(os.getenv("RISK_WEIGHT_EXPOSURE", "20"))
WEIGHT_EXPLOITABILITY = int(os.getenv("RISK_WEIGHT_EXPLOITABILITY", "10"))
WEIGHT_COMPLIANCE = int(os.getenv("RISK_WEIGHT_COMPLIANCE", "10"))
WEIGHT_CORRELATED = int(os.getenv("RISK_WEIGHT_CORRELATED", "10"))

# Thresholds
THRESHOLD_CRITICAL = int(os.getenv("RISK_THRESHOLD_CRITICAL", "90"))
THRESHOLD_HIGH = int(os.getenv("RISK_THRESHOLD_HIGH", "75"))
THRESHOLD_MEDIUM = int(os.getenv("RISK_THRESHOLD_MEDIUM", "50"))
THRESHOLD_LOW = int(os.getenv("RISK_THRESHOLD_LOW", "25"))


def get_risk_level(score: int) -> str:
    """Convert numeric score to risk level string."""
    if score >= THRESHOLD_CRITICAL:
        return "CRITICAL"
    if score >= THRESHOLD_HIGH:
        return "HIGH"
    if score >= THRESHOLD_MEDIUM:
        return "MEDIUM"
    if score >= THRESHOLD_LOW:
        return "LOW"
    return "INFORMATIONAL"


# ─────────────────────────────────────────────────────────────
# Severity scoring
# ─────────────────────────────────────────────────────────────

SEVERITY_SCORES = {
    "critical": 100,
    "high": 80,
    "medium": 50,
    "low": 20,
    "informational": 5,
}


def score_severity(severity: str) -> int:
    return SEVERITY_SCORES.get(severity.lower(), 50)


# ─────────────────────────────────────────────────────────────
# Exposure scoring
# Based on the AI Reasoning output's exposure classification
# ─────────────────────────────────────────────────────────────

EXPOSURE_SCORES = {
    "INTERNET": 100,
    "EXTERNAL": 80,
    "INTERNAL": 50,
    "PRIVATE": 20,
    "UNKNOWN": 60,  # Treat unknown as moderate risk (fail-safe)
}


def score_exposure(exposure: str) -> int:
    return EXPOSURE_SCORES.get(exposure.upper(), 60)


# ─────────────────────────────────────────────────────────────
# Asset criticality scoring
# Based on resource tags and metadata from Prowler
# ─────────────────────────────────────────────────────────────

CRITICAL_TAG_KEYWORDS = {"prod", "production", "prd", "live", "critical", "database", "db", "payment"}
HIGH_TAG_KEYWORDS = {"stage", "staging", "stg", "api", "auth", "iam", "secret", "vpn"}


def score_asset_criticality(resource_attrs: dict[str, Any]) -> int:
    """Heuristic criticality from resource name and tags."""
    tags: dict[str, str] = resource_attrs.get("tags", {}) or {}
    name: str = (resource_attrs.get("name") or "").lower()
    svc: str = (resource_attrs.get("service") or "").lower()
    resource_type: str = (resource_attrs.get("type") or "").lower()

    # Check tags + name for criticality keywords
    tag_text = " ".join(str(v) for v in tags.values()).lower()
    text = f"{name} {tag_text} {svc} {resource_type}"

    if any(kw in text for kw in CRITICAL_TAG_KEYWORDS):
        return 100
    if any(kw in text for kw in HIGH_TAG_KEYWORDS):
        return 75

    # IAM/identity-related services are inherently higher criticality
    if "iam" in svc or "identity" in svc or "access" in svc:
        return 80
    if "s3" in svc or "storage" in svc:
        return 60
    if "lambda" in svc or "function" in svc or "compute" in svc:
        return 55

    return 40  # Default


# ─────────────────────────────────────────────────────────────
# Exploitability scoring
# Based on AI confidence and attack scenario presence
# ─────────────────────────────────────────────────────────────

def score_exploitability(
    ai_confidence: float,
    has_attack_scenario: bool,
    domain: str,
) -> int:
    """Higher confidence + clear attack scenario = higher exploitability."""
    base = int(ai_confidence * 70)

    if has_attack_scenario:
        base += 20

    # Some domains are inherently more exploitable
    high_exploit_domains = {
        "IDENTITY_ACCESS", "NETWORK_SECURITY", "VULNERABILITY_MANAGEMENT"
    }
    if domain in high_exploit_domains:
        base += 10

    return min(base, 100)


# ─────────────────────────────────────────────────────────────
# Compliance score boost
# ─────────────────────────────────────────────────────────────

def score_compliance_impact(compliance_mapping: dict | list | str | None) -> int:
    """Findings with compliance mappings have regulatory impact.

    Prowler's real check_metadata.compliance is a dict of
    {framework: [requirement_ids]}, not the pipe-delimited string this
    function was originally written for — handle dict/list/str so real
    findings don't crash the risk engine.
    """
    if not compliance_mapping:
        return 0
    if isinstance(compliance_mapping, dict):
        frameworks = len(compliance_mapping)
    elif isinstance(compliance_mapping, (list, tuple, set)):
        frameworks = len(compliance_mapping)
    else:
        frameworks = compliance_mapping.count("|") + 1
    return min(frameworks * 20, 100)


# ─────────────────────────────────────────────────────────────
# Main Risk Score Calculator
# ─────────────────────────────────────────────────────────────

class RiskEngine:
    """
    Deterministic Risk Engine.

    Inputs:
    - Prowler finding (authoritative source)
    - AI reasoning output (advisory input)
    - Optional: correlation amplification

    Output:
    - risk_score: int (0–100)
    - risk_level: str (CRITICAL|HIGH|MEDIUM|LOW|INFORMATIONAL)
    - score_breakdown: dict (for audit/transparency)
    """

    def calculate(
        self,
        finding_attrs: dict[str, Any],
        resource_attrs: dict[str, Any],
        reasoning: dict[str, Any],
        correlation_amplification: int = 0,
    ) -> dict[str, Any]:
        """
        Calculate a deterministic risk score.

        Returns:
            {
                risk_score: int (0-100),
                risk_level: str,
                score_breakdown: dict,
            }
        """
        severity = finding_attrs.get("severity", "medium")
        compliance = finding_attrs.get("check_metadata", {}).get("compliance")

        s_severity = score_severity(severity)
        s_asset = score_asset_criticality(resource_attrs)
        s_exposure = score_exposure(reasoning.get("exposure", "UNKNOWN"))
        s_exploitability = score_exploitability(
            ai_confidence=float(reasoning.get("confidence", 0.5)),
            has_attack_scenario=bool(reasoning.get("attack_scenario")),
            domain=reasoning.get("domain", "OTHER"),
        )
        s_compliance = score_compliance_impact(compliance)
        s_correlated = min(correlation_amplification, 100)

        # Weighted sum
        raw_score = (
            s_severity * WEIGHT_SEVERITY / 100
            + s_asset * WEIGHT_ASSET_CRITICALITY / 100
            + s_exposure * WEIGHT_EXPOSURE / 100
            + s_exploitability * WEIGHT_EXPLOITABILITY / 100
            + s_compliance * WEIGHT_COMPLIANCE / 100
            + s_correlated * WEIGHT_CORRELATED / 100
        )

        risk_score = min(round(raw_score), 100)
        risk_level = get_risk_level(risk_score)

        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "score_breakdown": {
                "severity": s_severity,
                "asset_criticality": s_asset,
                "exposure": s_exposure,
                "exploitability": s_exploitability,
                "compliance_impact": s_compliance,
                "correlation_amplification": s_correlated,
                "weights": {
                    "severity": WEIGHT_SEVERITY,
                    "asset_criticality": WEIGHT_ASSET_CRITICALITY,
                    "exposure": WEIGHT_EXPOSURE,
                    "exploitability": WEIGHT_EXPLOITABILITY,
                    "compliance": WEIGHT_COMPLIANCE,
                    "correlated": WEIGHT_CORRELATED,
                },
            },
        }


# ─────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────

risk_engine = RiskEngine()
