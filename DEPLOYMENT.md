# Digital CISO Platform — Production Deployment & Operations Guide

This document contains the complete, step-by-step production deployment guide for the **Digital CISO Platform** on **Microsoft Azure**, including **Azure Database for PostgreSQL Flexible Server (SSL)**, **Private vLLM LLM Inference Engine**, **Django Backend (Gunicorn + Systemd)**, **TanStack Start (React 19) Frontend (Node.js + Systemd)**, **Nginx Reverse Proxy**, and **Oracle Fusion Cloud SaaS SCIM Integration**.

---

## 🏛️ 1. Architecture Topology

```
                       [ HTTPS Client / Browser ]
                                   │
                                   ▼ (Port 443 / SSL)
                      [ Nginx Reverse Proxy ]
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
[ TanStack Start SSR ]                              [ Django API / AI Engine ]
  Node.js (Port 3000)                                 Gunicorn (Port 8000)
  systemd: digital_ciso_frontend                       systemd: digital_ciso
                                                             │
         ┌───────────────────────────────────────────────────┼────────────────────────┬──────────────────────┐
         ▼                                                   ▼                        ▼                      ▼
[ Azure PostgreSQL Flexible ]                      [ Azure Private vLLM ]    [ Oracle Fusion SaaS ]   [ Neo4j Enterprise ]
  Private DNS / SSL Required                         Private VNet (Port 8000)   SCIM 2.0 REST API       Attack Paths graph
  Multi-Tenant / 279 Findings                        Qwen 2.5 Security Model    Dormant PAM Remediation  Bolt (7687) / systemd: neo4j
```

---

## 🗄️ 2. Azure PostgreSQL Flexible Server Setup

### 2.1 Server Configuration
1. **Network**: Azure Private Endpoint / VNet Integration.
2. **Server Parameters (Azure Portal)**:
   - Navigate to **Azure Database for PostgreSQL Flexible Server $\rightarrow$ Server parameters**.
   - Search for `azure.extensions` and enable:
     ```
     HSTORE, UUID-OSSP, PGCRYPTO, BTREE_GIST
     ```
   - Save and wait for configuration to apply.

### 2.2 SSL Encryption Requirement
Azure Flexible Server mandates SSL (`sslmode=require`).

