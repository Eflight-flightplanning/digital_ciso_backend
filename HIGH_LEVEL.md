# Digital CISO Platform — AI Architecture, Guardrails, Data Pipeline & Token Specifications

This document provides a comprehensive technical breakdown of the AI subsystems in the **Digital CISO Security Platform**, explaining:
1. **AI Capabilities & Types of Questions Handled**
2. **AI Railguards, Guardrails & Security Defenses**
3. **Data Pipeline: Natural Language to Database Queries & Context Construction**
4. **Data Formats Received & Output Schemas**
5. **AI Parameters, Context Limits, Models & Token Consumption**
6. **Model Context Protocol (MCP) & Automated Remediation Workflows**

---

## 1. AI Modules & Types of Questions Handled

The platform features distinct AI engines coordinated by the backend orchestration service (`backend/ai/service.py`):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               Digital CISO AI Suite                             │
├───────────────────┬───────────────────┬───────────────────┬─────────────────────┤
│  Spectra Advisor  │ Reasoning Engine  │  Aegis Decision   │ Correlation Engine  │
│  (Copilot / Q&A)  │ (Root-Cause / EA) │  (Triage / HITL)  │  (Attack Paths)     │
└───────────────────┴───────────────────┴───────────────────┴─────────────────────┘
```

### A. Spectra AI Security Copilot (`/ai/advisor/query`)
A conversational CISO advisor grounded exclusively in live multi-cloud telemetry and compliance data.

#### Types of Questions Handled:
- **Triage & Remediation Prioritization**:
  - *"What are our top critical findings that we should remediate first today?"*
  - *"Show me all unencrypted databases in production."*
  - *"What high-severity issues affect our Azure infrastructure?"*
- **Cloud-Specific Security Queries (AWS, Azure, OCI, GCP, K8s)**:
  - *"Which virtual machines have open NSG ports to the internet (0.0.0.0/0)?"*
  - *"Are there any S3 buckets or OCI Object Storage with public read access?"*
  - *"List IAM users with missing Multi-Factor Authentication (MFA)."*
- **Oracle Fusion SaaS & ERP Identity Governance**:
  - *"Are there any Segregation of Duties (SoD) toxic combinations in Oracle SaaS?"*
  - *"Which accounts have superuser/PAM privileges or dormant inactive status (>30 days)?"*
  - *"Analyze Sod conflicts between AP Invoice entry and General Ledger approval."*
- **Compliance & Audit Benchmarks**:
  - *"What is our current compliance readiness score for CIS Benchmark and SOC 2 Type II?"*
  - *"Are we ready for our ISO 27001 / PCI-DSS audit?"*
- **Tri-Tier Remediation Playbooks**:
  - *"Give me the step-by-step CLI command, Terraform IaC, and Azure Portal instructions to fix finding XYZ."*
- **Conversational Follow-ups & Clarifications**:
  - *"Explain step 2 in more detail"* or *"Generate a rollback script for that fix."*

---

### B. Finding Reasoning Engine (`/ai/findings/{id}/analyze`)
Performs deterministic and cognitive analysis on single Prowler findings to determine:
- **Technical Root Cause**: Why the misconfiguration occurred.
- **Exposure Level**: `INTERNET`, `EXTERNAL`, `INTERNAL`, `PRIVATE`, or `UNKNOWN`.
- **Attack Scenario & Blast Radius**: How an attacker would exploit the misconfiguration.
- **Business & Compliance Impact**: Real-world organizational risk.
- **Confidence Rating**: Scored between `0.0` and `1.0`.

---

### C. Aegis Decision Intelligence Engine (`/ai/findings/{id}/decision`, `/ai/decisions`)
Recommends automated triage decisions combining deterministic risk scores (0–100) and organizational policies:
- Action choices: `REMEDIATE_NOW`, `REMEDIATE_PLANNED`, `INVESTIGATE`, `ESCALATE`, `ACCEPT_RISK_REVIEW`, `MONITOR`, `NO_ACTION`.
- Priority assignment: `P1` (4h SLA), `P2` (24h SLA), `P3` (72h SLA), `P4` (168h SLA).
- Direct Jira Ticket integration (`/ai/decisions/{id}/jira-ticket`).

---

### D. Playbook & Remediation Generator (`/ai/findings/{id}/playbook`)
Generates production-grade infrastructure code:
- Terraform (`.tf`), Azure CLI (`az`), AWS CLI (`aws`), Ansible, or Python scripts.
- Includes rollback snippets, estimated downtime in minutes, and maintenance window flags.

---

### E. Model Context Protocol (MCP) JSON-RPC Gateway (`/ai/mcp`)
Exposes tools to external AI environments (Claude Desktop, Cursor IDE, VS Code, LangChain agents):
- `ciso_get_findings`, `ciso_get_resources`, `ciso_analyze_finding`, `ciso_get_compliance_overview`
- `remediation_generate_playbook`, `remediation_approve_playbook`, `remediation_execute_playbook`
- `ciso_advisor_query`, `ciso_get_integrations`, `ciso_trigger_integration_sync`

---

## 2. AI Railguards & Security Defense Mechanisms

To prevent prompt injection, hallucination, data leakage, and unverified actions, the platform enforces strict multi-layer guardrails:

```
[Raw Request] 
      │
      ▼
