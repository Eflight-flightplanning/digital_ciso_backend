"""
AI Provider Abstraction Layer

Defines the interface that all AI providers must implement.
Swap providers (Claude → OpenAI → Azure) without rewriting application logic.
"""
from __future__ import annotations

import abc
import dataclasses
from typing import Any


@dataclasses.dataclass
class ReasoningOutput:
    """Structured output from the Reasoning AI (Claude analysis of a finding)."""

    summary: str
    domain: str  # AIDomain constant
    exposure: str  # AIExposure constant
    root_cause: str
    technical_impact: str
    business_impact: str
    attack_scenario: str
    remediation: list[str]
    verification: list[str]
    unknowns: list[str]
    rationale_summary: str
    confidence: float  # 0.0–1.0

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class DecisionOutput:
    """Structured output from the Decision AI."""

    decision: str  # AIDecision constant
    priority: str  # P1–P4
    reason: str  # ≤40 words
    recommended_owner: str
    requires_human_approval: bool
    requires_rescan: bool

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class CorrelationOutput:
    """Structured output from the Correlation AI."""

    findings: list[str]  # finding IDs
    summary: str
    risk_amplification: int  # 0–20 additive risk points
    confidence: float  # 0.0–1.0

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class AdvisorOutput:
    """Structured output from the AI Advisor."""

    answer: str
    finding_references: list[dict[str, str]]  # [{id, name, severity, resource}]
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


class AIProvider(abc.ABC):
    """Abstract AI provider interface.

    All provider implementations must not:
    - Log secrets or API keys
    - Expose chain-of-thought reasoning
    - Invent findings or compliance controls
    - Change Prowler PASS/FAIL status
    """

    @abc.abstractmethod
    def analyze_finding(
        self,
        normalized_finding: dict[str, Any],
        context: dict[str, Any],
    ) -> ReasoningOutput:
        """Analyze a Prowler finding and return structured reasoning output."""
        ...

    @abc.abstractmethod
    def recommend_decision(
        self,
        reasoning: ReasoningOutput,
        risk_score: int,
        risk_level: str,
        policy: dict[str, Any],
        normalized_finding: dict[str, Any],
    ) -> DecisionOutput:
        """Recommend a security decision given reasoning + risk + policy."""
        ...

    @abc.abstractmethod
    def analyze_correlation(
        self,
        findings: list[dict[str, Any]],
    ) -> CorrelationOutput:
        """Identify correlated attack paths across multiple findings."""
        ...

    @abc.abstractmethod
    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
    ) -> AdvisorOutput:
        """Answer a security advisor question grounded in real findings."""
        ...