In [`backend/config/django/devel.py`](file:///d:/security_platform/backend/config/django/devel.py):
```python
ssl_mode = os.environ.get("POSTGRES_SSLMODE", "require")
DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.environ.get("POSTGRES_DB", "digital_ciso"),
        "USER": os.environ.get("POSTGRES_USER", "digitalciso"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "digitalciso.postgres.database.azure.com"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "OPTIONS": {
            "sslmode": ssl_mode,
        },
    },
}
```

### 2.3 Database Initialization & Restore
```bash
# 1. Connect to PostgreSQL
PGPASSWORD="<YOUR_PASSWORD>" psql -h digitalciso.postgres.database.azure.com -U digitalciso -d digital_ciso -p 5432 "sslmode=require"

# 2. Restore production dump (includes 279 findings, 3 providers, multi-tenant fleet)
PGPASSWORD="<YOUR_PASSWORD>" psql -h digitalciso.postgres.database.azure.com -U digitalciso -d digital_ciso -p 5432 "sslmode=require" < /opt/security_platform/db_backup.sql

# 3. Run Django migrations
cd /opt/security_platform/backend
source .venv/bin/activate
python manage.py migrate
```

---

## ⚙️ 3. Environment Variables Configuration (`/opt/security_platform/backend/.env`)

```ini
# Django & Server Core
DJANGO_SETTINGS_MODULE=config.django.devel
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=production-secret-key-change-in-prod-xyz123!
DJANGO_ALLOWED_HOSTS=*
CSRF_TRUSTED_ORIGINS=https://demo-digitalciso.centralindia.cloudapp.azure.com,http://localhost:3000,http://127.0.0.1:8000

# Azure Flexible PostgreSQL (SSL Mode Require)
POSTGRES_HOST=digitalciso.postgres.database.azure.com
POSTGRES_PORT=5432
POSTGRES_DB=digital_ciso
POSTGRES_USER=digitalciso
POSTGRES_PASSWORD="<YOUR_COMPLEX_PASSWORD_IN_QUOTES>"
POSTGRES_ADMIN_USER=digitalciso
POSTGRES_ADMIN_PASSWORD="<YOUR_COMPLEX_PASSWORD_IN_QUOTES>"
POSTGRES_SSLMODE=require

# Spectra AI Engine & Private vLLM Inference
AI_PROVIDER=vllm_azure
VLLM_AZURE_ENDPOINT_URL=http://<YOUR_PRIVATE_VLLM_IP>:8000/v1
VLLM_AZURE_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct
VLLM_AZURE_API_KEY=EMPTY

# Oracle Fusion Cloud SaaS Integration
ORACLE_FUSION_POD_URL=https://fa-etar-dev13-saasfademo1.ds-fa.oraclepdemos.com
ORACLE_FUSION_USERNAME=CURTIS.FEITTY
ORACLE_FUSION_PASSWORD="<ORACLE_POD_PASSWORD>"

# Jira Cloud Integration
JIRA_BASE_URL=https://pravahya1.atlassian.net
JIRA_USER_EMAIL=alex.ciso@eflight.aero
JIRA_API_TOKEN=<JIRA_API_TOKEN>
JIRA_DEFAULT_PROJECT=SEC

# Neo4j (Attack Paths graph — see Section 8.5 for install)
NEO4J_HOST=127.0.0.1
NEO4J_PORT=7687
NEO4J_USER=neo4j
NEO4J_PASSWORD="<YOUR_COMPLEX_PASSWORD_IN_QUOTES>"
ATTACK_PATHS_SINK_DATABASE=neo4j
```

---

## 🐍 4. Backend Systemd Service (`digital_ciso.service`)

Create the Gunicorn service unit at `/etc/systemd/system/digital_ciso.service`:

```ini
[Unit]
Description=Digital CISO Django Gunicorn Application Server
After=network.target

[Service]
User=azureuser
Group=azureuser
WorkingDirectory=/opt/security_platform/backend
Environment="PATH=/opt/security_platform/backend/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
EnvironmentFile=/opt/security_platform/backend/.env
ExecStart=/opt/security_platform/backend/.venv/bin/gunicorn \
    --workers 4 \
    --timeout 120 \
    --bind 127.0.0.1:8000 \
    config.wsgi:application
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Enable & Start Backend:
```bash
sudo systemctl daemon-reload
sudo systemctl enable digital_ciso
sudo systemctl start digital_ciso
sudo systemctl status digital_ciso
```

---

## ⚛️ 5. Frontend Node.js Systemd Service (`digital_ciso_frontend.service`)

### 5.1 Build TanStack Start for Standalone Node.js:
```bash
cd /opt/security_platform/frontend
export NITRO_PRESET=node-server
npm install
npm run build
```

### 5.2 Create Systemd Unit at `/etc/systemd/system/digital_ciso_frontend.service`:
```ini
[Unit]
Description=Digital CISO Frontend TanStack Start SSR Server
After=network.target

[Service]
Type=simple
User=azureuser
Group=azureuser
WorkingDirectory=/opt/security_platform/frontend
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/security_platform/frontend/.output/server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Enable & Start Frontend:
```bash
sudo systemctl daemon-reload
sudo systemctl enable digital_ciso_frontend
sudo systemctl start digital_ciso_frontend
sudo systemctl status digital_ciso_frontend
```

---

## 🌐 6. Nginx Reverse Proxy Configuration

Create or update `/etc/nginx/sites-available/digital_ciso`:

```nginx
# HTTP -> HTTPS Redirect
server {
    listen 80;
    server_name demo-digitalciso.centralindia.cloudapp.azure.com;

    return 301 https://$host$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name demo-digitalciso.centralindia.cloudapp.azure.com;

    # Let's Encrypt TLS/SSL Certificates
    ssl_certificate /etc/letsencrypt/live/demo-digitalciso.centralindia.cloudapp.azure.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/demo-digitalciso.centralindia.cloudapp.azure.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    # 1. TanStack Start SSR Frontend (Node.js Server on Port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }

    # 2. Django REST API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 180s;
    }

    # 3. Spectra AI Copilot & Streaming Inference
    location /ai/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    # 4. Django Admin & Static / Media Assets
    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /static/ {
        alias /opt/security_platform/backend/staticfiles/;
    }

    location /media/ {
        alias /opt/security_platform/backend/media/;
    }
}
```

### Enable Nginx Site:
```bash
sudo ln -sf /etc/nginx/sites-available/digital_ciso /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🤖 7. Spectra AI Copilot & Private vLLM Setup

1. **Inference Architecture**:
   - vLLM runs inside an Azure Private Virtual Network listening on `http://<VLLM_PRIVATE_IP>:8000/v1`.
   - Django invokes the live model using [`backend/ai/vllm_provider.py`](file:///d:/security_platform/backend/ai/vllm_provider.py) and [`backend/ai/prompts.py`](file:///d:/security_platform/backend/ai/prompts.py).
2. **Guardrails & Structured Remediation**:
   - Prompts include `COMMON_GUARDRAILS` (anti-prompt injection).
   - Answers include Executive Summary, Root Cause & Telemetry, Actionable Remediation (CLI, Terraform IaC, Console Guide), and Verification mapped to CIS / SOC 2 / SOX.

---

## ☁️ 8. Oracle Fusion SaaS SCIM Direct Remediation

1. **Discovery**:
   - Ingests accounts from scheduled ESS job reports or `GET /hcmRestApi/scim/Users`.
2. **SCIM User Revocation**:
   - When **Direct Remediate** is clicked, backend executes:
     ```http
     PATCH https://<pod-name>.oraclecloud.com/hcmRestApi/scim/Users/{GUID}
     Content-Type: application/scim+json
     Authorization: Basic <pod_credentials>

     {
       "schemas": ["urn:scim:schemas:core:2.0:User"],
       "active": false
     }
     ```
3. **Verification**:
   - `GET /hcmRestApi/scim/Users/{GUID}` returns `"active": false`.
   - UI reflects **`Suspended`** and audit tag **`SCIM Revoked`**.

---

## 🕸️ 9. Neo4j Enterprise Installation (Attack Paths Graph)

Attack Paths requires **Neo4j Enterprise** specifically — Community Edition does not
support `CREATE DATABASE` (multi-database), which this platform relies on for
per-scan staging databases and per-tenant sink databases. Enterprise Edition is
free to run under Neo4j's license for this kind of use; no purchased license is
required to start it, only accepting the license agreement via an environment
variable at install/start time.

### 9.1 Install via apt (Ubuntu/Debian)

```bash
# 1. Add Neo4j's package signing key and repository
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/neo4j.gpg
echo 'deb https://debian.neo4j.com stable latest' | sudo tee /etc/apt/sources.list.d/neo4j.list
sudo apt-get update

# 2. Install Neo4j Enterprise, accepting the license non-interactively
sudo NEO4J_ACCEPT_LICENSE_AGREEMENT=yes apt-get install -y neo4j-enterprise

# 3. Set the initial password (must happen before first start)
sudo neo4j-admin dbms set-initial-password '<YOUR_COMPLEX_PASSWORD_IN_QUOTES>'

# 4. Enable and start as a systemd service
sudo systemctl enable neo4j
sudo systemctl start neo4j
sudo systemctl status neo4j
```

### 9.2 Network configuration

By default Neo4j only binds to `localhost`. Since this platform's backend runs on
the same host (per the topology above), the default is correct and no public
exposure of Bolt (7687) or HTTP (7474) is needed — do **not** open these ports on
the VM's network security group. If the backend and Neo4j ever run on separate
hosts, use a private VNet connection, not a public listener.

### 9.3 Verify

```bash
cypher-shell -u neo4j -p '<YOUR_COMPLEX_PASSWORD_IN_QUOTES>' "CREATE DATABASE verify_install; SHOW DATABASES; DROP DATABASE verify_install;"
```

If `CREATE DATABASE` fails with `Unsupported administration command`, the
`neo4j-enterprise` package didn't install correctly (Community was installed
instead) — check `apt list --installed | grep neo4j`.

### 9.4 Required post-install patch — do not skip

The pip-installed `cartography` library (which drives the real graph ingestion for
AWS/Azure/OCI) has two real bugs against the exact dependency versions this
project pins: a stale Azure SDK import (`SubscriptionClient` moved from
`azure-mgmt-resource` to `azure-mgmt-subscription` in the SDK versions this
project uses) and calls to Neo4j driver methods removed in `neo4j>=6.2.0`
(`write_transaction`/`read_transaction`, renamed to `execute_write`/`execute_read`).
These patches live in site-packages, not in this repo, so they are **wiped out by
every `uv sync`**. Run this after every dependency install or update, including
first deploy:

```bash
cd /opt/security_platform/backend
source .venv/bin/activate
python manage.py patch_cartography
```

It's idempotent — safe to run every time, reports "Already patched" if there's
nothing to do. Add it to CI/deploy scripts right after `uv sync`, not as a manual
step someone has to remember.

**Do not** reintroduce a local `backend/cartography/` package for any reason —
a stub package under that exact name previously shadowed the real installed
library for this entire project's history, silently breaking Attack Paths for
every provider from day one. If `cartography.intel.aws.RESOURCE_FUNCTIONS` (or
similarly `.intel.azure`, `.intel.oci`) ever fails to import or comes back empty,
check `python -c "import cartography; print(cartography.__file__)"` resolves into
`site-packages`, not into this repo.

---

## 🛠️ 10. Day-2 Operations & Maintenance Runbook

### Updating Code from Git:
```bash
cd /opt/security_platform
git pull origin main

# If backend dependencies changed
cd /opt/security_platform/backend
source .venv/bin/activate
uv sync
python manage.py patch_cartography  # required every time uv sync runs — see Section 9.4
python manage.py migrate

# Restart Backend
sudo systemctl restart digital_ciso

# Rebuild Frontend
cd /opt/security_platform/frontend
NITRO_PRESET=node-server npm run build
sudo systemctl restart digital_ciso_frontend
```

### Viewing Live Logs:
```bash
# Backend Django / Gunicorn logs
sudo journalctl -u digital_ciso -f -n 100

# Frontend Node.js logs
sudo journalctl -u digital_ciso_frontend -f -n 100

# Nginx Access / Error logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Health Check Commands:
```bash
# Check Backend API
curl -s http://127.0.0.1:8000/api/v1/health | jq .

# Check Frontend
curl -I http://127.0.0.1:3000

# Check AI Provider Connectivity
curl -s http://127.0.0.1:8000/ai/v1/health | jq .
```