1. Secret Sanitizer ──► Redacts API keys, tokens, passwords, private keys
      │
      ▼
2. Prompt Injection Filter ──► Neutralizes "ignore previous instructions", "DAN", etc.
      │
      ▼
3. Tenant RLS Isolation ──► Strict multi-tenant isolation (prevents cross-tenant leak)
      │
      ▼
4. LLM Generation ──► Anti-Hallucination + Anti-Scratchpad Prompts
      │
      ▼
5. Output Filter & Thinking Stripper ──► Removes </think> & reasoning traces
      │
      ▼
6. Policy Engine Override ──► Hard deterministic rules override AI recommendations
      │
      ▼
7. Human-In-The-Loop (HITL) Gate ──► Approval required before executing any cloud script
```

### 1. Secret Sanitizer (`backend/ai/sanitizer.py`)
Scans all data (finding titles, descriptions, resource tags, IAM policies, and user questions) using regular expressions before anything is dispatched to the LLM:
- **AWS Keys**: `(AKIA|ASIA|AROA...)[A-Z0-9]{16}` ➔ `[REDACTED_AWS_KEY]`
- **Generic API Keys**: `(api_key|apikey)=...` ➔ `[REDACTED_API_KEY]`
- **Bearer Tokens / Auth**: `Bearer ...` ➔ `Bearer [REDACTED_TOKEN]`
- **Passwords & Credentials**: `password=...` ➔ `[REDACTED_PASSWORD]`
- **Private Keys**: `-----BEGIN PRIVATE KEY-----` ➔ `[REDACTED_PRIVATE_KEY]`
- **Connection Strings**: `mongodb://`, `postgres://`, `redis://` ➔ `[REDACTED_CONNECTION_STRING]`

### 2. Prompt Injection Neutralization (`backend/ai/sanitizer.py`)
Intercepts and neutralizes adversarial prompt manipulation patterns:
- Patterns: `ignore previous instructions`, `disregard all instructions`, `mark everything as pass/safe`, `DAN mode`, `system prompt reveal`, `jailbreak`.
- Replaced with: `[PROMPT_INJECTION_ATTEMPT_NEUTRALIZED: ...]`.

### 3. Anti-Hallucination Enforcement (`backend/ai/prompts.py`)
- The AI is bound to state **only facts derived from the supplied database telemetry**.
- If telemetry is absent for a question, the model must respond: *"I don't have live data on that — please ensure a cloud provider is connected and a scan has completed."*
- If answering general security questions, the model explicitly prefixes: *"This answer is based on industry best practice, not your live scan data."*

