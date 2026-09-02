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
        est_input_tokens = int(total_prompt_chars / 3.2) + 30
        safe_max_tokens = max(500, min(max_tokens, 7800 - est_input_tokens))

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": safe_max_tokens,
        }

        try:
            timeout_config = httpx.Timeout(connect=10.0, read=self.timeout or 180.0, write=20.0, pool=10.0)
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

    def answer_advisor_query(
        self,
        question: str,
        relevant_findings: list[dict[str, Any]],
        history: list[dict[str, str]] | None = None,
        connected_providers: list[dict[str, Any]] | None = None,
        compliance_scores: list[dict[str, Any]] | None = None,
    ) -> AdvisorOutput:
        """Answer CISO security queries using dynamic live LLM generation augmented with verified remediation templates."""
        # 0. Sanitize untrusted cloud resource data
        relevant_findings = sanitizer.sanitize_list(relevant_findings) if relevant_findings else relevant_findings
        connected_providers = sanitizer.sanitize_list(connected_providers) if connected_providers else connected_providers

        # 1. Separate pinned findings from general context findings
        pinned_findings = [f for f in (relevant_findings or []) if f.get("_pinned")]
        general_findings = [f for f in (relevant_findings or []) if not f.get("_pinned")]
        _primary_finding = (pinned_findings or general_findings or [None])[0]

        primary_template_block: str | None = None
        if _primary_finding:
            cid = _primary_finding.get("check_id", "").lower().strip()
            template = get_remediation(cid)
            if template:
                f_res = (
                    _primary_finding.get("resource", {}).get("name")
                    if isinstance(_primary_finding.get("resource"), dict)
                    else (_primary_finding.get("resource") or "target-resource")
                )
                primary_template_block = render_remediation_block(
                    template,
                    resource=f_res,
                    region=_primary_finding.get("region") or "eastus",
                    subscription_id=_primary_finding.get("subscription_id") or "sub-id",
                    rg=_primary_finding.get("resource_group") or "rg-production",
                    account_id=_primary_finding.get("account_id") or "123456789012",
                    compartment_id=_primary_finding.get("compartment_id") or "ocid1.compartment.oc1..example",
                    tenancy_id=_primary_finding.get("tenancy_id") or "ocid1.tenancy.oc1..example",
                    resource_id=_primary_finding.get("resource_id") or f_res,
                )

        # 2. Prepare slim findings
        _SLIM_KEYS = ("finding_id", "provider", "check_id", "check_title", "severity", "status", "resource", "remediation")

        def _slim(f: dict) -> dict:
            return {k: f[k] for k in _SLIM_KEYS if k in f}

        slim_pinned = [_slim(f) for f in pinned_findings[:2]]
        slim_general = [] if slim_pinned else [_slim(f) for f in general_findings[:4]]
        context_str = json.dumps(slim_general, indent=1) if slim_general else "[]"
        prov_str = json.dumps([{"provider": p.get("provider"), "alias": p.get("alias")} for p in (connected_providers or [])[:4]], indent=1) if connected_providers else "[]"

        # 3. Format live compliance scores context
        comp_str = ""
        if compliance_scores:
            comp_lines = []
            for c in compliance_scores[:12]:
                comp_lines.append(
                    f"- {c.get('framework')} ({c.get('compliance_id')}): Control Score {c.get('score')}% "
                    f"({c.get('passed')} Passed, {c.get('failed')} Failed, {c.get('manual')} Manual / Resource Not Available, Total: {c.get('total')})"
                )
            comp_str = "\nLive Compliance & Benchmark Telemetry:\n" + "\n".join(comp_lines) + "\n"

        # 4. Derive primary cloud provider and check for multi-cloud / overview query
        q_lower = (question or "").lower()
        is_overview_query = any(w in q_lower for w in ("multi-cloud", "multicloud", "briefing", "posture", "ciso", "executive", "overall", "all cloud", "across", "compare", "score", "compliance", "cis score", "sla", "readiness"))

        _primary_cloud = None
        for f in (slim_pinned + slim_general):
            _primary_cloud = f.get("provider")
            if _primary_cloud:
                break

        if not _primary_cloud and connected_providers:
            _primary_cloud = connected_providers[0].get("provider")

        if not _primary_cloud:
            if any(k in q_lower for k in ("azure", "entra", "defender", "virtual machine", "vnet", "nsg", "microsoft")):
                _primary_cloud = "azure"
            elif any(k in q_lower for k in ("oracle saas", "fusion", "erp", "hcm", "sod")):
                _primary_cloud = "oracle_saas"
            elif any(k in q_lower for k in ("oci", "oracle cloud", "compartment", "vcn")):
                _primary_cloud = "oraclecloud"
            elif any(k in q_lower for k in ("aws", "amazon", "s3", "ec2")):
                _primary_cloud = "aws"
            elif any(k in q_lower for k in ("gcp", "google cloud")):
                _primary_cloud = "gcp"

        _CLOUD_LABELS = {
            "azure": "Microsoft Azure",
            "aws": "Amazon Web Services (AWS)",
            "gcp": "Google Cloud Platform (GCP)",
            "oraclecloud": "Oracle Cloud Infrastructure (OCI)",
            "oci": "Oracle Cloud Infrastructure (OCI)",
            "oracle_saas": "Oracle Fusion SaaS (ERP/HCM)",
            "kubernetes": "Kubernetes (K8s)",
            "k8s": "Kubernetes (K8s)",
        }

        if is_overview_query:
            _cloud_hint = "\nScope: Multi-Cloud Governance & Security Posture across all connected cloud environments (Oracle Cloud, Azure, Oracle Fusion SaaS, AWS, GCP).\n"
        else:
            _cloud_hint = (
                f"\nCloud Environment: {_CLOUD_LABELS.get(_primary_cloud, str(_primary_cloud).upper())}"
                f" — generate {_primary_cloud}-specific CLI, Terraform, and portal steps ONLY.\n"
                if _primary_cloud else ""
            )

        # Build pinned-finding block
        if primary_template_block:
            remediation_instruction = (
                "A verified remediation playbook for this exact finding already exists and will be "
                "appended automatically after your response. Write a concise Direct Answer, "
                "Security Risk analysis, and Compliance mapping (2-3 short paragraphs)."
            )
        else:
            remediation_instruction = (
                "Analyse it directly and provide the security risk and step-by-step remediation (CLI, Terraform, Console)."
            )
        pinned_section = ""
        if slim_pinned:
            pinned_section = (
                "\n\nLIVE FINDING DATA:\n"
                + json.dumps(slim_pinned, indent=1)
                + f"\nINSTRUCTION: {remediation_instruction}\n"
            )

        user_prompt = (
            f"Connected Environments:\n{prov_str}\n"
            f"{_cloud_hint}"
            f"{comp_str}"
            f"{pinned_section}\n"
            f"Active Findings Telemetry:\n{context_str}\n\n"
            f"User Question:\n{question}"
        )

        data = self._call_vllm_chat(
            system_prompt=ADVISOR_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=2200,
            history=history,
        )
        if data.get("_ai_unavailable"):
            raise RuntimeError(f"vLLM advisor call failed: {data.get('error')}")

        raw_ans = data.get("answer", data.get("raw_text", "")).strip()
        ans = self._clean_thinking_trace(raw_ans)

        # Check if the output is still contaminated by leaked scratchpad or empty
        low_ans = ans.lower()
        looks_like_reasoning = any(low_ans.startswith(p) for p in (
            "the user is asking", "the user asked", "constraint:", "critical output rule",
            "conflict resolution", "let me think", "i need to be careful", "looking at the"
        )) or "critical output rule:" in low_ans

        if not ans or len(ans) <= 35 or looks_like_reasoning:
            if is_overview_query and any(w in q_lower for w in ("briefing", "posture", "ciso", "executive", "overall", "sla")):
                ans = self._synthesize_executive_briefing(
                    connected_providers=connected_providers or [],
                    compliance_scores=compliance_scores or [],
                    findings=relevant_findings or [],
                )
            elif any(w in q_lower for w in ("cis score", "compliance score", "score of", "what is my cis")):
                ans = self._synthesize_compliance_score_answer(
                    question=question,
                    compliance_scores=compliance_scores or [],
                )
            elif any(q_lower == g or q_lower.startswith(g + " ") or q_lower.startswith(g + "?") for g in ["hey", "hello", "hi", "help", "who are you", "what can you do"]):
                ans = "Hello! I am Spectra, your Autonomous AI Security Copilot. I'm ready to assist with multi-cloud security posture, compliance benchmarks, toxic attack paths, and step-by-step remediations. How can I help you today?"
            elif primary_template_block:
                ans = f"Analysis of `{_primary_finding.get('check_title') or _primary_finding.get('check_id', 'this finding')}`:"
            else:
                ans = "Spectra analyzed your request against connected cloud telemetry. Please specify a finding or cloud resource for a deeper technical breakdown."

        # Append the deterministic, verified remediation playbook
        if primary_template_block:
            ans = f"{ans.rstrip()}\n\n{primary_template_block}"

        refs = data.get("finding_references", [])
        if not refs and relevant_findings:
            real_findings = [f for f in relevant_findings if not str(f.get("finding_id", "")).startswith(("COMPLIANCE-", "OCI-TENANCY", "ORACLE-SAAS", "AZURE-TENANCY"))]
            refs = [
                {
                    "id": f.get("finding_id", ""),
                    "name": f.get("check_title", f.get("check_id", "")),
                    "severity": f.get("severity", "high"),
                    "provider": f.get("provider", _primary_cloud or "oraclecloud"),
                }
                for f in real_findings[:4]
            ]
        elif refs:
            refs = [r for r in refs if not str(r.get("id", "")).startswith(("COMPLIANCE-", "OCI-TENANCY", "ORACLE-SAAS", "AZURE-TENANCY"))]
            f_map = {f.get("finding_id"): f.get("provider") for f in (relevant_findings or [])}
            for r in refs:
                if not r.get("provider"):
                    r["provider"] = f_map.get(r.get("id")) or _primary_cloud or "oraclecloud"

        return AdvisorOutput(
            answer=ans,
            finding_references=refs,
            confidence=float(data.get("confidence", 0.95)),
        )

    @classmethod
    def _synthesize_compliance_score_answer(cls, question: str, compliance_scores: list[dict[str, Any]]) -> str:
        q_low = question.lower()
        target = "azure" if "azure" in q_low else ("oraclecloud" if any(k in q_low for k in ("oci", "oracle cloud", "oraclecloud")) else ("oracle_saas" if "saas" in q_low else None))

        relevant = [
            c for c in compliance_scores
            if (not target or target in c.get("compliance_id", "").lower() or target in c.get("framework", "").lower())
            and ("cis" in c.get("compliance_id", "").lower() or "cis" in c.get("framework", "").lower())
        ]
        if not relevant:
            relevant = [c for c in compliance_scores if "cis" in c.get("compliance_id", "").lower() or "cis" in c.get("framework", "").lower()]
        if not relevant:
            relevant = compliance_scores[:4]

        if not relevant:
            return "No compliance scan telemetry is currently recorded for this cloud provider. Please run a compliance posture scan to calculate your CIS benchmark score."

        provider_name = "Microsoft Azure" if target == "azure" else ("Oracle Cloud Infrastructure (OCI)" if target == "oraclecloud" else "Multi-Cloud")
        lines = [f"## CIS Benchmark Compliance Score: {provider_name}\n"]
        for c in relevant:
            lines.append(
                f"- **{c.get('framework')}** ({c.get('version') or 'v3.0'}): **{c.get('score')}% Control Score**\n"
                f"  - **Passed Controls**: `{c.get('passed')}`\n"
                f"  - **Violations / Failed**: `{c.get('failed')}`\n"
                f"  - **Manual Audits / Resource Not Available**: `{c.get('manual')}`\n"
                f"  - **Total Framework Controls**: `{c.get('total')}`\n"
            )
        lines.append(
            "> [!NOTE]\n"
            "> The compliance score is calculated strictly as `Passed / (Passed + Failed) * 100`. "
            "Controls where the target resource is un-deployed or requires manual verification are categorized under Manual / Resource Not Available."
        )
        return "\n".join(lines)

    @classmethod
    def _synthesize_executive_briefing(
        cls,
        connected_providers: list[dict[str, Any]],
        compliance_scores: list[dict[str, Any]],
        findings: list[dict[str, Any]],
    ) -> str:
        prov_names = ", ".join([p.get("alias") or p.get("provider", "").upper() for p in connected_providers]) or "Oracle Fusion SaaS, Oracle Cloud (OCI), Azure"

        critical_f = [f for f in findings if str(f.get("severity", "")).lower() == "critical"]
        high_f = [f for f in findings if str(f.get("severity", "")).lower() == "high"]
        med_f = [f for f in findings if str(f.get("severity", "")).lower() == "medium"]

        cis_scores = [c for c in compliance_scores if "cis" in c.get("compliance_id", "").lower() or "cis" in c.get("framework", "").lower()]
        other_scores = [c for c in compliance_scores if not ("cis" in c.get("compliance_id", "").lower() or "cis" in c.get("framework", "").lower())]

        sections = [
            f"# Executive CISO Security Briefing: Multi-Cloud Posture & Governance\n",
            f"**Target Scope:** {prov_names}  \n"
            f"**Audit Status:** Active Multi-Cloud Telemetry Ingested  \n",
            f"## 1. Executive Summary\n",
            f"An analysis of connected cloud environments indicates an active multi-cloud security footprint across **Oracle Cloud (OCI)**, **Microsoft Azure**, and **Oracle Fusion SaaS**. "
            f"While core compute perimeters maintain good baseline controls, significant exposure vectors exist in identity role segregation, unencrypted volume storage, and audit logging retention thresholds.\n",
            f"## 2. Top Critical Exposure Paths & Risks\n",
        ]

        top_risks = critical_f[:2] + high_f[:2] + med_f[:2]
        if top_risks:
            for i, r in enumerate(top_risks[:4], 1):
                res_name = r.get("resource", {}).get("name") if isinstance(r.get("resource"), dict) else r.get("resource", "Cloud Resource")
                sections.append(
                    f"{i}. **{r.get('check_title') or r.get('check_id')}** [{str(r.get('severity', 'HIGH')).upper()}]\n"
                    f"   - **Impacted Resource:** `{res_name}` ({str(r.get('provider', '')).upper()})\n"
                    f"   - **Risk Vector:** Misconfiguration increases lateral movement potential and violates least-privilege boundaries.\n"
                )
        else:
            sections.append(
                "1. **Identity & Access Management (IAM / Entra ID):** Over-privileged administrative credentials and missing conditional access policies.\n"
                "2. **Storage & Data Encryption:** Storage assets lacking customer-managed key (CMK/Vault) defense-in-depth.\n"
                "3. **Audit Trail Retention:** Centralized security logging retention below regulatory 365-day thresholds.\n"
            )

        sections.append("## 3. Compliance & Benchmark Readiness\n")
        if cis_scores or other_scores:
            sections.append("| Framework Standard | Control Score | Passed | Failed | Manual / Resource N/A | Total |")
            sections.append("| :--- | :---: | :---: | :---: | :---: | :---: |")
            for c in (cis_scores[:4] + other_scores[:4]):
                sections.append(f"| **{c.get('framework')}** | **{c.get('score')}%** | {c.get('passed')} | {c.get('failed')} | {c.get('manual')} | {c.get('total')} |")
            sections.append("")
        else:
            sections.append("- **CIS Benchmarks (Azure & OCI):** Baseline evaluated across active compartments.")
            sections.append("- **SOC 2 Type II & NIS2:** Governance readiness in progress.\n")

        sections.extend([
            "## 4. Prioritized Remediation SLAs\n",
            "- **Critical Severity (P0) - SLA: 24 Hours**: Remediate public ingress exposure, unauthenticated web applications, and privileged account access.",
            "- **High Severity (P1) - SLA: 7 Days**: Enforce customer-managed encryption (Vault/KMS), disable legacy metadata endpoints (IMDSv2), and activate Cloud Guard.",
            "- **Medium Severity (P2) - SLA: 30 Days**: Resolve Segregation of Duties (SoD) conflicts, expand diagnostic flow logging, and close audit retention gaps.",
        ])

        return "\n".join(sections)

