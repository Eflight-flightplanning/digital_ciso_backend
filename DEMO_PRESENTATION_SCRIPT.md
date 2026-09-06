# Digital CISO Platform — Executive Demo Script & Technical Architecture
### Aligned with the "Obsidian Command" Web Platform Design System

---

## Brand & Design System Alignment Guide
* **Design Identity:** Obsidian Command (Deep Obsidian Space `#0E1017` / Cyber Dark)
* **Primary Accent:** Electric Cyan (`#00E5FF` / `oklch(0.83 0.15 205)`)
* **Spectra AI Accent:** Electric Blue / Cyan Glow (`oklch(0.77 0.15 228)`)
* **Critical Risk Color:** Crimson Red (`#FF3D71` / `oklch(0.66 0.22 12)`)
* **Success / Compliance Color:** Emerald Green (`#00E096` / `oklch(0.83 0.19 165)`)
* **Typography:** Display: `Space Grotesk` | Body: `Inter` | Telemetry & Code: `JetBrains Mono`

---

## 1. Executive Opening & Core Value Proposition

**Presenter Screen:** Platform Landing Page (`/`) or Executive Dashboard (`/dashboard`)  
**Visual Cue:** Highlighting the live telemetry pulse indicator: `● LIVE CONTINUOUS ASSURANCE`

**Speaker Script:**
> *"Good morning / afternoon everyone. 
> When speaking to boards, audit committees, and CISOs, the question they actually care about isn't 'are we secure today at this exact second?' — it is **'are we getting safer over time, and can you prove it with continuous evidence?'**
>
> Digital CISO Service was engineered from day one to answer that exact question. 
> We are an **agentless, read-only continuous assurance platform**. Every fifteen minutes, or on your scheduled cadence, our engine inspects your multi-cloud estate (AWS, Azure, OCI, GCP) and SaaS environments (like Oracle Fusion ERP). 
>
> We automatically map every misconfiguration across **28 continuous compliance frameworks** — including ISO 27001, CIS Benchmarks, NIST CSF, DORA, NIS2, and Saudi NCA regulations — and produce signed, board-ready assurance reports every quarter.
>
> Most importantly: we do this with **zero write access, ever**. We connect using **Federated OIDC trust**, requiring no stored credentials, no permanent secret keys, and revocable by your security team in a single click directly from your cloud provider console."*

---

## 2. Platform Architecture (Plain Text Specification)

### Layer 1: Agentless Ingestion & Federated OIDC Trust
* **Connection Protocol:** OpenID Connect (OIDC) Federated Identity / Workload Identity Federation.
* **Credential Vaulting:** Zero permanent credentials stored. No static passwords or long-lived API keys. The system dynamically requests ephemeral session tokens that automatically expire within minutes.
* **Permission Scope:** Mathematically locked at the cloud provider IAM level to read-only roles: `SecurityAudit`, `Reader`, and `Describe/List`.
* **Covered Scope:** Multi-cloud infrastructure (AWS, Azure, OCI, GCP), container clusters (Kubernetes), and enterprise SaaS (Oracle Fusion Cloud ERP for Segregation of Duties and privileged user governance).

### Layer 2: Evidence Engine & Normalizer
* **Telemetry Extraction:** Collects raw configuration states (e.g., Network Security Groups, IAM Policies, S3/Bucket ACLs, Encryption flags).
* **Bloat & Secret Stripping:** The normalizer discards raw cloud logs, request headers, and customer payload data.
* **Evidence Store:** Multi-tenant PostgreSQL database protected with Row-Level Security (RLS) storing only configuration descriptors, check evaluations, and compliance mappings.
* **Zero Payload Access:** Strictly zero access to customer business databases, SQL tables, object contents, or private files.

### Layer 3: Security & Encryption Foundation
* **Data in Transit:** TLS 1.3 and mTLS across all API endpoints, cloud connectors, and AI calls with Perfect Forward Secrecy.
* **Data at Rest:** AES-256-GCM encryption with tenant-isolated database partitions and keys managed via Cloud Key Management Services (KMS) or HashiCorp Vault.
* **Multi-Tenant Isolation:** Enforced through cryptographic tenant IDs and PostgreSQL Row-Level Security (RLS), preventing cross-tenant leakage.

### Layer 4: AI Security Enclave & Multi-Stage Guardrails
* **Secret Sanitizer (`sanitizer.py`):** Pre-inference regex scanning that redacts API keys, passwords, bearer tokens, private keys, and connection strings before any data touches the LLM.
* **Prompt Injection Neutralizer:** Defuses adversarial inputs (`DAN mode`, `ignore previous instructions`, jailbreak attempts).
* **Strict Scope Construction:** Queries data via deterministic backend ORM; no open SQL access is provided to the AI.
* **Deterministic Policy Engine (`policy_engine.py`):** Rule-based security overrides AI recommendations. (Example: A Critical + Internet-exposed asset is automatically forced to P1 / 4-hour SLA regardless of model output).
* **Output Sanitizer:** Strips internal model reasoning traces (`<think>` blocks).

