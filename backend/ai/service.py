"""
AI Analysis Service — Orchestrator

Implements the full AI pipeline for a finding:

1. Fetch Prowler finding (authoritative source)
2. Normalize evidence (compact representation)
3. Build context (resource details, compliance, historical)
4. Sanitize secrets (remove credentials, neutralize injection)
5. Check cache (skip Claude if evidence unchanged)
6. Reasoning AI (Claude analyzes evidence)
7. Deterministic Risk Engine (scores 0-100)
8. Decision AI (Claude recommends action — conditional)
9. Policy Engine (deterministic policy overrides AI)
10. Store AI Assessment + Security Decision
11. Notify UI (via audit log)

AI never changes Prowler PASS/FAIL.
Human approval required before any remediation.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from .cache import AIAnalysisCache, build_fingerprint
from .claude_provider import get_ai_provider
from .normalizer import compute_evidence_fingerprint, normalize_finding
from .policy_engine import policy_engine
from .risk_engine import risk_engine
from .sanitizer import sanitizer

logger = logging.getLogger(__name__)


class AIAnalysisService:
    """
    Orchestrator for the Digital CISO AI analysis pipeline.

    All Claude calls go through this service.
    The UI never calls Claude directly.
    """

    def __init__(self) -> None:
        self._provider = None  # Lazy — only instantiate when AI is enabled

    def _get_provider(self, tenant_id: str | None = None):
        return get_ai_provider(tenant_id=tenant_id)

    def analyze(
        self,
        finding_id: str,
        finding_data: dict[str, Any],
        force_reanalysis: bool = False,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Run the full AI pipeline for a Prowler finding.

        Returns dict with keys: assessment, decision, from_cache

        Never raises — returns error dict on failure so Prowler findings
        remain accessible even when AI is unavailable.
        """
        try:
            return self._analyze_inner(finding_id, finding_data, force_reanalysis, tenant_id)
        except Exception as e:
            logger.error(
                "AI analysis failed for finding %s: %s: %s",
                finding_id,
                type(e).__name__,
                str(e),
            )
            return {
                "error": f"AI analysis unavailable: {type(e).__name__}",
                "assessment": None,
                "decision": None,
                "from_cache": False,
            }

    def _analyze_inner(
        self,
        finding_id: str,
        finding_data: dict[str, Any],
        force_reanalysis: bool,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        # ── Step 1-2: Normalize ──
        normalized = normalize_finding(finding_data)

        # ── Step 3: Build context ──
        resource_attrs = finding_data.get("relationships", {}).get("resource", {}).get("attributes", {}) or {}
        context = {
            "resource": resource_attrs,
            "provider": finding_data.get("relationships", {}).get("provider", {}),
            "scan": finding_data.get("relationships", {}).get("scan", {}).get("attributes", {}),
        }

        # ── Step 4: Sanitize secrets ──
        sanitized_normalized = sanitizer.sanitize_dict(normalized)
        sanitized_context = sanitizer.sanitize_context(context)

        # ── Step 5: Check cache ──
        from .prompts import REASONING_PROMPT_VERSION

        fingerprint = build_fingerprint(
            check_id=normalized["check_id"],
            normalized_evidence={
                "status_extended": normalized["status_extended"],
                "raw_result": normalized["raw_result"],
            },
            resource_context={"uid": resource_attrs.get("uid", "")},
            prompt_version=REASONING_PROMPT_VERSION,
        )

        cached_assessment = self._get_cached_assessment(finding_id, fingerprint, tenant_id)
        if cached_assessment and not force_reanalysis:
            logger.info(
                "Using cached AI assessment for finding %s (fingerprint match)", finding_id
            )
            return {
                "assessment": cached_assessment,
                "decision": self._get_cached_decision(finding_id, tenant_id),
                "from_cache": True,
            }

        # ── Step 6: Reasoning AI ──
        provider = self._get_provider(tenant_id)
        logger.info("Calling Reasoning AI for finding %s", finding_id)
        reasoning = provider.analyze_finding(sanitized_normalized, sanitized_context)

        # ── Step 7: Risk Engine ──
        risk_result = risk_engine.calculate(
            finding_attrs=finding_data.get("attributes", {}),
            resource_attrs=resource_attrs,
            reasoning=reasoning.to_dict(),
            correlation_amplification=0,  # Updated later by correlation
        )

        # ── Step 8: Decision AI (only if AI_DECISION_ENABLED) ──
        import os
        if os.getenv("AI_DECISION_ENABLED", "true").lower() == "true":
            logger.info("Calling Decision AI for finding %s", finding_id)
            ai_decision = provider.recommend_decision(
                reasoning=reasoning,
                risk_score=risk_result["risk_score"],
                risk_level=risk_result["risk_level"],
                policy={},  # TODO: load org-specific policy from DB
                normalized_finding=sanitized_normalized,
            )
            ai_decision_dict = ai_decision.to_dict()
        else:
            # Decision AI disabled — use risk-based default
            ai_decision_dict = self._default_decision(risk_result)

        # ── Step 9: Policy Engine ──
        final_decision = policy_engine.apply(
            ai_decision=ai_decision_dict,
            risk_result=risk_result,
            reasoning=reasoning.to_dict(),
        )

        # ── Step 10: Store to DB ──
        assessment_record, decision_record = self._store(
            finding_id=finding_id,
            fingerprint=fingerprint,
            reasoning=reasoning,
            risk_result=risk_result,
            final_decision=final_decision,
            tenant_id=tenant_id,
        )

        return {
            "assessment": assessment_record,
            "decision": decision_record,
            "from_cache": False,
        }

    def _default_decision(self, risk_result: dict[str, Any]) -> dict[str, Any]:
        """Fallback decision when Decision AI is disabled — purely risk-based."""
        level = risk_result["risk_level"]
        level_to_decision = {
            "CRITICAL": ("REMEDIATE_NOW", "P1"),
            "HIGH": ("REMEDIATE_PLANNED", "P2"),
            "MEDIUM": ("INVESTIGATE", "P3"),
            "LOW": ("MONITOR", "P4"),
            "INFORMATIONAL": ("NO_ACTION", "P4"),
        }
        decision, priority = level_to_decision.get(level, ("INVESTIGATE", "P3"))
        return {
            "decision": decision,
            "priority": priority,
            "reason": f"Risk level {level} — requires review.",
            "recommended_owner": "Security Team",
            "requires_human_approval": True,
            "requires_rescan": True,
        }

    def _store(
        self,
        finding_id: str,
        fingerprint: str,
        reasoning,
        risk_result: dict[str, Any],
        final_decision: dict[str, Any],
        tenant_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """
        Store AI assessment and security decision to database using Django ORM.
        """
        if not tenant_id:
            raise ValueError("_store requires a tenant_id — AIAssessment/SecurityDecision are RLS-protected.")

        from api.db_utils import rls_transaction
        from api.models import AIAssessment, SecurityDecision

        with rls_transaction(tenant_id), transaction.atomic():
            # Create or update assessment
            assessment, _created = AIAssessment.objects.update_or_create(
                tenant_id=tenant_id,
                finding_id=finding_id,
                defaults={
                    "summary": reasoning.summary,
                    "domain": reasoning.domain,
                    "exposure": reasoning.exposure,
                    "root_cause": reasoning.root_cause,
                    "technical_impact": reasoning.technical_impact,
                    "business_impact": reasoning.business_impact,
                    "attack_scenario": reasoning.attack_scenario,
                    "remediation": reasoning.remediation,
                    "verification": reasoning.verification,
                    "unknowns": reasoning.unknowns,
                    "rationale_summary": reasoning.rationale_summary,
                    "confidence": reasoning.confidence,
                    "model": "claude",
                    "prompt_version": reasoning.to_dict().get("prompt_version", "1.0.0"),
                    "fingerprint": fingerprint,
                },
            )

            # Create or update decision
            decision, _created = SecurityDecision.objects.update_or_create(
                tenant_id=tenant_id,
                finding_id=finding_id,
                defaults={
                    "assessment": assessment,
                    "risk_score": risk_result["risk_score"],
                    "risk_level": risk_result["risk_level"],
                    "decision": final_decision["decision"],
                    "priority": final_decision["priority"],
                    "reason": final_decision["reason"],
                    "recommended_owner": final_decision["recommended_owner"],
                    "sla_hours": final_decision["sla_hours"],
                    "human_review_status": "PENDING",
                    "remediation_status": "PENDING",
                    "applied_policy_rules": final_decision.get("applied_policy_rules", []),
                },
            )

        logger.info(
            "AI analysis stored for finding %s: score=%s level=%s decision=%s",
            finding_id,
            risk_result["risk_score"],
            risk_result["risk_level"],
            final_decision["decision"],
        )

        return self._assessment_to_dict(assessment), self._decision_to_dict(decision)

    def _get_cached_assessment(
        self, finding_id: str, fingerprint: str, tenant_id: str | None = None
    ) -> dict[str, Any] | None:
        """Retrieve cached assessment from DB if fingerprint matches."""
        if not tenant_id:
            return None
        try:
            from api.db_utils import rls_transaction
            from api.models import AIAssessment
            with rls_transaction(tenant_id):
                assessment = AIAssessment.objects.filter(
                    tenant_id=tenant_id, finding_id=finding_id, fingerprint=fingerprint
                ).first()
            if assessment:
                return self._assessment_to_dict(assessment)
        except Exception as e:
            logger.warning("Cache lookup failed: %s", e)
        return None

    def _get_cached_decision(
        self, finding_id: str, tenant_id: str | None = None
    ) -> dict[str, Any] | None:
        """Retrieve cached decision from DB."""
        if not tenant_id:
            return None
        try:
            from api.db_utils import rls_transaction
            from api.models import SecurityDecision
            with rls_transaction(tenant_id):
                decision = SecurityDecision.objects.filter(
                    tenant_id=tenant_id, finding_id=finding_id
                ).first()
            if decision:
                return self._decision_to_dict(decision)
        except Exception as e:
            logger.warning("Decision cache lookup failed: %s", e)
        return None

    @staticmethod
    def _assessment_to_dict(assessment: Any) -> dict[str, Any]:
        return {
            "id": str(assessment.id),
            "finding_id": str(assessment.finding_id),
            "summary": assessment.summary,
            "domain": assessment.domain,
            "exposure": assessment.exposure,
            "root_cause": assessment.root_cause,
            "technical_impact": assessment.technical_impact,
            "business_impact": assessment.business_impact,
            "attack_scenario": assessment.attack_scenario,
            "remediation": assessment.remediation,
            "verification": assessment.verification,
            "unknowns": assessment.unknowns,
            "rationale_summary": assessment.rationale_summary,
            "confidence": assessment.confidence,
            "model": assessment.model,
            "prompt_version": assessment.prompt_version,
            "fingerprint": assessment.fingerprint,
            "created_at": assessment.inserted_at.isoformat() if assessment.inserted_at else "",
        }

    @staticmethod
    def _decision_to_dict(decision: Any) -> dict[str, Any]:
        return {
            "id": str(decision.id),
            "finding_id": str(decision.finding_id),
            "assessment_id": str(decision.assessment_id) if decision.assessment_id else None,
            "risk_score": decision.risk_score,
            "risk_level": decision.risk_level,
            "decision": decision.decision,
            "priority": decision.priority,
            "reason": decision.reason,
            "recommended_owner": decision.recommended_owner,
            "sla_hours": decision.sla_hours,
            "human_review_status": decision.human_review_status,
            "reviewed_by": decision.reviewed_by,
            "reviewed_at": decision.reviewed_at.isoformat() if decision.reviewed_at else None,
            "remediation_status": decision.remediation_status,
            "applied_policy_rules": decision.applied_policy_rules,
            "jira_ticket_key": decision.jira_ticket_key,
            "jira_ticket_url": decision.jira_ticket_url,
            "created_at": decision.inserted_at.isoformat() if decision.inserted_at else "",
        }



# ─────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────

ai_analysis_service = AIAnalysisService()
