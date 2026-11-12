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

DEFAULT_VLLM_ENDPOINT = "http://10.0.0.4:8000/v1"
DEFAULT_MODEL = "/home/azureuser/models/qwen3.5-9b"
DEFAULT_TIMEOUT = 180.0


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

    def _resolve_model_name(self) -> str:
        """Dynamically resolve the exact model ID registered in vLLM to prevent 404 model not found errors."""
        if hasattr(self, "_active_model_id") and self._active_model_id:
            return self._active_model_id
        try:
            url = f"{self.base_url}/models"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            with httpx.Client(timeout=httpx.Timeout(connect=2.5, read=5.0)) as client:
                res = client.get(url, headers=headers)
                if res.is_success:
                    data = res.json().get("data", [])
                    if data and isinstance(data, list) and len(data) > 0 and "id" in data[0]:
                        self._active_model_id = str(data[0]["id"])
                        logger.info("vLLM active model dynamically auto-resolved: %s", self._active_model_id)
                        return self._active_model_id
        except Exception as e:
            logger.debug("Could not auto-discover vLLM model: %s", e)
        return self.model or DEFAULT_MODEL

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

        # Calculate dynamic token ceiling to ensure input_tokens + max_tokens <= 7800 (vLLM max_model_len is 8192)
        total_prompt_chars = sum(len(m.get("content", "")) for m in messages)
        est_input_tokens = int(total_prompt_chars / 3.0) + 50
        if est_input_tokens > 6500:
            # Prevent context window overflow
            user_msg = messages[-1]["content"]
            messages[-1]["content"] = user_msg[:18000] + "\n\n[Context truncated for model capacity]"
            safe_max_tokens = 1200
        else:
            safe_max_tokens = max(500, min(max_tokens, 7800 - est_input_tokens))

        active_model = self._resolve_model_name()
        payload = {
            "model": active_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": safe_max_tokens,
        }

        try:
            timeout_config = httpx.Timeout(connect=5.0, read=min(self.timeout or 120.0, 120.0), write=15.0, pool=10.0)
            with httpx.Client(timeout=timeout_config) as client:
                response = client.post(url, json=payload, headers=headers)
                if response.is_error:
                    logger.error("vLLM error response (%s): %s", response.status_code, response.text)
                response.raise_for_status()
                resp_json = response.json()
                raw_content = resp_json["choices"][0]["message"]["content"]
                return self._extract_json(raw_content)
        except Exception as e:
            logger.error("vLLM request failed to %s with model %s: %s", url, active_model, e)
            return {
                "summary": f"Analysis failed: {str(e)}",
                "error": str(e),
                "_ai_unavailable": True,
            }

    @staticmethod
    def _extract_labeled_sections(text: str) -> str | None:
        """
        Extract Direct Answer / Risk / Compliance content by the section labels our own
        prompt asks for, regardless of how the model wraps them in visible planning or
        bullet meta-commentary (e.g. "1. Drafting Content: * Direct Answer: ..."). This is
        more robust than matching specific leaked-scratchpad phrasings one at a time, since
        the model reliably echoes back the exact terms we asked for even when it also
        narrates its own planning process around them. Returns None if the expected labels
        aren't found, so the caller can fall back to other cleanup strategies.
        """
        label_re = re.compile(
            r"^[ \t]*(?:\d+[\.\)][ \t]*)?[\*\-][ \t]*\*{0,2}"
            r"(direct answer|security risk(?:\s+analysis)?|risk analysis|risk|"
            r"compliance(?:\s+mapping)?)"
            r"\*{0,2}[ \t]*:[ \t]*",
            re.IGNORECASE | re.MULTILINE,
        )
        matches = list(label_re.finditer(text))
        if len(matches) < 2:
            return None

        def canon(label: str) -> str:
            low = label.lower()
            if "direct" in low:
                return "direct"
            if "compliance" in low:
                return "compliance"
            return "risk"

        # Meta-commentary the model sometimes appends right after the real content,
        # with no label of its own (self-review checklists, word counts).
        trailing_meta = re.compile(
            r"\n[ \t]*(?:\d+[\.\)][ \t]*|\*[ \t]*)?"
            r"(?:word count|paragraph count|review against|verify constraints|formatting|tone)",
            re.IGNORECASE,
        )

        sections: dict[str, str] = {}
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            content = text[start:end].strip()
            meta_match = trailing_meta.search(content)
            if meta_match:
                content = content[: meta_match.start()].strip()
            if content:
                # The model sometimes echoes these labels multiple times (a real drafted
                # paragraph, then a short "Included." self-review pass). The substantive
                # content is reliably the longest occurrence, not the last one.
                key = canon(m.group(1))
                if key not in sections or len(content) > len(sections[key]):
                    sections[key] = content

        if "direct" not in sections or ("risk" not in sections and "compliance" not in sections):
            return None

        parts = [sections["direct"]]
        if "risk" in sections:
            parts.append(f"**Security Risk:** {sections['risk']}")
        if "compliance" in sections:
            parts.append(f"**Compliance:** {sections['compliance']}")
        return "\n\n".join(parts)

    @classmethod
    def _clean_thinking_trace(cls, raw_text: str) -> str:
        """Strip internal reasoning scratchpads and thinking traces from Qwen / other LLM responses.

        Handles multiple leakage patterns:
        1. Structured Direct Answer / Risk / Compliance labels, extracted directly regardless
           of surrounding planning commentary (see `_extract_labeled_sections`).
        2. Qwen <think>...</think> XML tags
        3. "Thinking Process:" section headers
        4. Inline scratchpad pattern: outputs reasoning, constraints, or rule analysis.
        5. Trailing meta-telemetry blocks and confidence ratings.
        """
        text = raw_text.strip()

        extracted = cls._extract_labeled_sections(text)
        if extracted:
            return extracted

        # 1. Strip Qwen / DeepSeek XML thinking tags — take only what's after </think>
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()

        # 2. Strip "Thinking Process:" or "Here's a thinking process" section block
        for tp_prefix in ["Thinking Process:", "Thinking process:", "Here's a thinking process", "Here is a thinking process", "Thought process:", "Thought Process:"]:
            if tp_prefix in text:
                text = text.split(tp_prefix)[-1].strip()

        # 3. If there is a clean markdown header or answer starter later in the text, slice directly to it
        header_match = re.search(r"(?:^|\n)(#{1,3}\s+[A-Za-z0-9]|Your\s+(?:current\s+)?CIS|Based on\s+(?:your\s+)?live|\*\*Executive Summary\*\*|\*\*Security Analysis\*\*|\*\*Overview\*\*)", text)
        if header_match and header_match.start() > 0:
            prefix_text = text[:header_match.start()].strip().lower()
            if any(k in prefix_text for k in ("the user is asking", "the user asked", "constraint:", "critical output rule", "conflict resolution", "let me", "i need to", "looking at the", "strict adherence")):
                text = text[header_match.start():].strip()

        # 4. Aggressively strip scratchpad / reasoning lines line-by-line from start
        scratchpad_prefixes = (
            "the user is asking", "the user asked", "the user wants", "the user question",
            "looking at the telemetry", "looking at the findings", "looking at the data", "looking at the",
            "constraint:", "critical output rule", "critical rule", "rule exception",
            "conflict resolution", "conflict:", "strict adherence", "interpretation:", "interpretation of",
            "let me think", "let me structure", "let me analyze", "let me check", "let me provide", "let me",
            "i need to", "i should provide", "i will provide", "i must follow",
            "however, i need", "however, looking", "however, the", "however, i should", "however, i notice",
            "this is a specific constraint", "this means the", "this is because",
            "since the user asked", "since the findings", "since both",
            "analyze the request", "analyze the telemetry", "analyze the templates",
            "analyze:", "role:", "task:", "input data:",
            "user question:", "user:", "finding details:", "specific rule:",
            "evaluate telemetry:", "drafting the response:", "draft the response:", "mental model:",
            "my reasoning is:", "system instruction:", "critical constraint:", "anti-hallucination:",
            "thinking steps:", "review constraints:", "refine analysis:", "final polish:",
            "meaning:", "correction:", "verify template", "headline:",
            "drafting:", "reasoning:", "let's check", "wait,", "actually,", "telemetry:",
            "risk:", "remediation template", "how to respond", "ensure the", "ensure no",
            "final answer:", "action:", "note:", "confidence:"
        )

        lines = text.split("\n")
        start_idx = 0
        while start_idx < len(lines):
            line_s = lines[start_idx].strip().lower()
            if not line_s:
                start_idx += 1
                continue
            if any(line_s.startswith(p) for p in scratchpad_prefixes) or any(f"**{p}" in line_s for p in scratchpad_prefixes):
                start_idx += 1
            else:
                break
        if start_idx > 0:
            text = "\n".join(lines[start_idx:]).strip()

        # 5. Remove trailing meta-telemetry / scratchpad blocks like "Actionable Telemetry & Remediation Targets:" or "Confidence: 95%"
        text = re.sub(r"(?:^|\n)Actionable Telemetry & Remediation Targets:[\s\S]*$", "", text).strip()
        text = re.sub(r"(?:^|\n)Confidence:\s*\d+%.*$", "", text).strip()

        # 6. Remove opening disclaimers
        for disc_pattern in [
            r"^i don't have live data[^\n]*\n*",
            r"^i do not have live data[^\n]*\n*",
            r"^cannot assess[^\n]*\n*",
            r"^there is no live telemetry[^\n]*\n*",
            r"^no active findings in telemetry[^\n]*\n*",
        ]:
            text = re.sub(disc_pattern, "", text, flags=re.IGNORECASE).strip()

        return text or raw_text



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

    def _chat_text(
        self,
        system_prompt: str,
        user_prompt: str,
        history: list[dict[str, str]] | None = None,
        temperature: float = 0.3,
        max_tokens: int = 1800,
    ) -> tuple[str, str | None]:
        """Plain-text chat completion. Returns (content, error)."""
        url = f"{self.base_url}/chat/completions"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        messages = [{"role": "system", "content": system_prompt}, *(history or []), {"role": "user", "content": user_prompt}]

        # vLLM max_model_len is 8192 for the Qwen deployment: keep input + output inside it.
        est_input_tokens = int(sum(len(m["content"]) for m in messages) / 3.2) + 64
        while est_input_tokens > 6000 and len(messages) > 2:
            messages.pop(1)  # drop the oldest history turn first
            est_input_tokens = int(sum(len(m["content"]) for m in messages) / 3.2) + 64
        safe_max_tokens = max(400, min(max_tokens, 7900 - est_input_tokens))

        payload: dict[str, Any] = {
            "model": self._resolve_model_name(),
            "messages": messages,
            "temperature": temperature,
            "top_p": 0.9,
            "max_tokens": safe_max_tokens,
            # Discourage looping and copying earlier answers.
            "presence_penalty": 0.3,
            "frequency_penalty": 0.3,
            # Qwen3: answer directly instead of emitting a <think> block that eats the token budget.
            "chat_template_kwargs": {"enable_thinking": False},
        }
        timeout = httpx.Timeout(connect=5.0, read=min(self.timeout or 120.0, 120.0), write=15.0, pool=10.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, json=payload, headers=headers)
                if response.status_code == 400 and "chat_template_kwargs" in response.text:
                    payload.pop("chat_template_kwargs")  # older vLLM build
                    response = client.post(url, json=payload, headers=headers)
                if response.is_error:
                    logger.error("vLLM error response (%s): %s", response.status_code, response.text[:500])
                response.raise_for_status()
                return str(response.json()["choices"][0]["message"].get("content") or ""), None
        except Exception as e:
            logger.error("vLLM advisor request to %s failed: %s", url, e)
            return "", f"{type(e).__name__}: {e}"

    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
        history: list[dict[str, str]] | None = None,
        connected_providers: list[dict[str, Any]] | None = None,
        compliance_scores: list[dict[str, Any]] | None = None,
        scope: dict[str, Any] | None = None,
    ) -> AdvisorOutput:
        """Answer a security question from live data; never a canned or invented answer."""
        from .advisor import build_user_prompt, clean_history, extract_answer, finding_refs, grounded_fallback

        findings = sanitizer.sanitize_list(relevant_findings) if relevant_findings else []
        providers = sanitizer.sanitize_list(connected_providers) if connected_providers else []
        scores = compliance_scores or []

        raw, error = self._chat_text(
            ADVISOR_SYSTEM_PROMPT,
            build_user_prompt(question, findings, providers, scores, scope=scope),
            history=clean_history(history),
        )
        answer = extract_answer(raw)
        if not answer:
            if not error:
                error = "the model returned an empty answer"
            logger.warning("Spectra advisor fell back to data-only reply: %s", error)
            return AdvisorOutput(
                answer=grounded_fallback(question, findings, providers, scores, scope=scope, reason=error),
                finding_references=finding_refs(findings),
                confidence=0.0,
            )

        # A verified remediation playbook, only for a finding the user explicitly referenced
        # (never for background findings, which used to append unrelated playbooks).
        pinned = [f for f in findings if f.get("_pinned")]
        asks_fix = re.search(r"\b(fix|remediat|resolve|mitigat|how (do|can|to))", question, re.IGNORECASE)
        if pinned and asks_fix:
            template = get_remediation(str(pinned[0].get("check_id", "")).lower().strip())
            if template:
                res = pinned[0].get("resource")
                res_name = (res.get("name") if isinstance(res, dict) else res) or "<resource>"
                answer = f"{answer.rstrip()}\n\n" + render_remediation_block(
                    template,
                    resource=res_name,
                    region="<region>",
                    subscription_id="<subscription-id>",
                    rg="<resource-group>",
                    account_id="<account-id>",
                    compartment_id="<compartment-ocid>",
                    tenancy_id="<tenancy-ocid>",
                    resource_id=res_name,
                )

        return AdvisorOutput(answer=answer, finding_references=finding_refs(findings), confidence=0.85)
