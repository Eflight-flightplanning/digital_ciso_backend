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

        # Calculate dynamic token ceiling to ensure input_tokens + max_tokens <= 3900 (vLLM max_model_len is 4096)
        total_prompt_chars = sum(len(m.get("content", "")) for m in messages)
        est_input_tokens = int(total_prompt_chars / 3.2) + 30
        safe_max_tokens = max(350, min(max_tokens, 3900 - est_input_tokens))

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": safe_max_tokens,
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
        """Strip internal reasoning scratchpads and thinking traces from Qwen / other LLM responses.

        Handles multiple leakage patterns:
        1. Qwen <think>...</think> XML tags
        2. "Thinking Process:" section headers
        3. Qwen 3 inline scratchpad pattern: outputs the system-prompt structure verbatim
           e.g. "User Question:", "Constraint:", "Specific Rule:", "Evaluate Telemetry:",
           "Drafting the Response:", "Mental Model:", "My reasoning is:" etc.
        """
        text = raw_text.strip()

        # 1. Strip Qwen XML thinking tags — take only what's after </think>
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()

        # 2. Strip "Thinking Process:" or "Here's a thinking process" section block
        for tp_prefix in ["Thinking Process:", "Thinking process:", "Here's a thinking process", "Here is a thinking process"]:
            if tp_prefix in text:
                text = text.split(tp_prefix)[-1].strip()

        # 3. Detect verbose scratchpad/reasoning leakage patterns
        _SCRATCHPAD_START_HEADERS = (
            "user question:",
            "user: asks for",
            "user:",
            "finding details:",
            "critical rule:",
            "constraint:",
            "specific rule:",
            "evaluate telemetry:",
            "drafting the response:",
            "mental model:",
            "my reasoning is:",
            "system instruction:",
            "critical constraint:",
            "anti-hallucination:",
            "thinking steps:",
            "meaning: this finding",
            "meaning:",
            "interpretation:",
            "correction:",
            "wait, let's",
            "actually, looking",
        )
        _ANSWER_RESUME_MARKERS = (
            "### 1.",
            "### security risk",
            "### attack path",
            "### root cause",
            "### step-by-step",
            "## security risk",
            "## risk",
            "## remediation",
            "## summary",
            "### spectra",
            "direct answer:",
            "**direct answer",
            "1. **how an attacker",
            "1. **step-by-step",
            "1. **attack path",
            "1. **security risk",
            "1. an attacker",
        )

        text_lower = text.lower()
        has_scratchpad = any(text_lower.startswith(h) or f"\n{h}" in text_lower[:400] for h in _SCRATCHPAD_START_HEADERS)
        if has_scratchpad:
            best_resume = -1
            for marker in _ANSWER_RESUME_MARKERS:
                idx = text_lower.find(marker)
                if idx != -1:
                    if best_resume == -1 or idx < best_resume:
                        best_resume = idx
            if best_resume != -1:
                text = text[best_resume:].strip()

        # 4. Line-by-line filter: remove individual bullet scratchpad lines
        scratchpad_line_re = re.compile(
            r"^(?:\*|-|\d+\.)\s*(?:\*\*)?(?:User Input|User:|Role|Task|Constraints|Greeting|"
            r"Status|Telemetry|Offer|Formatting|Analyze|Identify|Determine|Draft|Construct|"
            r"Mental|Thinking|Final|Refine|JSON|Context|System Instruction|Critical Constraint|"
            r"Critical Rule|Specific Rule|Evaluate|Drafting|Constraint|Interpretation|Correction)\b",
            re.IGNORECASE,
        )
        lines = []
        for line in text.split("\n"):
            line_str = line.strip()
            if scratchpad_line_re.match(line_str):
                continue
            if any(line_str.lower().startswith(h) for h in _SCRATCHPAD_START_HEADERS):
                continue
            lines.append(line)

        result = "\n".join(lines).strip()
        return result or text or raw_text



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
        # Slim findings to only essential fields to stay within small context windows
        # (e.g. models loaded with max_model_len=4096). Full raw JSON with indent=2
        # for 25 findings can easily exceed 2000+ tokens on its own.
        _SLIM_KEYS = ("finding_id", "provider", "check_id", "check_title", "severity", "status", "resource", "remediation")

        # Separate pinned (UUID-fetched) findings from general context findings
        pinned_findings = [f for f in (relevant_findings or []) if f.get("_pinned")]
        general_findings = [f for f in (relevant_findings or []) if not f.get("_pinned")]

        def _slim(f: dict) -> dict:
            return {k: f[k] for k in _SLIM_KEYS if k in f}

        slim_pinned = [_slim(f) for f in pinned_findings[:2]]
        # If user explicitly requested a specific finding, avoid cluttering context with unrelated findings
        slim_general = [] if slim_pinned else [_slim(f) for f in general_findings[:3]]
        context_str = json.dumps(slim_general, indent=1) if slim_general else "[]"
        prov_str = json.dumps([{"provider": p.get("provider"), "alias": p.get("alias")} for p in (connected_providers or [])[:4]], indent=1) if connected_providers else "[]"

        # Derive the primary cloud provider from findings, question context, or connected providers
        _primary_cloud = None
        for f in (slim_pinned + slim_general):
            _primary_cloud = f.get("provider")
            if _primary_cloud:
                break

        if not _primary_cloud and connected_providers:
            _primary_cloud = connected_providers[0].get("provider")

        if not _primary_cloud:
            q_lower = (question or "").lower()
            if any(k in q_lower for k in ("azure", "entra", "defender", "virtual machine", "vnet", "nsg", "microsoft", "active directory", "jit", "blob storage", "key vault")):
                _primary_cloud = "azure"
            elif any(k in q_lower for k in ("oracle saas", "fusion", "erp", "hcm", "sod", "idcs")):
                _primary_cloud = "oracle_saas"
            elif any(k in q_lower for k in ("oci", "oracle cloud", "compartment", "vcn", "security zone")):
                _primary_cloud = "oraclecloud"
            elif any(k in q_lower for k in ("aws", "amazon", "s3", "ec2", "iam role", "cloudwatch", "guardduty", "cloudtrail", "rds", "kms")):
                _primary_cloud = "aws"
            elif any(k in q_lower for k in ("gcp", "google cloud", "bigquery", "cloud storage", "gke", "cloud sql")):
                _primary_cloud = "gcp"
            elif any(k in q_lower for k in ("kubernetes", "k8s", "pod", "deployment", "clusterrole", "kube-apiserver")):
                _primary_cloud = "kubernetes"
            elif any(k in q_lower for k in ("github", "repository", "branch protection", "dependabot", "codeql")):
                _primary_cloud = "github"
            elif any(k in q_lower for k in ("m365", "microsoft 365", "office 365", "exchange online", "sharepoint", "intune")):
                _primary_cloud = "m365"
            elif any(k in q_lower for k in ("alibaba", "aliyun", "actiontrail")):
                _primary_cloud = "alibabacloud"
            elif any(k in q_lower for k in ("cloudflare", "dnssec", "waf")):
                _primary_cloud = "cloudflare"
            elif any(k in q_lower for k in ("okta", "okta user")):
                _primary_cloud = "okta"

        _CLOUD_LABELS = {
            "azure": "Microsoft Azure",
            "aws": "Amazon Web Services (AWS)",
            "gcp": "Google Cloud Platform (GCP)",
            "oraclecloud": "Oracle Cloud Infrastructure (OCI)",
            "oci": "Oracle Cloud Infrastructure (OCI)",
            "oracle_saas": "Oracle Fusion SaaS (ERP/HCM)",
            "kubernetes": "Kubernetes (K8s)",
            "k8s": "Kubernetes (K8s)",
            "github": "GitHub Security",
            "m365": "Microsoft 365",
            "alibabacloud": "Alibaba Cloud",
            "cloudflare": "Cloudflare",
            "okta": "Okta Identity",
        }
        _cloud_hint = (
            f"\nCloud Environment: {_CLOUD_LABELS.get(_primary_cloud, str(_primary_cloud).upper())}"
            f" — generate {_primary_cloud}-specific CLI, Terraform, and portal steps ONLY.\n"
            if _primary_cloud else ""
        )

        # Build pinned-finding block — this is the user's directly requested finding.
        # It appears first and overrides the anti-hallucination "no live data" rule.
        pinned_section = ""
        if slim_pinned:
            pinned_section = (
                "\n\nLIVE FINDING DATA (directly retrieved from the scanner database for this exact finding ID):\n"
                + json.dumps(slim_pinned, indent=1)
                + "\nINSTRUCTION: The above is verified live telemetry for the requested finding. Analyse it directly and provide the security risk "
                  "and step-by-step remediation (CLI, Terraform, Console). Do NOT claim live data is missing or confuse the cloud provider.\n"
            )

        # Drop verbose verified_section when context is already substantial to avoid
        # exceeding the model's context window on small (4096-token) deployments.
        _context_est_chars = len(prov_str) + len(context_str) + len(question) + len(pinned_section)
        _include_playbooks = _context_est_chars < 1800 and verified_section
        user_prompt = (
            f"Connected Environments:\n{prov_str}\n"
            f"{_cloud_hint}"
            f"{pinned_section}\n"
            f"Active Findings Telemetry:\n{context_str}"
            f"{verified_section if _include_playbooks else ''}\n\n"
            f"User Question:\n{question}"
        )

        data = self._call_vllm_chat(
            system_prompt=ADVISOR_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=1800,
            history=history,
        )
        if data.get("_ai_unavailable"):
            raise RuntimeError(f"vLLM advisor call failed: {data.get('error')}")

        raw_ans = data.get("answer", data.get("raw_text", "")).strip()
        ans = self._clean_thinking_trace(raw_ans)

        if not ans or len(ans) <= 15:
            q_low = (question or "").strip().lower()
            if any(q_low == g or q_low.startswith(g + " ") or q_low.startswith(g + "?") for g in ["hey", "hello", "hi", "help", "who are you", "what can you do"]):
                ans = "Hello! I am Spectra, your Autonomous AI Security Copilot. I'm ready to assist with cloud security posture, compliance gaps, toxic attack paths, and step-by-step remediations. How can I help you today?"
            elif raw_ans and len(raw_ans) > 15:
                ans = raw_ans
            else:
                ans = "Spectra analyzed your request against connected cloud telemetry. Please specify a finding or cloud resource for a deeper technical breakdown."

        refs = data.get("finding_references", [])
        if not refs and relevant_findings:
            refs = [
                {
                    "id": f.get("finding_id", ""),
                    "name": f.get("check_title", f.get("check_id", "")),
                    "severity": f.get("severity", "high"),
                    "provider": f.get("provider", _primary_cloud or "oraclecloud"),
                }
                for f in relevant_findings[:4]
            ]
        elif refs:
            f_map = {f.get("finding_id"): f.get("provider") for f in (relevant_findings or [])}
            for r in refs:
                if not r.get("provider"):
                    r["provider"] = f_map.get(r.get("id")) or _primary_cloud or "oraclecloud"
        # If user explicitly asked for a target finding that was not found in DB telemetry:
        not_found_obj = next((f for f in (relevant_findings or []) if f.get("_not_found_target")), None)
        if not_found_obj and not_found_obj.get("_not_found_target"):
            tgt = not_found_obj["_not_found_target"]
            warning_header = (
                f"> [!WARNING]\n"
                f"> **Finding Not Found in Live Telemetry**: The requested finding/check `{tgt}` is not present in your active cloud scan telemetry.\n\n"
            )
            if not ans.startswith(">") and "not present in your active" not in ans:
                ans = warning_header + ans

        return AdvisorOutput(
            answer=ans,
            finding_references=refs,
            confidence=float(data.get("confidence", 0.95)),
        )