### Layer 5: AI Suite Capabilities
* **Spectra Security Copilot (`/ai/advisor`):** Conversational CISO advisor answering posture and compliance queries grounded strictly in live scan telemetry.
* **Finding Reasoning Engine:** Evaluates root cause, exposure level (Internet vs Private), and attack blast radius.
* **Aegis Decision Intelligence (`/ai/decisions`):** Computes risk scores (0 to 100) and operational triage actions.
* **Playbook Generator:** Generates production-ready Terraform IaC, Azure CLI, or Ansible remediation snippets with rollback steps.

### Layer 6: Human-in-the-Loop (HITL) Execution & Auditing
* **No Autonomous Cloud Mutations:** AI cannot modify or write to customer cloud environments.
* **Approval Gate:** Remediation playbooks must be explicitly approved by a human administrator (`ApprovalStatus.APPROVED`).
* **Delivery:** Approved fixes are exported to Jira / ServiceNow or dispatched into customer CI/CD pipelines.
* **Audit Trajectory:** Every finding evaluation, risk score, model inference, and decision log is permanently tracked with immutable timestamps.

---

## 3. Tough CISO & AI Due-Diligence Questions (Executive Answers)

### Question 1: "Are you training your AI models on our company data?"
> **Your Answer:**
> *"**Absolutely not.** We enforce a strict **Zero Data Retention (ZDR)** policy. 
> Telemetry sent to the AI exists in RAM only for the duration of inference and is instantly discarded. We do not use customer telemetry or prompts to train, fine-tune, or evaluate foundation models. For clients with sovereign or strict data residency mandates, we deploy self-hosted private vLLM instances inside your private virtual network with zero external internet egress."*

### Question 2: "How is the AI reading our data? Does it read our databases or customer records?"
> **Your Answer:**
> *"The AI **never connects to or reads your business databases, tables, or customer records**. 
> It reads only infrastructure configuration posture metadata — for example, 'is port 22 open on this firewall?' or 'is MFA enforced for this admin account?' It never looks at your application data or payloads."*

### Question 3: "How do you send data to the AI: Natural Language to SQL, or JSON?"
> **Your Answer:**
> *"**We do not use Natural Language to SQL.** Allowing an LLM to generate raw SQL directly against a production database introduces severe security vulnerabilities like SQL injection, hallucinated joins, and data leakage. 
> Instead, our backend extracts the user's intent, queries our pre-compiled database securely through strict, tenant-isolated ORM code, sanitizes all secrets, and passes a **compact, strongly-typed JSON context payload** into the AI model's context window."*

### Question 4: "Does the AI have direct access to our database?"
> **Your Answer:**
> *"**No.** The AI model has zero database connection strings, zero socket connections, and zero network routes to any database. 
> The AI sits behind an application gateway API. The application server validates permissions, executes the query, sanitizes the data, and supplies the model with read-only context."*

### Question 5: "How are credentials secured, and what is our cloud provider breach risk?"
> **Your Answer:**
> *"**We do not store static access keys or passwords.** We use Federated Workload Identity (OIDC). 
> When a scan runs, your cloud provider generates a temporary, short-lived session token valid for only a few minutes, restricted strictly to Read-Only policies. Even in an impossible worst-case compromise scenario, an attacker gains no persistent credentials and has zero write capabilities across your cloud."*

### Question 6: "Can the AI write or alter data in our environment?"
> **Your Answer:**
> *"**No write access, ever.** 
> The cloud trust role is mathematically locked to read-only actions. Furthermore, our Remediation Agent enforces a strict **Human-In-The-Loop (HITL)** gate. The AI can generate Terraform IaC or CLI code, but it cannot run it against your cloud. A human administrator must review and approve it, which then creates a ticket in your Jira/ServiceNow queue for your own team to execute."*

### Question 7: "What is the Trajectory part, and how is it audited?"
> **Your Answer:**
> *"Our Trajectory is our anti-black-box mechanism. Every AI recommendation includes an end-to-end audit trail:
> 1. The exact evidence evaluated (resource ID, configuration setting).
> 2. The compliance requirement it violates.
> 3. The step-by-step reasoning for the risk score.
> 4. The policy engine verification.
> 5. The user approval history and ticket reference.
> Everything is recorded in immutable audit logs (`DecisionLog`)."*

---

## 4. OCI Compliance Deep-Dive (Speaking Script for Slide 7)

**Presenter Screen:** Compliance Dashboard (`/compliance`)  
**Slide Title:** *Real controls, real numbers — traced to source, not estimated.*

**Control Inventory Breakdown (Obsidian Command Metric Cards):**
* **NCA ECC 1:2018 (Saudi KSA):** 114 Controls
* **NCA ECC 2:2024 (Saudi KSA):** 110 Controls
* **NCA CCC 2:2024 (Cloud Controls):** 15 Controls *(Tenant-scoped / CST)*
* **CIS OCI Benchmark 3.0:** 22 Controls
* **CIS OCI Benchmark 3.1:** 22 Controls

