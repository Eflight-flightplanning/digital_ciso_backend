# Digital CISO Platform: Complete End-to-End Technical Architecture & Walkthrough Guide

---

## Executive Summary & System Topology

The **Digital CISO Platform** is an enterprise-grade Cloud Security Posture Management (CSPM), regulatory compliance auditing, and autonomous remediation platform. It provides continuous visibility, threat correlation, and automated remediation across multi-cloud infrastructure (**AWS**, **Microsoft Azure**, **Google Cloud Platform**, **Oracle Cloud Infrastructure**) and enterprise SaaS systems (**Oracle Fusion ERP/HCM**).

```
                      ┌──────────────────────────────────────────────┐
                      │    React 19 / Vite / TanStack Start Client   │
                      │         (Tailwind CSS, SVG Visuals)          │
                      └──────────────────────┬───────────────────────┘
                                             │ HTTPS / JWT Bearer
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │             Django REST Backend              │
                      │  (/api/v1/tokens, /providers, /scans, etc.)  │
                      └───────┬──────────────┬──────────────┬────────┘
                              │              │              │
           ┌──────────────────┘              │              └──────────────────┐
           ▼                                 ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐          ┌──────────────────────┐
│  PostgreSQL Database │          │     Redis / Celery   │          │  Neo4j Graph Database│
│  (Findings, Tenancy, │          │   (Async Scan Task   │          │  (Asset Topology,    │
│   Encrypted Secrets) │          │     Orchestrator)    │          │   Attack Paths)      │
└──────────────────────┘          └──────────┬───────────┘          └──────────────────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │ Prowler Core & Cloud │
                                  │  Assessment Engine   │
                                  └──────────┬───────────┘
                                             │ Read-Only APIs
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                  [ AWS / Azure ]      [ OCI / GCP ]      [ Oracle Fusion ]
```

---

## 1. Authentication Lifecycle: From Login to Logout

