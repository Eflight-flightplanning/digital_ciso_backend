# Digital CISO & Cloud Security Platform 

An enterprise-grade, multi-tenant Cloud Security Posture Management (CSPM) and automated **Digital CISO** platform built on **Django 5.1**, **PostgreSQL** (with Row-Level Security), **Celery**, and **Qwen 3.5 (9B)** hosted on **Azure VM with vLLM**.

---

## 🏗️ Architecture Overview

```
                      INTERNET / DEVELOPERS / FRONTEND (TanStack)
                                        │
                 Authorization: Bearer <jwt>  OR  X-API-Key: <key>
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    Django 5.1 Security API Gateway                     │
  │                                                                        │
  │   • Centralized SimpleJWT Auth & RBAC (Role-Based Access Control)      │
  │   • Multi-Tenant Isolation via PostgreSQL Row-Level Security (RLS)     │
  │   • Prowler Cloud Security Engine (AWS, Azure, GCP, Kubernetes)        │
  │   • Deterministic Risk Engine (0-100 Scoring) & Compliance Matrix      │
  │   • Automatic Secret Sanitization & Secret Masking                     │
  │   • Immutable Audit Logging (DecisionLog & Review Queue)               │
  │   • Interactive OpenAPI & Swagger UI Documentation                     │
  └───────────────────────────────┬────────────────────────────────────────┘
                                  │
                  Private Subnet / REST API (Port 8000)
                                  │
                                  ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                    Azure GPU VM (vLLM Engine)                          │
  │                    Model: Qwen 3.5 (9B)                                │
  │                 http://20.235.254.33:8000/v1                           │
  │                                                                        │
  │   • Root-Cause Threat Analysis & Attack Scenario Correlation           │
  │   • Triage Decision Formulation (FIX_NOW / ACCEPT_RISK / MUTE)         │
  │   • Automated Terraform / CLI / Ansible Playbook Generation            │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

* **Python**: 3.12+
* **PostgreSQL**: 16+ (Running on port `5433` or standard `5432`)
* **Redis / Valkey**: (Optional, port `6379` for Celery background scans)
* **Azure VM with vLLM**: Running Qwen 3.5 9B at `http://20.235.254.33:8000/v1`

---

## ⚙️ Configuration (`.env`)

The backend configuration is located at `d:\security_platform\backend\.env`:

```env
DJANGO_SETTINGS_MODULE=config.django.devel
DEBUG=True

# Database Configuration (PostgreSQL)
DJANGO_DB_HOST=localhost
DJANGO_DB_PORT=5433
DJANGO_DB_USER=postgres
DJANGO_DB_PASSWORD=postgres
DJANGO_DB_NAME=prowler_db

# Security & Encryption
SECRET_KEY=your-secret-key-in-production-1234567890
SECRETS_ENCRYPTION_KEY=ZMiYVo7m4Fbe2eXXPyrwxdJss2WSalXSv3xHBcJkPl0=

# Celery & Cache
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_TASK_ALWAYS_EAGER=True

# Digital CISO AI Configuration (vLLM Azure VM)
AI_PROVIDER=vllm
VLLM_AZURE_ENDPOINT=http://20.235.254.33:8000/v1
VLLM_AZURE_API_KEY=EMPTY
VLLM_MODEL_NAME=/home/azureuser/models/qwen3.5-9b
VLLM_TIMEOUT_SECONDS=60.0
```

---

## 🚀 How to Run the Backend

### 1. Activate the Virtual Environment

```powershell
cd d:\security_platform\backend
.\.venv\Scripts\activate
```

### 2. Run Database Migrations (One-Time / When Models Change)

```powershell
python manage.py migrate
```

### 3. Start the Django API Server

```powershell
python manage.py runserver 0.0.0.0:8000
```
> Server will be accessible at `http://localhost:8000`.

### 4. Start the Celery Worker (Optional: For Heavy Background Scans)

In a separate terminal window:
```powershell
cd d:\security_platform\backend
.\.venv\Scripts\activate
python -m celery -A config worker -l INFO -P solo
```

---

## 📖 API Documentation & Swagger UI

Once the server is running, open the interactive Swagger documentation in your browser:

