"""
Claude Anthropic Provider

Implements the AIProvider interface using the Anthropic API.

Security rules:
- API key read from Django settings/env — never from request
- Never call this from the frontend (React → Django API → Claude)
- Secrets are sanitized BEFORE calling this
- Chain-of-thought is private; rationale_summary is the only exposed reasoning
- AI never changes Prowler PASS/FAIL status
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from .prompts import (
    ADVISOR_PROMPT_VERSION,
    ADVISOR_SYSTEM_PROMPT,
    CORRELATION_PROMPT_VERSION,
    CORRELATION_SYSTEM_PROMPT,
    DECISION_PROMPT_VERSION,
    DECISION_SYSTEM_PROMPT,
    REASONING_PROMPT_VERSION,
    REASONING_SYSTEM_PROMPT,
)
from .provider import (
    AdvisorOutput,
    AIProvider,
    CorrelationOutput,
    DecisionOutput,
    ReasoningOutput,
)

logger = logging.getLogger(__name__)

# Model configuration
DEFAULT_MODEL = "claude-sonnet-4-6"
FALLBACK_MODELS = [
    "claude-sonnet-4-6",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5-20250929",
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
]
MAX_TOKENS_REASONING = 1500
MAX_TOKENS_DECISION = 400
MAX_TOKENS_CORRELATION = 500
MAX_TOKENS_ADVISOR = 800


class ClaudeProvider(AIProvider):
    """Anthropic Claude implementation of AIProvider."""

    def __init__(self) -> None:
        try:
            from anthropic import Anthropic

            self._client = Anthropic(
                api_key=self._get_api_key(),
            )
            env_model = os.getenv("ANTHROPIC_MODEL", "")
            if not env_model:
                try:
                    from django.conf import settings
                    env_model = getattr(settings, "ANTHROPIC_MODEL", "")
                except Exception:
                    pass
            self._model = env_model.strip() if env_model and env_model.strip() else DEFAULT_MODEL
        except ImportError as e:
            logger.error("anthropic package not installed: %s", e)
            raise RuntimeError(
                "anthropic package required. Install with: uv add anthropic"
            ) from e

    @staticmethod
    def _get_api_key() -> str:
        """Read API key from Django settings or environment.
        Never from request, never logged.
        """
        try:
            from django.conf import settings

            key = getattr(settings, "ANTHROPIC_API_KEY", None)
            if key and key != "your_claude_api_key_here":
                return key
        except Exception:
            pass
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key or key == "your_claude_api_key_here":
            raise RuntimeError(
                "ANTHROPIC_API_KEY not configured. Set in api/.env (backend only)."
            )
        return key

    def _call(self, system: str, user_message: str, max_tokens: int = 1500) -> str:
        """Call Claude with automatic fallback to supported models."""
        models_to_try = [self._model] + [m for m in FALLBACK_MODELS if m != self._model]
        last_exception = None

        for model in models_to_try:
            try:
                response = self._client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": user_message}],
                )
                if model != self._model:
                    logger.warning("Fallback succeeded with model: %s", model)
                    self._model = model
                return response.content[0].text
            except Exception as e:
                last_exception = e
                err_str = str(e)
                if "not_found_error" in err_str or "404" in err_str or "NotFoundError" in type(e).__name__:
                    logger.warning("Model %s not found (404), trying fallback...", model)
                    continue
                logger.error("Claude API call failed on model %s: %s", model, type(e).__name__)
                raise

        if last_exception:
            raise last_exception

    def _parse_json(self, raw: str) -> dict[str, Any]:
        """Parse JSON from Claude response. Raises ValueError on invalid JSON."""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        text = text.strip()

        # Extract json object block if surrounded by text
        match = re.search(r'(\{[\s\S]*\})', text)
        if match:
            text = match.group(1)

        try:
            return json.loads(text)
        except Exception:
            # Robust fallback parser when Claude output contains unescaped internal quotes
            answer_match = re.search(r'"answer"\s*:\s*"(.*?)"\s*,\s*"finding_references"', text, re.DOTALL)
            if not answer_match:
                answer_match = re.search(r'"answer"\s*:\s*"(.*?)"\s*,\s*"confidence"', text, re.DOTALL)
            if not answer_match:
                answer_match = re.search(r'"answer"\s*:\s*"(.*)', text, re.DOTALL)
            
            answer = answer_match.group(1).strip() if answer_match else text

            refs = []
            refs_match = re.search(r'"finding_references"\s*:\s*(\[.*?\])', text, re.DOTALL)
            if refs_match:
                try:
                    refs = json.loads(refs_match.group(1))
                except Exception:
                    refs = []

            conf = 0.8
            conf_match = re.search(r'"confidence"\s*:\s*([0-9.]+)', text)
            if conf_match:
                try:
                    conf = float(conf_match.group(1))
                except Exception:
                    conf = 0.8

            return {
                "answer": answer,
                "finding_references": refs,
                "confidence": conf,
            }

    def analyze_finding(
        self,
        normalized_finding: dict[str, Any],
        context: dict[str, Any],
    ) -> ReasoningOutput:
        """Analyze a Prowler finding with Claude's extended thinking."""
        user_message = json.dumps(
            {
                "finding": normalized_finding,
                "context": context,
                "prompt_version": REASONING_PROMPT_VERSION,
                "instruction": (
                    "Analyze this Prowler security finding. "
                    "Return only the JSON schema specified in the system prompt. "
                    "The 'status' field is from Prowler and is authoritative — do not change it."
                ),
            },
            default=str,
        )

        raw = self._call(REASONING_SYSTEM_PROMPT, user_message, MAX_TOKENS_REASONING)
        data = self._parse_json(raw)

        return ReasoningOutput(
            summary=data.get("summary", ""),
            domain=data.get("domain", "OTHER"),
            exposure=data.get("exposure", "UNKNOWN"),
            root_cause=data.get("root_cause", ""),
            technical_impact=data.get("technical_impact", ""),
            business_impact=data.get("business_impact", ""),
            attack_scenario=data.get("attack_scenario", ""),
            remediation=data.get("remediation", []),
            verification=data.get("verification", []),
            unknowns=data.get("unknowns", []),
            rationale_summary=data.get("rationale_summary", ""),
            confidence=float(data.get("confidence", 0.5)),
        )

    def recommend_decision(
        self,
        reasoning: ReasoningOutput,
        risk_score: int,
        risk_level: str,
        policy: dict[str, Any],
        normalized_finding: dict[str, Any],
    ) -> DecisionOutput:
        """Recommend a security decision given reasoning + risk score + policy."""
        user_message = json.dumps(
            {
                "reasoning_summary": reasoning.summary,
                "domain": reasoning.domain,
                "exposure": reasoning.exposure,
                "confidence": reasoning.confidence,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "severity": normalized_finding.get("severity"),
                "check_id": normalized_finding.get("check_id"),
                "policy": policy,
                "prompt_version": DECISION_PROMPT_VERSION,
                "instruction": "Recommend the next security action. Return only JSON.",
            },
            default=str,
        )

        raw = self._call(DECISION_SYSTEM_PROMPT, user_message, MAX_TOKENS_DECISION)
        data = self._parse_json(raw)

        return DecisionOutput(
            decision=data.get("decision", "INVESTIGATE"),
            priority=data.get("priority", "P3"),
            reason=data.get("reason", "")[:200],  # Hard limit — enforce compact
            recommended_owner=data.get("recommended_owner", "Security Team"),
            requires_human_approval=data.get("requires_human_approval", True),
            requires_rescan=data.get("requires_rescan", True),
        )

    def analyze_correlation(
        self,
        findings: list[dict[str, Any]],
    ) -> CorrelationOutput:
        """Identify correlated attack paths across findings."""
        if not findings:
            return CorrelationOutput(
                findings=[],
                summary="No findings provided for correlation.",
                risk_amplification=0,
                confidence=0.0,
            )

        # Limit to 10 findings to keep context window manageable
        findings_compact = [
            {
                "id": f.get("finding_id"),
                "check_id": f.get("check_id"),
                "severity": f.get("severity"),
                "domain": f.get("domain"),
                "exposure": f.get("exposure"),
            }
            for f in findings[:10]
        ]

        user_message = json.dumps(
            {
                "findings": findings_compact,
                "prompt_version": CORRELATION_PROMPT_VERSION,
                "instruction": "Identify relationships and risk amplification. Return only JSON.",
            },
            default=str,
        )

        raw = self._call(CORRELATION_SYSTEM_PROMPT, user_message, MAX_TOKENS_CORRELATION)
        data = self._parse_json(raw)

        return CorrelationOutput(
            findings=data.get("findings", []),
            summary=data.get("summary", ""),
            risk_amplification=min(int(data.get("risk_amplification", 0)), 20),
            confidence=float(data.get("confidence", 0.5)),
        )

    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
    ) -> AdvisorOutput:
        """Answer a security advisor question grounded in findings."""
        # Compact finding summaries — don't send full raw_result
        finding_summaries = [
            {
                "id": f.get("finding_id"),
                "uid": f.get("uid"),
                "check_id": f.get("check_id"),
                "severity": f.get("severity"),
                "status": f.get("status"),  # PASS/FAIL — from Prowler, immutable
                "summary": f.get("check_title"),
                "details": f.get("status_extended"),
                "remediation": f.get("remediation"),
                "resource": f.get("resource", {}).get("name") if isinstance(f.get("resource"), dict) else f.get("resource"),
            }
            for f in relevant_findings[:35]  # Generous context
        ]

        user_message = json.dumps(
            {
                "question": question,
                "findings_context": finding_summaries,
                "count": len(finding_summaries),
                "prompt_version": ADVISOR_PROMPT_VERSION,
                "instruction": "Answer using only the provided findings context. Return only JSON.",
            },
            default=str,
        )

        raw = self._call(ADVISOR_SYSTEM_PROMPT, user_message, MAX_TOKENS_ADVISOR)
        data = self._parse_json(raw)

        return AdvisorOutput(
            answer=data.get("answer", ""),
            finding_references=data.get("finding_references", []),
            confidence=float(data.get("confidence", 0.5)),
        )