### 1.1 The Sign-In Gateway (`/sign-in`)
The user authentication lifecycle is implemented in [`frontend/src/routes/sign-in.tsx`](file:///d:/security_platform/frontend/src/routes/sign-in.tsx) and managed by the state machine in [`frontend/src/lib/auth.ts`](file:///d:/security_platform/frontend/src/lib/auth.ts).

#### Authentication Sequence
1. **Primary Credential Exchange (`POST /api/v1/tokens`)**:
   ```typescript
   // frontend/src/lib/auth.ts
   const res = await fetch(`${API_BASE}/tokens`, {
     method: "POST",
     credentials: "include",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ email, password, otp: otp || "" }),
   });
   ```
2. **First-Login Password Rotation**: If the database flags `password_change_required: true`, the API issues an ephemeral `temp_token`. The UI shifts to step `"change_password"` requiring the user to invoke `POST /api/v1/tokens/first-login-password-change`.
3. **Multi-Factor Authentication (TOTP)**:
   * If MFA is enabled on the account, the server returns `{ mfa_required: true }`.
   * For initial enrollment, the backend generates a cryptographically secure Base32 secret and an `otpauth://` QR code URI:
     ```python
     # backend/api/totp.py
     import pyotp
     secret = pyotp.random_base32()
     totp = pyotp.TOTP(secret)
     qr_uri = totp.provisioning_uri(user.email, issuer_name="Digital CISO")
     ```
   * The user enters the 6-digit one-time code to complete validation.

### 1.2 JWT Token Mechanics & Session Persistence
* **Access Token**: Short-lived JWT stored in memory and synchronized to `api-client.ts`. Transmitted as `Authorization: Bearer <access_token>`.
* **Refresh Token**: Stored in `localStorage` and synchronized via an `HttpOnly`, `SameSite=Lax` cookie to guard against XSS token exfiltration.
* **Token Payload Parsing**:
  ```typescript
  // frontend/src/lib/auth.ts
  const tokenPayload = JSON.parse(window.atob(accessToken.split(".")[1]));
  const user: User = {
    id: tokenPayload.user_id,
    name: tokenPayload.name,
    email: email,
    role: tokenPayload.roles?.[0] || (tokenPayload.is_read_only ? "Read-Only Auditor" : "Member"),
    is_read_only: Boolean(tokenPayload.is_read_only),
    tenant_id: tokenPayload.tenant_id,
  };
  ```

### 1.3 Client Session Guard (`useSessionGuard`)
Every authenticated page is wrapped by the session guard in [`frontend/src/components/layout/AppShell.tsx`](file:///d:/security_platform/frontend/src/components/layout/AppShell.tsx) and [`frontend/src/routes/oracle-saas-cis.tsx`](file:///d:/security_platform/frontend/src/routes/oracle-saas-cis.tsx). It continuously verifies session integrity against `GET /api/v1/users/me`:
```typescript
// frontend/src/routes/oracle-saas-cis.tsx
const token = getAuthToken() || (await refreshAccessToken());
if (!token) return deny();
const res = await apiRequest<any>("/users/me", { method: "GET" });
if (!res?.data?.id && !res?.email) return deny();
```

### 1.4 The Logout Sequence
Triggered by `authStore.logout()` / `authStore.signOut()`:
```typescript
// frontend/src/lib/auth.ts
logout() {
  this.setUser(null, null);
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    // Server-side invalidation & clearing HttpOnly refresh cookie
    fetch(`${API_BASE}/tokens/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  }
}
```

---

## 2. Cloud Provider Onboarding & Secret Cryptography

### 2.1 The Provider Registry (`/providers`)
Located in [`frontend/src/routes/providers.tsx`](file:///d:/security_platform/frontend/src/routes/providers.tsx), the platform supports 7 provider connector types:

1. **Microsoft Azure**: Tenant ID, Client ID, Client Secret, Subscription ID.
2. **Amazon Web Services (AWS)**: IAM Role ARN with External ID (`sts:AssumeRole`) or static AWS Access/Secret Key pair.
3. **Oracle Cloud Infrastructure (OCI)**: Tenancy OCID, User OCID, API Key Fingerprint, and RSA Private Key.
4. **Oracle Fusion SaaS (ERP / HCM / SCM / NetSuite)**: ERP Base URL (`https://<pod>.fa.<region>.oraclecloud.com`), Identity Domain URL, Basic or OAuth2 API credentials.
5. **Google Cloud Platform (GCP)**: Project ID and Service Account JSON key.
6. **Kubernetes**: Cluster Name and Kubeconfig YAML.
7. **GitHub**: Organization Name and Personal Access Token (PAT).

### 2.2 Symmetric Encryption at Rest (MultiFernet)
Cloud provider secrets, private keys, and API tokens are never stored in plaintext. They are encrypted at rest using Python's `cryptography.fernet` with zero-downtime key rotation:

```python
# backend/api/crypto.py
from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings

def _build() -> MultiFernet:
    keys = [settings.SECRETS_ENCRYPTION_KEY, *getattr(settings, "SECRETS_ENCRYPTION_KEY_PREVIOUS", [])]
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])

fernet = _build()
```
* **Writes**: Encrypted using `primary_fernet()` with the current master key.
* **Reads**: Evaluated against all keys in `MultiFernet` allowing key rotation via `manage.py rotate_secrets_key` without downtime.

---

## 3. Automated Security Scanning Pipeline

