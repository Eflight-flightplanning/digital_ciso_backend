"""
OpenAI Provider for Digital CISO Platform
Supports official OpenAI models (GPT-4o, GPT-4o-mini) and OpenAI-compatible endpoints (Groq, Ollama, OpenRouter).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from .prompts import (
    ADVISOR_SYSTEM_PROMPT,
    CORRELATION_SYSTEM_PROMPT,
    DECISION_SYSTEM_PROMPT,
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

DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_FALLBACK_MODELS = ["gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]


class OpenAIProvider(AIProvider):
    """OpenAI API implementation of AIProvider."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model_name: str | None = None,
    ) -> None:
        try:
            from openai import OpenAI

            key = api_key or self._get_api_key()
            kwargs: dict[str, Any] = {"api_key": key}
            if base_url:
                kwargs["base_url"] = base_url

            self._client = OpenAI(**kwargs)
            self._model = model_name or os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        except ImportError as e:
            logger.error("openai package required: %s", e)
            raise RuntimeError("openai package required. Install with: pip install openai") from e

    @staticmethod
    def _get_api_key() -> str:
        """Read API key from Django settings or environment."""
        try:
            from django.conf import settings
            key = getattr(settings, "OPENAI_API_KEY", None)
            if key and key != "your_openai_api_key_here":
                return key
        except Exception:
            pass
        key = os.getenv("OPENAI_API_KEY")
        if not key or key == "your_openai_api_key_here":
            raise RuntimeError("OPENAI_API_KEY not configured. Set in .env or AI Settings.")
        return key

    def _call(
        self,
        system: str,
        user_message: str,
        max_tokens: int = 1500,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        """Call OpenAI with automatic model fallback and multi-turn history."""
        models_to_try = [self._model] + [m for m in DEFAULT_FALLBACK_MODELS if m != self._model]
        last_exception = None

        messages = [{"role": "system", "content": system}]
        if history:
            for item in history[-6:]:
                role = item.get("role") or item.get("sender")
                content = item.get("content") or ""
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})

        for model in models_to_try:
            try:
                response = self._client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
                return response.choices[0].message.content or "{}"
            except Exception as e:
                last_exception = e
                logger.warning("OpenAI model %s failed: %s, trying fallback...", model, e)
                continue

        if last_exception:
            raise last_exception
        return "{}"

    def _parse_json(self, raw: str) -> dict[str, Any]:
        """Parse JSON response safely."""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        text = text.strip()

        match = re.search(r"(\{[\s\S]*\})", text)
        if match:
            text = match.group(1)

        try:
            return json.loads(text)
        except Exception:
            return {"raw_text": text}

    def analyze_finding(
        self,
        normalized_finding: dict[str, Any],
        context: dict[str, Any],
    ) -> ReasoningOutput:
        user_message = (
            f"Normalized Finding:\n{json.dumps(normalized_finding, indent=2)}\n\n"
            f"Context:\n{json.dumps(context, indent=2)}"
        )
        raw = self._call(REASONING_SYSTEM_PROMPT, user_message, 1500)
        data = self._parse_json(raw)
        return ReasoningOutput(
            summary=data.get("summary", ""),
            domain=data.get("domain", "General Security"),
            exposure=data.get("exposure", "Internal"),
            root_cause=data.get("root_cause", ""),
            technical_impact=data.get("technical_impact", ""),
            business_impact=data.get("business_impact", ""),
            attack_scenario=data.get("attack_scenario", ""),
            confidence=float(data.get("confidence", 0.9)),
            raw_response=data,
        )

    def decide_action(
        self,
        finding_id: str,
        reasoning_output: ReasoningOutput,
        policy_rules: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> DecisionOutput:
        user_message = (
            f"Finding ID: {finding_id}\n\n"
            f"Reasoning Summary:\n{reasoning_output.to_dict()}\n\n"
            f"Policy Rules:\n{json.dumps(policy_rules, indent=2)}\n\n"
            f"Context:\n{json.dumps(context, indent=2)}"
        )
        raw = self._call(DECISION_SYSTEM_PROMPT, user_message, 400)
        data = self._parse_json(raw)
        return DecisionOutput(
            action=data.get("action", "AUTO_REMEDIATE_LOW_RISK"),
            rationale=data.get("rationale", ""),
            risk_reduction=int(data.get("risk_reduction", 50)),
            confidence=float(data.get("confidence", 0.9)),
            rollback_plan=data.get("rollback_plan", ""),
        )

    def correlate_findings(
        self,
        findings: list[dict[str, Any]],
        network_topology: dict[str, Any],
    ) -> CorrelationOutput:
        user_message = (
            f"Findings to correlate:\n{json.dumps(findings, indent=2)}\n\n"
            f"Network Topology:\n{json.dumps(network_topology, indent=2)}"
        )
        raw = self._call(CORRELATION_SYSTEM_PROMPT, user_message, 500)
        data = self._parse_json(raw)
        return CorrelationOutput(
            findings=data.get("findings", [f.get("id", "") for f in findings]),
            summary=data.get("summary", ""),
            risk_amplification=int(data.get("risk_amplification", 0)),
            confidence=float(data.get("confidence", 0.85)),
        )

    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
        history: list[dict[str, str]] | None = None,
    ) -> AdvisorOutput:
        context_str = json.dumps(relevant_findings[:35], indent=2) if relevant_findings else "[]"
        user_message = f"Active Findings Telemetry:\n{context_str}\n\nUser Question:\n{question}"
        raw = self._call(ADVISOR_SYSTEM_PROMPT, user_message, 1500, history=history)
        data = self._parse_json(raw)
        return AdvisorOutput(
            answer=data.get("answer", data.get("raw_text", "Analysis completed.")),
            finding_references=data.get("finding_references", []),
            confidence=float(data.get("confidence", 0.95)),
        )