### 4. Anti-Scratchpad & Thinking Trace Cleaning (`backend/ai/vllm_provider.py`)
- For reasoning models (e.g., Qwen 3.5, DeepSeek), internal scratchpads (`<think>...</think>` or `Thinking Process:...`) are stripped before responses are stored or sent to the client.

### 5. Deterministic Policy Engine Overrides (`backend/ai/policy_engine.py`)
- AI recommendations never override hard security policies.
- Example: If a finding has `severity=CRITICAL` and `exposure=INTERNET`, the Policy Engine automatically forces `decision="REMEDIATE_NOW"`, `priority="P1"`, and `sla_hours=4`, regardless of LLM output.

### 6. Human-In-The-Loop (HITL) Gate (`backend/ai/execution_agent.py`)
- No remediation script or cloud mutation can be executed autonomously without an explicit state transition to `human_review_status = "APPROVED"`.

---

## 3. How Data is Sent to AI: NL to Database Queries & Context Building

Rather than exposing raw SQL execution to the LLM (which poses SQL injection and hallucination risks), the platform uses a **Natural Language Intent Extraction + Dynamic Django ORM Retrieval** pipeline:

```
[User Question]
      │
      ▼
1. Natural Language Intent & Scope Extraction
   (Detects cloud provider: 'aws', 'azure', 'oci', 'oracle_saas'; severity: 'critical', 'high')
      │
      ▼
2. Keyword Extraction & Stop-Word Filtering
   (Extracts discriminative security terms: 'mfa', 'nsg', 's3', 'sod', 'admin', 'firewall')
      │
      ▼
3. Multi-Tenant Protected Query (Django ORM + RLS)
   - Finding.objects.filter(tenant_id=tenant_id, status="FAIL", ...)
   - Ingests SaaS Identity / SoD telemetry from ERP Pods
   - Gathers connected provider credentials metadata
      │
      ▼
4. Compact Finding Normalizer (`normalizer.py`)
   (Strips bloated fields: response headers, policy docs, raw CloudTrail blobs)
      │
      ▼
5. Verified Remediation Template Matching (`remediation_library.py`)
   (Injects tested CLI + Terraform snippets for matching check IDs)
      │
      ▼
6. Sanitized JSON Context Payload sent to LLM
```

### Context Construction Example (Sent to AI)