### 3.1 Triggering an Assessment
Initiated via the UI modal in [`frontend/src/routes/scans.tsx`](file:///d:/security_platform/frontend/src/routes/scans.tsx) or via API:
```http
POST /api/v1/scans
Content-Type: application/json

{
  "data": {
    "type": "scans",
    "attributes": {
      "name": "Full Security & Compliance Assessment [GLOBAL] — 19/11/2026"
    },
    "relationships": {
      "provider": { "data": { "type": "providers", "id": "<provider_uuid>" } }
    }
  }
}
```

### 3.2 Asynchronous Execution Architecture
1. **Queueing**: The request is enqueued into Redis and consumed by Celery workers.
2. **Credential Decryption**: The worker fetches the encrypted secret from PostgreSQL and decrypts it in-memory via `fernet.decrypt()`.
3. **Session Initialization**:
   * *AWS*: Initializes `boto3.Session` (or assumes role with external ID).
   * *Azure*: Authenticates `ClientSecretCredential(tenant_id, client_id, client_secret)`.
   * *OCI*: Initializes `oci.config.validate_config` with RSA key.
   * *Oracle Fusion SaaS*: Initializes `OracleFusionClient` with HTTP Basic or OAuth2 bearer tokens.
4. **Prowler Engine Execution**:
   * Executes checks in parallel across IAM, Network, Storage, Database, Compute, and Audit Logging.
   * Normalizes findings into a standardized schema:
     ```json
     {
       "check_id": "azure_storage_ensure_soft_delete",
       "status": "FAIL",
       "severity": "high",
       "resource_uid": "/subscriptions/.../storageAccounts/proddata",
       "compliance": { "CIS-Azure-3.0": ["5.1.2"], "SOC2": ["CC6.1"] }
     }
     ```
5. **Completion**: Updates scan state to `completed`, calculates progress to `100%`, and triggers Attack Path graph synchronization.

---

## 4. Compare Delta Engine & Drift Detection

### 4.1 Purpose of Delta Comparison
Running repeated scans produces massive finding lists. The **Compare Delta** engine in [`frontend/src/routes/scans.tsx`](file:///d:/security_platform/frontend/src/routes/scans.tsx) (`/scans/<id>/delta`) computes the exact mathematical differential between the current scan ($N$) and the previous baseline scan ($N-1$):

$$\Delta = \text{Scan}_N - \text{Scan}_{N-1}$$

### 4.2 Key Metrics Derived
1. **Resolved / Fixed (`remediated_count`)**:
   * Checks where $\text{Status}_{N-1} = \text{FAIL}$ and $\text{Status}_N = \text{PASS}$.
   * Validates that engineering sprint fixes were effective.
2. **New Violations (`new_count`)**:
   * Checks where $\text{Status}_{N-1} \neq \text{FAIL}$ and $\text{Status}_N = \text{FAIL}$.
   * Flags immediate **configuration drift** (e.g., a newly provisioned unencrypted bucket or publicly exposed port).
3. **Compliance Gain (`compliance_gain`)**:
   * Computes the net change in overall benchmark compliance percentage:
     $$\Delta_{\text{compliance}} = \text{Score}_N - \text{Score}_{N-1}$$
4. **Remediation State Transition Checklist**:
   * Generates a verified transition checklist (e.g., `FAIL -> REMEDIATED`) for auditor sign-off.

---

## 5. Security Command Center (Dashboard & Mathematical Models)

The central analytics hub in [`frontend/src/routes/dashboard.tsx`](file:///d:/security_platform/frontend/src/routes/dashboard.tsx) reconciles live database findings into real-time visual telemetry.

### 5.1 Exact Scoring Formulas & Implementation

#### 1. Security Posture Score ($0\% - 100\%$)
Measures the overall percentage of evaluated controls that satisfy hardening baselines:
$$\text{Security Posture} = \left(\frac{\text{Passed Checks}}{\text{Total Evaluated Checks}}\right) \times 100$$

*Code Implementation:*
```typescript
// frontend/src/routes/dashboard.tsx (Lines 1282-1284)
const postureScore = totalFindingsCount > 0
  ? Math.round((totalPassCount / totalFindingsCount) * 100)
  : 0;
```

#### 2. Threat Index / Threat Score ($0 - 100$)
A composite exploitability score reflecting attacker surface area:
$$\text{Threat Score} = \min\left(100, \max\left(0, 100 - \text{Posture Score} + \text{Critical Penalty}\right)\right)$$

*Code Implementation:*
```typescript
// frontend/src/routes/dashboard.tsx (Lines 1287-1289)
const threatScore = totalFindingsCount > 0
  ? Math.min(100, Math.max(0, Math.round(100 - postureScore + (openCritical > 0 ? 8 : 0))))
  : 0;
```
* **Critical Exploitability Factor**: If any open **Critical** severity finding exists (`openCritical > 0`), a $+8$ penalty is added to represent active exploit potential.
* **Risk Classifications**:
  * $0 - 24$: **Low Risk** (Emerald)
  * $25 - 44$: **Moderate Risk** (Amber)
  * $45 - 69$: **High Risk** (Orange)
  * $70 - 100$: **Critical Exposure** (Rose)

### 5.2 Dynamic Environment Filtering
When the user selects an environment from the dropdown (e.g., `"All Cloud Environments"` vs `"Oracle SaaS"` vs `"Microsoft Azure"`):
1. **Scoped Findings**: Filters findings by `provider_id` or matching resource UIDs (`/subscriptions/` for Azure, `ocid1.` for OCI, `oraclecloud.com` for SaaS).
2. **Adaptive Radar Axes**:
   * *Azure*: `["CIS Azure", "SOC 2", "ISO 27001", "NIST 800-53", "PCI-DSS"]`
   * *Oracle SaaS*: `["CIS Oracle SaaS", "Oracle SoD", "HCM Security", "FSM Roles", "SOX 404"]`
   * *OCI*: `["CIS OCI", "NCA ECC", "SOC 2", "ISO 27001", "HIPAA"]`
3. **Sankey Flow Chart**: Proportional Bezier curve ribbons dynamically redraw their thickness to match the exact finding volume flowing into each severity level:
   ```typescript
   // frontend/src/routes/dashboard.tsx (Lines 458-482)
   const raw = order.map((o) => Math.max(MIN_H, (o.count / severityTotal) * available));
   ```

---

## 6. Multi-Cloud Attack Paths (Neo4j Graph)

Located in [`frontend/src/routes/attack-paths.tsx`](file:///d:/security_platform/frontend/src/routes/attack-paths.tsx), this engine models lateral movement risks using a Neo4j graph database.

* **Nodes**: Cloud Accounts, Identity Principals (Users, Groups, Service Principals), Compute Instances, Storage Buckets, KeyVaults.
* **Edges**: `CAN_ASSUME`, `HAS_PERMISSION`, `NETWORK_ACCESS_TO`, `MEMBER_OF`.
* **Toxic Combinations**: Detects multi-hop attack vectors that isolated scanners miss (e.g., an internet-facing VM with an attached Managed Identity that has `Contributor` access over an Azure KeyVault storing production database secrets).

---

## 7. Dual AI Security Engines: Spectra & Aegis

### 7.1 Spectra — AI Threat Analysis & Advisor (`/ai/advisor`)
* **File**: [`frontend/src/routes/ai.advisor.tsx`](file:///d:/security_platform/frontend/src/routes/ai.advisor.tsx)
* **Function**: Intelligent conversational assistant grounded in real database findings.
* **Capabilities**:
  * Users can query: *"What are our highest exploitability risks in Azure?"* or *"Explain our CIS compliance failures."*
  * Grounded reasoning: Ingests real findings JSON, scan history, and attack paths rather than generic advice.

### 7.2 Aegis — AI Decision & Remediation Core (`/ai/decisions`)
* **File**: [`frontend/src/routes/ai.decisions.tsx`](file:///d:/security_platform/frontend/src/routes/ai.decisions.tsx)
* **Function**: Generates deterministic, verified remediation packages for every failed check.
* **Remediation Package Deliverables**:
  1. **CLI Commands**: Platform-native execution commands (e.g., `az storage account update --name <account> --allow-blob-public-access false`).
  2. **Infrastructure as Code (IaC)**: Drop-in Terraform or Bicep snippets.
  3. **Console Steps**: Human-readable click paths for manual administration.
  4. **Rollback Snippets**: Reversible configuration scripts.
  5. **Jira Integration**: One-click dispatch creating an enriched Jira issue with two-way status sync (`PENDING_APPROVAL -> TICKET_CREATED -> RESOLVED`).

---

## 8. Specialized Oracle Fusion SaaS & ERP Security

### 8.1 Dedicated Full-Screen Suite (`/oracle-saas-cis`)
* **File**: [`frontend/src/routes/oracle-saas-cis.tsx`](file:///d:/security_platform/frontend/src/routes/oracle-saas-cis.tsx) and [`frontend/src/components/oracle-cis/OracleCisTab.tsx`](file:///d:/security_platform/frontend/src/components/oracle-cis/OracleCisTab.tsx)
* **Target Platforms**: Oracle Fusion Cloud (ERP, HCM, SCM, and NetSuite).

### 8.2 Audited CIS Domains
1. **Segregation of Duties (SoD)**:
   * Analyzes toxic role combinations (e.g., users holding both `AP_DISBURSEMENT_SPECIALIST` and `PO_APPROVAL_MANAGER`).
2. **Functional Setup Manager (FSM) & Privilege Sprawl**:
   * Audits assignment of superuser roles (`ORA_ASM_APPLICATION_IMPLEMENTATION_CONSULTANT_JOB`).
3. **Identity & MFA Enforcement**:
   * Inspects Oracle Cloud Identity Console password policies, token expiration, and SSO federations.
4. **Data Protection & Audit Trails**:
   * Validates audit trail logging for general ledger entries, salary modifications, and sensitive financial records under SOX 404.

---

## 9. Customer Presentation Walkthrough: CIS Benchmarks

When explaining compliance to a prospective customer or executive stakeholder, use the structured walkthrough below:

### Why CIS is the Gold Standard
1. **Objective Consensus**: Developed by consensus among thousands of global cybersecurity professionals and government defense organizations.
2. **Prescriptive & Actionable**: Unlike broad legal frameworks (e.g., HIPAA or GDPR) that describe *intent*, CIS provides the exact configuration parameter to set.
3. **Two-Tier Architecture**:
   * **Level 1 (Fundamental Cyber Hygiene)**: Critical hardening checks that carry zero application disruption risk (e.g., enforcing MFA, disabling public access to storage, enabling encryption at rest).
   * **Level 2 (Defense-in-Depth)**: Strict parameters for highly sensitive environments (e.g., dedicated customer-managed HSM keys, restricted network routing).
4. **Business Outcome**:
   * Satisfies over 80% of SOC 2, ISO 27001, and PCI-DSS technical controls automatically.
   * Directly satisfies requirements from cyber insurance underwriters to lower enterprise policy premiums.

---

## 10. Summary Matrix: Module & File Reference

| Module | Route / File | Core Responsibility |
| :--- | :--- | :--- |
| **Authentication** | [`/sign-in`](file:///d:/security_platform/frontend/src/routes/sign-in.tsx), [`auth.ts`](file:///d:/security_platform/frontend/src/lib/auth.ts) | MFA, TOTP, JWT tokens, session lifecycle |
| **Providers** | [`/providers`](file:///d:/security_platform/frontend/src/routes/providers.tsx), [`crypto.py`](file:///d:/security_platform/backend/api/crypto.py) | Connector onboardings, MultiFernet encryption |
| **Scans & Delta** | [`/scans`](file:///d:/security_platform/frontend/src/routes/scans.tsx) | Scan execution, Celery tasks, Compare Delta diff |
| **Command Center** | [`/dashboard`](file:///d:/security_platform/frontend/src/routes/dashboard.tsx) | Posture Score, Threat Index, Sankey, Radar |
| **Attack Paths** | [`/attack-paths`](file:///d:/security_platform/frontend/src/routes/attack-paths.tsx) | Neo4j multi-cloud lateral movement graph |
| **AI Advisor** | [`/ai/advisor`](file:///d:/security_platform/frontend/src/routes/ai.advisor.tsx) | Spectra LLM reasoning agent |
| **AI Remediation**| [`/ai/decisions`](file:///d:/security_platform/frontend/src/routes/ai.decisions.tsx) | Aegis CLI/IaC compiler & Jira integration |
| **Oracle SaaS** | [`/oracle-saas-cis`](file:///d:/security_platform/frontend/src/routes/oracle-saas-cis.tsx) | Dedicated CIS Oracle SaaS Foundations & SoD |
| **Reports** | [`/reports`](file:///d:/security_platform/frontend/src/routes/reports.tsx) | Scoped PDF and CSV audit exports |