| Interface | URL | Description |
| :--- | :--- | :--- |
| **Interactive Swagger UI** | **[http://localhost:8000/swagger/](http://localhost:8000/swagger/)** | Test all endpoints interactively with "Try it out" and Bearer JWT auth |
| **ReDoc Documentation** | **[http://localhost:8000/docs/](http://localhost:8000/docs/)** | Clean 3-column reference view of all schemas and endpoints |


---

## 🧪 End-to-End Testing Workflow

### Step 1: Onboard & Register Account
* **Endpoint**: `POST /api/v1/users`
* **Content-Type**: `application/vnd.api+json`

```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "users",
      "attributes": {
        "email": "ciso@myenterprise.com",
        "password": "SecurePassword@12345",
        "name": "Alex CISO",
        "company_name": "Acme Defense"
      }
    }
  }'
```

---

### Step 2: Login & Obtain Access Token
* **Endpoint**: `POST /api/v1/tokens`
* **Content-Type**: `application/json`

```bash
curl -X POST http://localhost:8000/api/v1/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ciso@myenterprise.com",
    "password": "SecurePassword@12345"
  }'
```
> Copy the returned `"access"` token. Use it as `Authorization: Bearer <TOKEN>` for all subsequent requests.

---

### Step 3: Add Cloud Provider (AWS / Azure / GCP)
* **Endpoint**: `POST /api/v1/providers`
* **Content-Type**: `application/vnd.api+json`

```bash
curl -X POST http://localhost:8000/api/v1/providers \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "providers",
      "attributes": {
        "provider": "aws",
        "uid": "123456789012",
        "alias": "Production AWS Environment"
      }
    }
  }'
```

---

### Step 4: Send Finding Telemetry to Azure VM Qwen 3.5 9B
* **Endpoint**: `POST /api/v1/ai/findings/{finding_id}/analyze`
* **Content-Type**: `application/json`

```bash
curl -X POST http://localhost:8000/api/v1/ai/findings/3e59acc5-3bdd-499e-8fd1-3e53b0a6ca47/analyze \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "force_reanalysis": true
  }'
```

**Live Response from Qwen 3.5 9B**:
```json
{
  "status": "success",
  "data": {
    "root_cause": "S3 bucket has public read access enabled via ACL.",
    "attack_scenario": "Anonymous adversary enumerates bucket and exfiltrates confidential financial records.",
    "business_impact": "Direct GDPR Article 32 & SOC 2 CC6.1 violation.",
    "risk_score": 95,
    "decision": "FIX_NOW",
    "remediation_summary": "Enable S3 Block Public Access and remove AllUsers ACL."
  }
}
```

---

### Step 5: Save Decision to Immutable Decision Log
* **Endpoint**: `POST /api/v1/review-decisions`
* **Content-Type**: `application/vnd.api+json`

```bash
curl -X POST http://localhost:8000/api/v1/review-decisions \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "review-decisions",
      "attributes": {
        "decision": "FIX_NOW",
        "rationale": "High-risk public data exposure prioritized by Qwen 3.5 9B.",
        "internal_notes": "Assigned to SecOps Cloud Team."
      }
    }
  }'
```

**Query All Audit Logs**:
```bash
curl -X GET http://localhost:8000/api/v1/decision-logs \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

---

### Step 6: Generate Executable Terraform Remediation Playbook
* **Endpoint**: `POST /api/v1/ai/findings/{finding_id}/playbook`
* **Content-Type**: `application/json`

```bash
curl -X POST http://localhost:8000/api/v1/ai/findings/3e59acc5-3bdd-499e-8fd1-3e53b0a6ca47/playbook \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "script_type": "terraform"
  }'
```

---

## 🗺️ Frontend Route to Backend API Matrix

| Frontend Route (`frontend/src/routes/`) | Component / Purpose | Backend API Endpoint |
| :--- | :--- | :--- |
| **`sign-in.tsx`** | JWT Auth & Switch Tenant | `POST /api/v1/tokens`<br>`POST /api/v1/tokens/refresh` |
| **`sign-up.tsx`** | Account Provisioning | `POST /api/v1/users` |
| **`index.tsx`** | Command Center Dashboard | `GET /api/v1/tenants`<br>`GET /api/v1/compliance-overviews` |
| **`findings.tsx`** | Findings Triage & Playbooks | `GET /api/v1/findings`<br>`GET /api/v1/remediation-playbooks` |
| **`compliance.tsx`** | Compliance Matrix (CIS, SOC 2, ISO) | `GET /api/v1/compliance-overviews` |
| **`attack-paths.tsx`**| Toxic Attack Graph & Kill-Chain | `GET /api/v1/attack-paths-scans` |
| **`scans.tsx`** | Assessment Runner & Schedules | `GET/POST /api/v1/scans`<br>`GET /api/v1/schedules` |
| **`resources.tsx`** | Multi-Cloud Inventory (AWS/Azure/GCP) | `GET /api/v1/resources` |
| **`providers.tsx`** | Cloud Connections & Secrets | `GET/POST /api/v1/providers`<br>`GET /api/v1/provider-groups` |
| **`users.tsx`** | RBAC, Roles & Team Management | `GET/POST /api/v1/users`<br>`GET /api/v1/roles` |
| **`integrations.tsx`**| Webhooks, Jira, Slack, SIEM | `GET/POST /api/v1/integrations`<br>`GET /api/v1/processors` |
| **`profile.tsx`** | User Settings & Security API Keys | `GET /api/v1/users/me`<br>`GET/POST /api/v1/api-keys` |
| **`ai/advisor.tsx`** | **Spectra**: Threat Engine & Qwen | `POST /api/v1/ai/reasoning`<br>`POST /api/v1/ai/advisor/query` |
| **`ai/decisions.tsx`**| **Aegis**: Decision Log & HITL Queue | `GET /api/v1/decision-logs`<br>`GET /api/v1/hitl-reviews` |
| **`ai/settings.tsx`** | **Phantom**: vLLM Settings | `GET/POST /api/v1/tenant-llm-configs` |
