"""
vLLM Azure Provider

Implements the AIProvider interface for Qwen 2.5 / 3.5 models hosted on an Azure VM via vLLM.
Communicates using the standard OpenAI-compatible API protocol (/v1/chat/completions).

Security & Reliability:
- Reads endpoint and API key from settings/env
- Uses httpx with configurable timeouts
- Parses and validates JSON responses cleanly
- Never leaks internal secrets or logs keys
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from .prompts import (
    ADVISOR_SYSTEM_PROMPT,
    CORRELATION_SYSTEM_PROMPT,
    DECISION_SYSTEM_PROMPT,
    REASONING_SYSTEM_PROMPT,
)
from .sanitizer import sanitizer
from .provider import (
    AdvisorOutput,
    AIProvider,
    CorrelationOutput,
    DecisionOutput,
    ReasoningOutput,
)
from .remediation_library import get_remediation, render_remediation_block

logger = logging.getLogger(__name__)

DEFAULT_VLLM_ENDPOINT = "http://20.235.254.33:8000/v1"
DEFAULT_MODEL = "/home/azureuser/models/qwen3.5-9b"
DEFAULT_TIMEOUT = 120.0


class VLLMAzureProvider(AIProvider):
    """vLLM Provider running Qwen on Azure VM."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model_name: str | None = None,
    ) -> None:
        django_endpoint = None
        django_model = None
        try:
            from django.conf import settings
            django_endpoint = getattr(settings, "VLLM_AZURE_ENDPOINT", None)
            django_model = getattr(settings, "VLLM_AZURE_MODEL", None)
        except Exception:
            pass

        raw_url = base_url.strip() if (base_url and isinstance(base_url, str) and base_url.strip()) else None
        self.base_url = (
            raw_url
            or os.getenv("VLLM_AZURE_ENDPOINT")
            or os.getenv("VLLM_ENDPOINT")
            or os.getenv("VLLM_BASE_URL")
            or os.getenv("VLLM_AZURE_ENDPOINT_URL")
            or django_endpoint
            or DEFAULT_VLLM_ENDPOINT
        ).rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"

        self.api_key = api_key or os.getenv("VLLM_AZURE_API_KEY") or os.getenv("VLLM_API_KEY", "EMPTY")
        self.model = (
            model_name
            or os.getenv("VLLM_MODEL_NAME")
            or os.getenv("VLLM_AZURE_MODEL")
            or os.getenv("VLLM_MODEL")
            or django_model
            or DEFAULT_MODEL
        )
        self.timeout = float(os.getenv("VLLM_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT)))

    def _call_vllm_chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Send chat completion request to vLLM OpenAI-compatible endpoint with multi-turn history."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for item in history[-6:]:
                role = item.get("role") or item.get("sender")
                content = item.get("content") or ""
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            timeout_config = httpx.Timeout(connect=5.0, read=self.timeout or 60.0, write=10.0, pool=5.0)
            with httpx.Client(timeout=timeout_config) as client:
                response = client.post(url, json=payload, headers=headers)
                if response.is_error:
                    logger.error("vLLM error response (%s): %s", response.status_code, response.text)
                response.raise_for_status()
                resp_json = response.json()
                raw_content = resp_json["choices"][0]["message"]["content"]
                return self._extract_json(raw_content)
        except Exception as e:
            logger.error("vLLM request failed to %s with model %s: %s", url, self.model, e)
            return {
                "summary": f"Analysis failed: {str(e)}",
                "error": str(e),
                "_ai_unavailable": True,
            }

    @staticmethod
    def _clean_thinking_trace(raw_text: str) -> str:
        """Strip out internal reasoning scratchpads, thinking traces, and meta-analysis headers."""
        text = raw_text.strip()
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()

        if "Thinking Process:" in text:
            text = text.split("Thinking Process:")[-1].strip()

        # Strip lines matching scratchpad headers like "* User Input:", "* Task:", "1. Analyze the Request:"
        lines = []
        for line in text.split("\n"):
            stripped = line.strip()
            if re.match(r"^(?:\*|-|\d+\.)\s*(?:\*\*)?(?:User Input|Role|Task|Constraints|Greeting|Status|Telemetry|Offer|Formatting|Analyze|Identify|Determine|Draft|Construct|Mental|Thinking|Final|Refine|JSON|Context|System Instruction|Critical Constraint)\b", stripped, re.IGNORECASE):
                continue
            if stripped.startswith("Thinking Process:"):
                continue
            lines.append(line)

        result = "\n".join(lines).strip()
        return result or text

    @classmethod
    def _extract_json(cls, text: str) -> dict[str, Any]:
        """Extract and parse JSON safely from model response, stripping thinking traces if present."""
        raw_text = text.strip()

        # 1. Strip Qwen/DeepSeek thinking tags </think> if present
        if "</think>" in raw_text:
            raw_text = raw_text.split("</think>")[-1].strip()

        # 2. If markdown code block contains json, extract it
        if "```json" in raw_text:
            json_block = raw_text.split("```json")[1].split("```")[0].strip()
            try:
                parsed = json.loads(json_block, strict=False)
                if isinstance(parsed, dict):
                    ans = parsed.get("answer") or parsed.get("recommendation") or parsed.get("response") or parsed.get("summary") or parsed.get("content")
                    if ans:
                        return {"answer": str(ans), "finding_references": parsed.get("finding_references", []), "confidence": float(parsed.get("confidence", 0.95))}
                    return parsed
            except Exception:
                pass
        elif "```" in raw_text:
            code_block = raw_text.split("```")[1].split("```")[0].strip()
            try:
                parsed = json.loads(code_block, strict=False)
                if isinstance(parsed, dict):
                    ans = parsed.get("answer") or parsed.get("recommendation") or parsed.get("response") or parsed.get("summary") or parsed.get("content")
                    if ans:
                        return {"answer": str(ans), "finding_references": parsed.get("finding_references", []), "confidence": float(parsed.get("confidence", 0.95))}
                    return parsed
            except Exception:
                pass

        # 3. Direct JSON regex search with relaxed strict=False parsing
        json_match = re.search(r"(\{[\s\S]*\})", raw_text)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1), strict=False)
                if isinstance(parsed, dict):
                    ans = parsed.get("answer") or parsed.get("recommendation") or parsed.get("response") or parsed.get("summary") or parsed.get("content")
                    if ans:
                        return {"answer": str(ans), "finding_references": parsed.get("finding_references", []), "confidence": float(parsed.get("confidence", 0.95))}
                    return parsed
            except Exception:
                pass

        # 4. Extract "answer" field directly via regex if JSON string had unescaped formatting
        ans_regex = re.search(r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)"', raw_text, re.DOTALL)
        if ans_regex:
            try:
                raw_val = ans_regex.group(1)
                unescaped = raw_val.encode("utf-8").decode("unicode_escape", errors="ignore")
                return {"answer": unescaped, "finding_references": [], "confidence": 0.95}
            except Exception:
                pass

        # 5. Header-based preamble stripping & scratchpad cleaning
        cleaned_text = cls._clean_thinking_trace(raw_text)
        if any(h in raw_text for h in ["### Spectra", "## Current State", "## Actionable", "## Risk Profile"]):
            for marker in ["### Spectra", "## Current State", "## Actionable", "## Risk Profile"]:
                if marker in cleaned_text:
                    cleaned_text = marker + cleaned_text.split(marker, 1)[1]
                    break

        return {"answer": cleaned_text, "raw_text": cleaned_text}

    def analyze_finding(
        self,
        normalized_finding: dict[str, Any],
        context: dict[str, Any],
    ) -> ReasoningOutput:
        """Analyze a Prowler finding using Qwen hosted on Azure VM."""
        user_prompt = f"Normalized Finding Data:\n{json.dumps(normalized_finding, indent=2)}\n\nContext:\n{json.dumps(context, indent=2)}"
        data = self._call_vllm_chat(
            system_prompt=REASONING_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=1500,
        )
        if data.get("_ai_unavailable"):
            # Don't fabricate a full "successful" reasoning record when the
            # model call itself failed — let this propagate so the caller
            # (AIAnalysisService.analyze) reports a real error instead of
            # silently persisting a fake analysis as if it completed.
            raise RuntimeError(f"vLLM reasoning call failed: {data.get('error')}")

        return ReasoningOutput(
            summary=data.get("summary", normalized_finding.get("finding_name", "")),
            domain=data.get("domain", "General Security"),
            exposure=data.get("exposure", "Internal"),
            root_cause=data.get("root_cause", "Configuration issue"),
            technical_impact=data.get("technical_impact", "Potential security exposure"),
            business_impact=data.get("business_impact", "Regulatory or compliance risk"),
            attack_scenario=data.get("attack_scenario", "Unauthorized resource access"),
            remediation=data.get("remediation", ["Review resource configuration"]),
            verification=data.get("verification", ["Run Prowler rescan"]),
            unknowns=data.get("unknowns", []),
            rationale_summary=data.get("rationale_summary", "Analysis completed by Qwen on Azure VM"),
            confidence=float(data.get("confidence", 0.90)),
        )

    def recommend_decision(
        self,
        reasoning: ReasoningOutput,
        risk_score: int,
        risk_level: str,
        policy: dict[str, Any],
        normalized_finding: dict[str, Any],
    ) -> DecisionOutput:
        """Recommend triage decision."""
        user_prompt = (
            f"Reasoning:\n{json.dumps(reasoning.to_dict(), indent=2)}\n\n"
            f"Risk Score: {risk_score} ({risk_level})\n"
            f"Policy Rules:\n{json.dumps(policy, indent=2)}\n"
        )
        data = self._call_vllm_chat(
            system_prompt=DECISION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=400,
        )
        if data.get("_ai_unavailable"):
            raise RuntimeError(f"vLLM decision call failed: {data.get('error')}")

        return DecisionOutput(
            decision=data.get("decision", "ACCEPT_RISK" if risk_score < 30 else "FIX_NOW"),
            priority=data.get("priority", "P1" if risk_score >= 80 else "P2"),
            reason=data.get("reason", "Decision recommended based on calculated risk score and policy."),
            recommended_owner=data.get("recommended_owner", "Cloud Security Team"),
            requires_human_approval=data.get("requires_human_approval", risk_score >= 70),
            requires_rescan=data.get("requires_rescan", True),
        )

    def analyze_correlation(
        self,
        findings: list[dict[str, Any]],
    ) -> CorrelationOutput:
        """Identify correlated attack paths across findings."""
        user_prompt = f"Findings to correlate:\n{json.dumps(findings, indent=2)}"
        data = self._call_vllm_chat(
            system_prompt=CORRELATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=600,
        )

        return CorrelationOutput(
            findings=data.get("findings", [f.get("id", "") for f in findings]),
            summary=data.get("summary", "Correlation analysis completed."),
            risk_amplification=int(data.get("risk_amplification", 0)),
            confidence=float(data.get("confidence", 0.85)),
        )

    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
        history: list[dict[str, str]] | None = None,
        connected_providers: list[dict[str, Any]] | None = None,
    ) -> AdvisorOutput:
        """Answer CISO security queries using dynamic live LLM generation augmented with verified remediation templates."""
        # 0. Cloud resource data (tags, descriptions, IAM policy text) is untrusted and may
        # contain planted secrets or prompt-injection attempts — sanitize before it reaches
        # the prompt, matching the same guardrail already applied on the reasoning/decision
        # path in ai/service.py.
        relevant_findings = sanitizer.sanitize_list(relevant_findings) if relevant_findings else relevant_findings
        connected_providers = sanitizer.sanitize_list(connected_providers) if connected_providers else connected_providers

        # 1. Check for verified remediation templates matching active findings
        verified_playbooks: list[str] = []
        if relevant_findings:
            for f in relevant_findings[:5]:
                cid = f.get("check_id", "").lower().strip()
                template = get_remediation(cid)
                if template:
                    f_res = (
                        f.get("resource", {}).get("name")
                        if isinstance(f.get("resource"), dict)
                        else (f.get("resource") or "target-resource")
                    )
                    f_region = f.get("region") or "eastus"
                    f_sub = f.get("subscription_id") or "sub-id"
                    f_rg = f.get("resource_group") or "rg-production"
                    f_acc = f.get("account_id") or "123456789012"
                    f_comp = f.get("compartment_id") or "ocid1.compartment.oc1..example"
                    f_ten = f.get("tenancy_id") or "ocid1.tenancy.oc1..example"
                    f_resid = f.get("resource_id") or f_res

                    rendered = render_remediation_block(
                        template,
                        resource=f_res,
                        region=f_region,
                        subscription_id=f_sub,
                        rg=f_rg,
                        account_id=f_acc,
                        compartment_id=f_comp,
                        tenancy_id=f_ten,
                        resource_id=f_resid,
                    )
                    verified_playbooks.append(rendered)

        verified_section = ""
        if verified_playbooks:
            verified_section = (
                "\n\nVERIFIED_REMEDIATION_TEMPLATES (USE THESE EXACT COMMANDS, TERRAFORM, AND CONSOLE STEPS):\n"
                + "\n\n---\n\n".join(verified_playbooks)
            )

        # 2. Always invoke the live LLM (Qwen / vLLM on Azure or OpenAI/Claude)
        context_str = json.dumps(relevant_findings[:25], indent=2) if relevant_findings else "[]"
        prov_str = json.dumps(connected_providers, indent=2) if connected_providers else "[]"
        user_prompt = (
            f"Connected Environments:\n{prov_str}\n\n"
            f"Active Findings Telemetry:\n{context_str}"
            f"{verified_section}\n\n"
            f"User Question:\n{question}"
        )
        data = self._call_vllm_chat(
            system_prompt=ADVISOR_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=1500,
            history=history,
        )
        if data.get("_ai_unavailable"):
            # Don't fabricate a templated "answer" (built from whichever finding happened
            # to be first in the list, regardless of what was actually asked) when the live
            # LLM call failed — that produced the exact same wrong-looking-real answer on
            # every query. Let this propagate so the view returns an honest 503 instead.
            raise RuntimeError(f"vLLM advisor call failed: {data.get('error')}")

        ans = data.get("answer", data.get("raw_text", "")).strip()
        if not ans or len(ans) <= 5:
            raise RuntimeError("vLLM advisor call returned an empty response")

        # Strip out thinking process traces if Qwen emitted scratchpad thoughts
        if "Thinking Process:" in ans:
            ans = re.sub(r"(?s)Thinking Process:.*?(?=\n\n[A-Z]|\n\n#|\n\n\*\*|\Z)", "", ans).strip()
            if not ans or len(ans) < 10:
                ans = data.get("raw_text", "").strip()

        refs = data.get("finding_references", [])
        if not refs and relevant_findings:
            refs = [
                {
                    "id": f.get("finding_id", ""),
                    "name": f.get("check_title", f.get("check_id", "")),
                    "severity": f.get("severity", "high"),
                }
                for f in relevant_findings[:4]
            ]
        return AdvisorOutput(
            answer=ans,
            finding_references=refs,
            confidence=float(data.get("confidence", 0.95)),
        )