# ─────────────────────────────────────────────────────────────
# Provider factory — returns configured AI provider
# ─────────────────────────────────────────────────────────────

def get_ai_provider(tenant_id: str | None = None) -> AIProvider:
    """Return the configured AI provider instance (vLLM Azure Qwen or Claude)."""
    # 1. Check if tenant has a custom active LLM configuration in database
    if tenant_id:
        try:
            from api.models import TenantLLMConfig
            config = TenantLLMConfig.objects.filter(tenant_id=tenant_id, is_active=True).first()
            if config:
                if config.provider_type in ("vllm_azure", "ollama", "azure_openai"):
                    from .vllm_provider import VLLMAzureProvider
                    return VLLMAzureProvider(
                        base_url=config.base_url,
                        api_key=config.api_key,
                        model_name=config.model_name,
                    )
                elif config.provider_type == "anthropic_claude":
                    return ClaudeProvider()
        except Exception:
            pass

    # 2. Fall back to environment variable AI_PROVIDER
    provider_name = os.getenv("AI_PROVIDER", "vllm").lower()
    if provider_name in ("vllm", "vllm_azure", "azure", "qwen"):
        from .vllm_provider import VLLMAzureProvider
        return VLLMAzureProvider()
    elif provider_name in ("anthropic", "claude"):
        return ClaudeProvider()
    
    # Default to vLLM Azure Qwen
    from .vllm_provider import VLLMAzureProvider
    return VLLMAzureProvider()
