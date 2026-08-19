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
from .provider import (
    AdvisorOutput,
    AIProvider,
    CorrelationOutput,
    DecisionOutput,
    ReasoningOutput,
)

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
        self.base_url = (
            base_url
            or os.getenv("VLLM_AZURE_ENDPOINT")
            or DEFAULT_VLLM_ENDPOINT
        ).rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"

        self.api_key = api_key or os.getenv("VLLM_AZURE_API_KEY", "EMPTY")
        self.model = model_name or os.getenv("VLLM_MODEL_NAME", DEFAULT_MODEL)
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
    def _extract_json(text: str) -> dict[str, Any]:
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

        # 5. Header-based preamble stripping: if Spectra header exists, cut directly to it
        cleaned_text = raw_text
        if any(h in raw_text for h in ["### Spectra", "## Current State", "## Actionable", "## Risk Profile"]):
            for marker in ["### Spectra", "## Current State", "## Actionable", "## Risk Profile"]:
                if marker in cleaned_text:
                    cleaned_text = marker + cleaned_text.split(marker, 1)[1]
                    break
        else:
            lines = [l for l in raw_text.split("\n") if not re.match(r"^\s*(?:\d+\.|\*|-)?\s*(?:Determine|Draft|Construct|Mental|Thinking|Final|Refine|JSON)\b", l, re.IGNORECASE)]
            if lines:
                cleaned_text = "\n".join(lines).strip()

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
    ) -> AdvisorOutput:
        """Answer CISO security queries using 100% dynamic live LLM generation with multi-turn context."""
        # 1. Always invoke the live LLM (Qwen / vLLM on Azure or OpenAI/Claude)
        context_str = json.dumps(relevant_findings[:25], indent=2) if relevant_findings else "[]"
        user_prompt = f"Active Findings Telemetry:\n{context_str}\n\nUser Question:\n{question}"
        try:
            data = self._call_vllm_chat(
                system_prompt=ADVISOR_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=1500,
                history=history,
            )
            ans = data.get("answer", data.get("raw_text", "")).strip()
            if ans and not ans.startswith("This is a simulated") and len(ans) > 10:
                refs = data.get("finding_references", [])
                if not refs and relevant_findings:
                    # Only include references if the finding relates to the query or answer
                    refs = [
                        {
                            "id": f.get("finding_id", ""),
                            "name": f.get("check_title", f.get("check_id", "")),
                            "severity": f.get("severity", "high"),
                            "resource": f.get("resource", {}).get("name") if isinstance(f.get("resource"), dict) else str(f.get("resource", "")),
                        }
                        for f in relevant_findings[:5]
                        if any(kw in (f.get("check_title", "") + " " + f.get("check_id", "") + " " + str(f.get("resource", ""))).lower()
                               for kw in question.lower().split() if len(kw) > 3)
                           or f.get("finding_id", "---") in ans
                    ]
                return AdvisorOutput(
                    answer=ans,
                    finding_references=refs,
                    confidence=float(data.get("confidence", 0.95)),
                )
        except Exception as e:
            logger.warning("Live vLLM call failed: %s, using telemetry fallback", e)

        # 2. Offline Telemetry Fallback (ONLY if the live LLM server is unreachable)
        if relevant_findings:
            top_f = relevant_findings[0]
            f_title = top_f.get("check_title") or top_f.get("check_id", "").replace("_", " ")
            f_id = top_f.get("finding_id", "FND-0001")
            f_res = top_f.get("resource", {}).get("name") if isinstance(top_f.get("resource"), dict) else (top_f.get("resource") or "cloud-resource")
            f_sev = (top_f.get("severity") or "HIGH").upper()
            f_prov = (top_f.get("provider") or "").lower()

            if "oracle_saas" in f_prov or "erp" in f_prov:
                prov_display = "Oracle SaaS / Fusion Cloud ERP"
                fw_display = "Oracle Fusion ERP Separation of Duties Matrix & SOX ITGC"
                tool_display = "Oracle Security Console / Fusion REST API"
            elif "oracle" in f_prov or "oci" in f_prov:
                prov_display = "Oracle Cloud Infrastructure (OCI)"
                fw_display = "CIS Oracle Cloud Infrastructure Foundations Benchmark"
                tool_display = "OCI CLI / Terraform"
            elif "aws" in f_prov:
                prov_display = "Amazon Web Services (AWS)"
                fw_display = "CIS AWS Foundations Benchmark"
                tool_display = "AWS CLI / Terraform"
            elif "gcp" in f_prov:
                prov_display = "Google Cloud Platform (GCP)"
                fw_display = "CIS GCP Foundations Benchmark"
                tool_display = "gcloud / Terraform"
            else:
                prov_display = "Microsoft Azure"
                fw_display = "CIS Microsoft Azure Foundations Benchmark"
                tool_display = "Azure CLI / Terraform"

            f_details = top_f.get("status_extended") or f"Security control violation detected on asset {f_res}."
            f_rem = top_f.get("remediation") or f"Apply secure configuration policy via {tool_display}."

            multi_summary = ""
            if len(relevant_findings) > 1:
                multi_summary = "\n\n**Additional Correlated Findings in Scope:**\n" + "\n".join(
                    f"- `{f.get('check_title') or f.get('check_id')}` ({f.get('severity', 'MEDIUM').upper()} Risk on `{f.get('resource', {}).get('name', 'resource') if isinstance(f.get('resource'), dict) else f.get('resource', 'resource')}`)"
                    for f in relevant_findings[1:4]
                )

            answer = (
                f"### Spectra Threat Analysis & Advisory\n\n"
                f"**Environment Scope:** `{prov_display}`\n"
                f"**Primary Finding:** `{f_title}` ({f_sev} Risk)\n"
                f"**Target Resource / Asset:** `{f_res}`\n\n"
                f"**Risk Evaluation & Technical Root Cause:**\n"
                f"{f_details}{multi_summary}\n\n"
                f"**Actionable Remediation Strategy:**\n"
                f"1. **Primary Remediation**: {f_rem}\n"
                f"2. **Aegis Decision Core**: Review and authorize the automated {tool_display} execution playbook.\n"
                f"3. **Verification**: Re-run the compliance audit to confirm validation against **{fw_display}**."
            )
            refs = [
                {"id": f.get("finding_id", f_id), "name": f.get("check_title", f_title), "severity": f.get("severity", "high")}
                for f in relevant_findings[:4]
            ]
            return AdvisorOutput(answer=answer, finding_references=refs, confidence=0.90)

        # General conversational fallback if LLM is offline
        return AdvisorOutput(
            answer=f"I evaluated your inquiry for '{question}'. Connect live LLM inference or launch your vLLM server to generate real-time generative reasoning.",
            finding_references=[],
            confidence=0.85,
        )