**Speaker Script:**
> *"Let's drill into our OCI and regional regulatory compliance capabilities. 
> In enterprise security, especially across Saudi Arabia and the Middle East, estimating or guessing compliance numbers is unacceptable.
>
> On this screen, you see real controls and real numbers traced directly to source documents published by the Saudi National Cybersecurity Authority (NCA) and the Center for Internet Security (CIS).
>
> Notice the 15 controls for NCA Cloud Cybersecurity Controls (CCC 2:2024). We explicitly isolate the 15 tenant-scoped controls (CST) — which are the subscriber's responsibility — from the provider-side (CSP) obligations that Oracle Cloud manages. We do not make false claims about verifying provider internals.
>
> Furthermore, every single control across NCA ECC 1:2018, ECC 2:2024, and CIS OCI is categorized into one of two transparent buckets:
> 1. **Automated Evidence:** Verified live via continuous read-only OCI API calls.
> 2. **Manual Evidence:** Documented, human-approved governance evidence uploaded by your team.
>
> Nothing is approximated. Every check links directly to verified proof."*

---

## 5. How We Score (Speaking Script for Slide 9)

**Presenter Screen:** Executive Risk Scorecard on Dashboard (`/dashboard`)  
**Slide Title:** *Two numbers. One live picture of your risk.*

**The Two Pillars:**
1. **Posture Score:** Percentage of evaluated controls currently passing. (Obsidian Emerald Green `#00E096`)
2. **Threat Score:** Inverse view of real exploitation risk. (Obsidian Crimson Red `#FF3D71`)

**Speaker Script:**
> *"A common complaint from executive leadership is dashboard fatigue — dozens of confusing dials and subjective risk ratings. We boil our continuous assessment down to two clear, objective numbers:
>
> **First, your Posture Score:**
> This represents the exact percentage of all evaluated security controls that are currently passing. It is recalculated continuously on every scan — never a stale snapshot.
>
> **Second, your Threat Score:**
> This is the inverse perspective: your active exploitation risk. As misconfigurations increase, your threat score rises. If a critical, internet-facing misconfiguration appears — such as an open database port or unauthenticated object storage — the Threat Score experiences an immediate step increase.
>
> **What triggers Critical Risk?**
> A Threat Score of 70 or above automatically places the organization in Critical Risk banding. This is mathematically driven by live findings, not someone's subjective opinion.
>
> **What counts as evidence?**
> Automated controls are validated in real time via read-only cloud APIs. Manual controls require verified, human-approved governance artifacts.
>
> **Can you see the breakdown?**
> Yes. Every score is fully auditable. You can click on any number to see the exact cloud account, the resource ID, the failing check, and the remediation path. There is zero black-box obscurity."*

---

## 6. Live Mockup Demo Flow (Step-by-Step UI Walkthrough)

### Step 1: Obsidian Executive Dashboard (`/dashboard`)
* **Show:** The dual metrics: **Posture Score (e.g., 91%)** in Emerald Green and **Threat Score (e.g., 18)** in Cyan.
* **Explain:** Live continuous pulse indicator. Recalculated automatically on every scan.

### Step 2: Compliance Scorecard (`/compliance`)
* **Show:** Cards for **NCA ECC 1:2018 (114 controls)**, **NCA ECC 2:2024 (110 controls)**, **NCA CCC 2:2024 (15 CST controls)**, and **CIS OCI 3.1**.
* **Explain:** Shows how a single resolved check automatically boosts compliance across multiple standards at once.

### Step 3: Spectra AI Security Copilot (`/ai/advisor`)
* **Action:** Open Spectra Copilot in the terminal-styled dark panel. Type:
  > *"What are our top critical findings in our OCI and Azure environments, and how do they impact our NCA compliance?"*
* **Highlight:** Point out the secret redactions (`[REDACTED_KEY]`), grounding strictly to scan telemetry, and complete absence of hallucinated facts.

### Step 4: Finding Detail & Reasoning Trajectory (`/findings`)
* **Action:** Click into an open Security Group / NSG finding.
* **Show:** 
  - Exposure: `INTERNET`
  - Attack Path & Blast Radius
  - Deterministic Policy Override: SLA locked to `P1 (4 Hours)`
* **Explain:** Demonstrates the transparent reasoning trajectory with no black box.

### Step 5: Aegis Remediation Gate & Jira Sync (`/ai/decisions`)
* **Action:** Click **"Generate Playbook"** (displays clean Terraform IaC and CLI rollback commands).
* **Highlight:** The **Human-In-The-Loop Approval Gate** (`validate_approval()` check).
* **Explain:** Show that clicking **"Approve & Create Jira Ticket"** routes the remediation task to DevOps without the AI ever taking autonomous write actions against customer cloud infrastructure.
