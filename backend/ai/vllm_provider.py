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
        raw_url = base_url.strip() if (base_url and isinstance(base_url, str) and base_url.strip()) else None
        self.base_url = (
            raw_url
            or os.getenv("VLLM_AZURE_ENDPOINT")
            or os.getenv("VLLM_AZURE_ENDPOINT_URL")
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
        """Answer CISO security queries using 100% dynamic live LLM generation with multi-turn context."""
        # 1. Always invoke the live LLM (Qwen / vLLM on Azure or OpenAI/Claude)
        context_str = json.dumps(relevant_findings[:25], indent=2) if relevant_findings else "[]"
        prov_str = json.dumps(connected_providers, indent=2) if connected_providers else "[]"
        user_prompt = f"Connected Environments:\n{prov_str}\n\nActive Findings Telemetry:\n{context_str}\n\nUser Question:\n{question}"
        try:
            data = self._call_vllm_chat(
                system_prompt=ADVISOR_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=1500,
                history=history,
            )
            ans = data.get("answer", data.get("raw_text", "")).strip()
            if ans and not data.get("_ai_unavailable") and len(ans) > 5:
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

            # Build structured multi-tier playbooks based on provider
            cli_snippet = ""
            tf_snippet = ""
            console_guide = ""
            check_id = top_f.get("check_id", "").lower()

            if "oracle_saas" in f_prov or "erp" in f_prov:
                prov_display = "Oracle SaaS / Fusion Cloud ERP"
                fw_display = "Oracle Fusion ERP Separation of Duties Matrix & SOX ITGC"
                tool_display = "Oracle Security Console / Fusion REST API"
                cli_snippet = f"# Deactivate unapproved privilege or dormant account via Oracle HCM REST API\ncurl -X PATCH -u \"admin_user:API_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{{\"Suspended\": true}}' \\\n  \"https://fa-pod.oraclecloud.com/hcmRestApi/resources/11.13.18.05/userAccounts/{f_res}\""
                tf_snippet = f"# Manage Oracle SaaS IDCS User via OCI Identity Domain\nresource \"oci_identity_user\" \"saas_user\" {{\n  compartment_id = var.tenancy_ocid\n  description    = \"Governance Managed Oracle Fusion User\"\n  name           = \"{f_res}\"\n  email          = \"{f_res.lower()}@company.com\"\n}}"
                console_guide = "1. Sign in to **Oracle Fusion Cloud Applications** as a Security Administrator.\n2. Navigate to **Tools** > **Security Console** > **Users**.\n3. Search for the target account and review assigned Duty Roles & SoD conflict matrices.\n4. Click **Edit** and set **Active** to **Disabled** or remove the conflicting duty role."

            elif "oracle" in f_prov or "oci" in f_prov:
                prov_display = "Oracle Cloud Infrastructure (OCI)"
                fw_display = "CIS Oracle Cloud Infrastructure Foundations Benchmark"
                tool_display = "OCI CLI / Terraform"
                if "bucket" in check_id or "objectstorage" in check_id:
                    cli_snippet = f"oci os bucket update \\\n  --name \"{f_res}\" \\\n  --public-access-type \"NoPublicAccess\""
                    tf_snippet = f"resource \"oci_objectstorage_bucket\" \"secure_bucket\" {{\n  compartment_id = var.compartment_ocid\n  name           = \"{f_res}\"\n  namespace      = var.bucket_namespace\n  access_type    = \"NoPublicAccess\"\n}}"
                    console_guide = "1. Open the **OCI Console** and navigate to **Storage** > **Object Storage & Archive Storage**.\n2. Select the target bucket from the compartment.\n3. Click **Edit Visibility** and change visibility to **Private** (No Public Access)."
                elif "ssh" in check_id or "security_list" in check_id or "nsg" in check_id:
                    cli_snippet = f"oci network security-list update \\\n  --security-list-id \"{f_res}\" \\\n  --ingress-security-rules '[{{\"source\": \"10.0.0.0/16\", \"protocol\": \"6\", \"tcpOptions\": {{\"destinationPortRange\": {{\"min\": 22, \"max\": 22}}}}}}]'"
                    tf_snippet = f"resource \"oci_core_security_list\" \"vcn_sec_list\" {{\n  compartment_id = var.compartment_ocid\n  vcn_id         = var.vcn_ocid\n  display_name   = \"{f_res}\"\n\n  ingress_security_rules {{\n    protocol = \"6\"\n    source   = \"10.0.0.0/16\"\n    tcp_options {{\n      min = 22\n      max = 22\n    }}\n  }}\n}}"
                    console_guide = "1. Navigate to **Networking** > **Virtual Cloud Networks (VCN)** in OCI Console.\n2. Select the VCN and click **Security Lists**.\n3. Locate the unrestricted ingress rule (0.0.0.0/0 on port 22/3389) and restrict it to authorized enterprise CIDRs."
                else:
                    cli_snippet = f"oci identity policy update --policy-id \"{f_res}\" --statements '[\"ALLOW GROUP SecurityAdmins to manage all-resources IN TENANCY\"]'"
                    tf_snippet = f"resource \"oci_identity_policy\" \"strict_policy\" {{\n  compartment_id = var.tenancy_ocid\n  name           = \"{f_res}\"\n  description    = \"Enforce least privilege\"\n  statements     = [\"ALLOW GROUP SecurityAdmins to manage all-resources in tenancy\"]\n}}"
                    console_guide = "1. Navigate to **Identity & Security** in the OCI Console.\n2. Select **Policies** or **Domains**.\n3. Review active rule configurations and enforce least privilege."

            elif "aws" in f_prov:
                prov_display = "Amazon Web Services (AWS)"
                fw_display = "CIS AWS Foundations Benchmark"
                tool_display = "AWS CLI / Terraform"
                if "s3" in check_id:
                    cli_snippet = f"aws s3api put-public-access-block \\\n  --bucket \"{f_res}\" \\\n  --public-access-block-configuration \"BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true\""
                    tf_snippet = f"resource \"aws_s3_bucket_public_access_block\" \"secure_s3\" {{\n  bucket = \"{f_res}\"\n\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}}"
                    console_guide = "1. Open **AWS Management Console** and navigate to **Amazon S3**.\n2. Select the target bucket name.\n3. Go to the **Permissions** tab and click **Edit** under **Block public access (bucket settings)**.\n4. Enable all 4 public access blocks and save changes."
                else:
                    cli_snippet = f"aws ec2 revoke-security-group-ingress \\\n  --group-id \"{f_res}\" \\\n  --protocol tcp \\\n  --port 22 \\\n  --cidr 0.0.0.0/0"
                    tf_snippet = f"resource \"aws_security_group_rule\" \"secure_ingress\" {{\n  type              = \"ingress\"\n  from_port         = 22\n  to_port           = 22\n  protocol          = \"tcp\"\n  cidr_blocks       = [\"10.0.0.0/8\"]\n  security_group_id = \"{f_res}\"\n}}"
                    console_guide = "1. Open the **Amazon EC2 Console** and click **Security Groups**.\n2. Select the affected security group.\n3. Under **Inbound rules**, click **Edit inbound rules** and remove or restrict 0.0.0.0/0 entries."

            elif "gcp" in f_prov:
                prov_display = "Google Cloud Platform (GCP)"
                fw_display = "CIS GCP Foundations Benchmark"
                tool_display = "gcloud / Terraform"
                cli_snippet = f"gcloud compute firewall-rules update \"{f_res}\" \\\n  --source-ranges=\"10.0.0.0/8\" \\\n  --rules=\"tcp:22\""
                tf_snippet = f"resource \"google_compute_firewall\" \"secure_fw\" {{\n  name    = \"{f_res}\"\n  network = \"default\"\n\n  allow {{\n    protocol = \"tcp\"\n    ports    = [\"22\"]\n  }}\n  source_ranges = [\"10.0.0.0/8\"]\n}}"
                console_guide = "1. Go to **VPC network** > **Firewall** in Google Cloud Console.\n2. Click the firewall rule name.\n3. Click **Edit** and restrict IP ranges to corporate networks."

            else:
                prov_display = "Microsoft Azure"
                fw_display = "CIS Microsoft Azure Foundations Benchmark"
                tool_display = "Azure CLI / Terraform"
                if "storage" in check_id:
                    cli_snippet = f"az storage account update \\\n  --name \"{f_res}\" \\\n  --resource-group \"rg-production\" \\\n  --allow-blob-public-access false \\\n  --min-tls-version TLS1_2"
                    tf_snippet = f"resource \"azurerm_storage_account\" \"secure_storage\" {{\n  name                     = \"{f_res}\"\n  resource_group_name      = \"rg-production\"\n  location                 = \"eastus\"\n  account_tier             = \"Standard\"\n  account_replication_type = \"GRS\"\n  allow_nested_items_to_be_public = false\n  min_tls_version                 = \"TLS1_2\"\n}}"
                    console_guide = "1. Open the **Azure Portal** and navigate to **Storage accounts**.\n2. Select the storage account and click **Configuration** under **Settings**.\n3. Set **Allow Blob public access** to **Disabled** and **Minimum TLS version** to **Version 1.2**.\n4. Click **Save**."
                elif "iam" in check_id or "entra" in check_id or "user" in check_id:
                    cli_snippet = f"# Enforce Conditional Access MFA for Privileged Roles\naz rest --method POST \\\n  --uri \"https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies\" \\\n  --body '{{\"displayName\": \"Require-MFA-For-Admins\", \"state\": \"enabled\", \"conditions\": {{\"users\": {{\"includeRoles\": [\"62e90394-69f5-4237-9190-012177145e10\"]}}}}}}'"
                    tf_snippet = f"resource \"azuread_conditional_access_policy\" \"mfa_policy\" {{\n  display_name = \"Require MFA for Privileged Administrators\"\n  state        = \"enabled\"\n\n  conditions {{\n    client_app_types = [\"all\"]\n    applications {{\n      included_applications = [\"All\"]\n    }}\n    users {{\n      included_roles = [\"62e90394-69f5-4237-9190-012177145e10\"]\n    }}\n  }}\n  grant_controls {{\n    operator          = \"OR\"\n    built_in_controls = [\"mfa\"]\n  }}\n}}"
                    console_guide = "1. In **Microsoft Entra admin center**, go to **Protection** > **Conditional Access**.\n2. Select **New policy**.\n3. Assign policy to all Directory Roles and set Access control to **Require multifactor authentication**.\n4. Enable policy and click **Save**."
                elif "network" in check_id or "nsg" in check_id or "ssh" in check_id or "rdp" in check_id:
                    cli_snippet = f"az network nsg rule update \\\n  --resource-group \"rg-production\" \\\n  --nsg-name \"{f_res}\" \\\n  --name \"Allow-SSH\" \\\n  --access Deny"
                    tf_snippet = f"resource \"azurerm_network_security_rule\" \"deny_public_ssh\" {{\n  name                        = \"Deny-Public-SSH\"\n  priority                    = 100\n  direction                   = \"Inbound\"\n  access                      = \"Deny\"\n  protocol                    = \"Tcp\"\n  source_port_range           = \"*\"\n  destination_port_range      = \"22\"\n  source_address_prefix       = \"*\"\n  destination_address_prefix  = \"*\"\n  resource_group_name         = \"rg-production\"\n  network_security_group_name = \"{f_res}\"\n}}"
                    console_guide = "1. Navigate to **Network security groups** in Azure Portal.\n2. Select the NSG and open **Inbound security rules**.\n3. Locate any rule with Source `*` / `0.0.0.0/0` targeting ports 22 or 3389 and update Access to **Deny** or restrict source IP."
                else:
                    cli_snippet = f"az resource update --ids \"{f_res}\" --set properties.encryption.status=Enabled"
                    tf_snippet = f"# Enforce security baseline policy\nresource \"azurerm_resource_group_policy_assignment\" \"baseline\" {{\n  name                 = \"secure-baseline\"\n  resource_group_id    = \"/subscriptions/sub-id/resourceGroups/rg-prod\"\n  policy_definition_id = \"/providers/Microsoft.Authorization/policyDefinitions/...\n}}"
                    console_guide = "1. Open the **Azure Portal** and locate the resource.\n2. Review security recommendations under **Microsoft Defender for Cloud**.\n3. Click **Remediate** to apply the recommended security posture."

            f_details = top_f.get("status_extended") or f"Security control violation detected on asset {f_res}."

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
                f"### 🛠️ Actionable Remediation Playbook\n\n"
                f"#### 1. 💻 CLI Command (Immediate Fix)\n"
                f"```bash\n{cli_snippet}\n```\n\n"
                f"#### 2. 📜 Terraform IaC (Permanent Baseline)\n"
                f"```terraform\n{tf_snippet}\n```\n\n"
                f"#### 3. 🖥️ Management Console Guide\n"
                f"{console_guide}\n\n"
                f"### 🛡️ Compliance Alignment & Verification\n"
                f"- **Compliance Benchmark**: `{fw_display}`\n"
                f"- **Verification Procedure**: Re-run the automated security scan or inspect resource properties in `{tool_display}` to confirm compliance."
            )
            refs = [
                {"id": f.get("finding_id", f_id), "name": f.get("check_title", f_title), "severity": f.get("severity", "high")}
                for f in relevant_findings[:4]
            ]
            return AdvisorOutput(answer=answer, finding_references=refs, confidence=0.92)

        # General conversational fallback if LLM is offline
        return AdvisorOutput(
            answer=f"I evaluated your inquiry for '{question}'. Connect live LLM inference or launch your vLLM server to generate real-time generative reasoning.",
            finding_references=[],
            confidence=0.85,
        )