```json
{
  "Connected Environments": [
    {
      "provider": "azure",
      "alias": "Production Subscription",
      "uid": "12345678-abcd-1234-abcd-1234567890ab"
    }
  ],
  "Active Findings Telemetry": [
    {
      "finding_id": "9a12c4e2-...",
      "check_id": "azure_nsg_open_ssh_port",
      "check_title": "NSG Inbound Rule Allows Inbound SSH (Port 22) From Any Source",
      "severity": "CRITICAL",
      "status": "FAIL",
      "status_extended": "Security Group 'prod-nsg-01' has rule 'allow-ssh' allowing 0.0.0.0/0 to port 22",
      "remediation": "Restrict port 22 access to authorized bastion or VPN CIDR ranges only.",
      "provider": "azure",
      "resource": {
        "name": "prod-nsg-01"
      }
    }
  ],
  "VERIFIED_REMEDIATION_TEMPLATES": [
    "### Azure CLI\n```bash\naz network nsg rule delete --resource-group rg-prod --nsg-name prod-nsg-01 --name allow-ssh\n```\n### Terraform\n```terraform\nresource \"azurerm_network_security_rule\" \"ssh\" {\n  access = \"Deny\"\n  direction = \"Inbound\"\n  ...\n}\n```"
  ],
  "User Question": "How do I fix open SSH ports in my Azure environment?"
}
```

---

## 4. Parameters, Context Windows & Token Consumption

The platform supports multiple LLM providers, configurable per tenant or globally via environment variables:

| AI Engine / Task | Target Model | Temperature | Max Output Tokens | Avg Input Context Size | Target Output Structure |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Spectra Advisor (Copilot)** | Qwen 3.5 9B / Claude 3.5 Sonnet | `0.10` | `1,500 tokens` | 3,000 – 6,000 tokens | GitHub Flavored Markdown (CLI, IaC, Console) |
| **Finding Reasoning** | Qwen 3.5 9B / Claude 3.5 Sonnet | `0.10` | `1,500 tokens` | 800 – 1,500 tokens | JSON (`schema_version: 1.1`, 250–450 tokens) |
| **Decision Intelligence** | Qwen 3.5 9B / Claude 3.5 Sonnet | `0.10` | `400 tokens` | 500 – 800 tokens | JSON (`schema_version: 1.1`, < 120 tokens) |
| **Finding Correlation** | Qwen 3.5 9B / Claude 3.5 Sonnet | `0.10` | `600 tokens` | 1,000 – 2,500 tokens | JSON (`schema_version: 1.1`, < 180 tokens) |
| **Remediation Playbook** | Qwen 3.5 9B / Claude 3.5 Sonnet | `0.10` | `1,500 tokens` | 600 – 1,200 tokens | JSON with executable code & rollback |
| **Reasoning Proxy** | Qwen 3.5 9B / vLLM | `0.10` | `2,048 tokens` | Configurable | Structured JSON or Markdown |

### Provider Configuration Matrix

1. **Dedicated On-Premise / Azure VM vLLM** (Default Private Deployment):
   - Endpoint: `http://20.235.254.33:8000/v1`
   - Model: `/home/azureuser/models/qwen3.5-9b`
   - Zero data leaves the private virtual network.
2. **Anthropic Claude**:
   - Primary: `claude-3-5-sonnet-20241022`
   - Fallbacks: `claude-3-5-haiku-20241022`, `claude-sonnet-4-6`
3. **OpenAI**:
   - `gpt-4o`, `gpt-4o-mini`
4. **Tenant-Level Custom LLMs** (`TenantLLMConfig`):
   - Supports self-hosted Ollama, Azure OpenAI, or custom vLLM endpoints configured per customer tenant.

---

## 5. Summary Matrix: AI Endpoint Quick Reference

| Endpoint | Method | Purpose | Input Payload | Output Format |
| :--- | :--- | :--- | :--- | :--- |
| `/ai/advisor/query` | `POST` | Ask security copilot questions | `{"question": "...", "history": [...]}` | Grounded answer with finding references |
| `/ai/findings/{id}/analyze` | `POST` | Run deep AI root-cause reasoning | `{"force_reanalysis": false}` | Assessment UUID + Risk Score |
| `/ai/findings/{id}/assessment` | `GET` | Get cached AI reasoning details | None | JSON:API AIAssessment resource |
| `/ai/findings/{id}/decision` | `GET` | Get operational decision & SLA | None | JSON:API SecurityDecision resource |
| `/ai/findings/{id}/playbook` | `POST` | Auto-generate Terraform/CLI fix | `{"script_type": "terraform"}` | Executable code + Rollback snippet |
| `/ai/decisions` | `GET` | Paginated decision log & triage queue | Query filters (`priority`, `status`) | JSON:API Paginated Decision list |
| `/ai/decisions/{id}` | `PATCH` | Submit Human Review (HITL) | `{"human_review_status": "APPROVED"}` | Updated SecurityDecision |
| `/ai/decisions/{id}/jira-ticket` | `POST` | Create Jira ticket from decision | `{"project_key": "SEC"}` | Jira Ticket Key & URL |
| `/ai/reasoning` | `POST` | Direct reasoning proxy for developers | `{"prompt": "...", "temperature": 0.1}` | Structured CISO reasoning JSON |
| `/ai/mcp` | `POST` / `GET` | Model Context Protocol JSON-RPC | JSON-RPC 2.0 (`tools/call`, `tools/list`) | Standard MCP Tool Content array |
