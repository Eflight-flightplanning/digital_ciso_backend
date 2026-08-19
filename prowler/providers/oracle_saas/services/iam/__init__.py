"""
Oracle SaaS IAM Service
=======================
Fetches users, role assignments, and SoD (Separation of Duties) conflicts
from Oracle Fusion ERP / IDCS Identity Domain via REST API.

Checks implemented in this service:
  - erp_iam_sod_conflict_detected
  - erp_iam_superuser_role_assigned
  - erp_iam_dormant_privileged_account
  - erp_iam_implementation_role_active_post_golive
"""
from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel

from prowler.lib.logger import logger
from prowler.providers.oracle_saas.oracle_saas_provider import OracleSaasProvider

# Roles that form SoD toxic combinations in Oracle Fusion ERP Financials
# Format: (role_a, role_b, risk_description)
SOD_TOXIC_COMBINATIONS = [
    (
        "ORA_AP_ACCOUNTS_PAYABLE_MANAGER_JOB",
        "ORA_AP_PAYMENT_PROCESSING_JOB",
        "AP Manager + Payment Processor: Can create and disburse vendor payments without a second approver (SOC 1 Fraud Risk)",
    ),
    (
        "ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB",
        "ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB",
        "GL Accountant + Journal Entry Manager: Can post and approve journal entries without peer review (Financial Integrity Risk)",
    ),
    (
        "ORA_PO_BUYER_JOB",
        "ORA_AP_ACCOUNTS_PAYABLE_SPECIALIST_JOB",
        "Buyer + AP Specialist: Can raise and approve purchase orders and invoices (Procurement Fraud Risk)",
    ),
    (
        "ORA_AR_BILLING_SPECIALIST_JOB",
        "ORA_AR_CASH_APPLICATION_SPECIALIST_JOB",
        "Billing Specialist + Cash Application: Can issue invoices and apply cash receipts — enables fictitious revenue (Revenue Fraud Risk)",
    ),
    (
        "ORA_IT_SECURITY_MANAGER",
        "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
        "IT Security Manager + Implementation Consultant: Can modify security policies and configuration simultaneously (Privilege Escalation Risk)",
    ),
]

# Roles classified as superuser/privileged in Oracle Fusion ERP
SUPERUSER_ROLES = {
    "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
    "ORA_IT_SECURITY_MANAGER",
    "ORA_APPS_SUPER_USER",
    "ORA_FND_SYSTEM_ADMIN_JOB",
    "ORA_IDCS_ADMINISTRATOR",
}

# Dormant account threshold (days since last login)
DORMANT_THRESHOLD_DAYS = 90


class ErpUser(BaseModel):
    """Represents an Oracle Fusion / IDCS user."""
    id: str
    username: str
    display_name: str = ""
    email: str = ""
    active: bool = True
    mfa_enabled: bool = False
    last_login: Optional[datetime.datetime] = None
    roles: list[str] = []


class SodConflict(BaseModel):
    """Represents a Separation of Duties conflict for a specific user."""
    user_id: str
    username: str
    role_a: str
    role_b: str
    risk_description: str


class ErpIamService:
    """
    Oracle Fusion ERP IAM Service.

    Fetches users and role assignments from Oracle IDCS and Fusion ERP APIs,
    then detects security violations.
    """

    def __init__(self, provider: OracleSaasProvider):
        self.provider = provider
        self.region = "global"
        self.erp_type = provider.session.erp_type
        self.tenant_id = provider.identity.tenant_id

        self.users: list[ErpUser] = []
        self.sod_conflicts: list[SodConflict] = []

        logger.info("Oracle SaaS IAM: Loading users and roles...")
        self._load_users()
        logger.info(f"Oracle SaaS IAM: Loaded {len(self.users)} users.")
        self._detect_sod_conflicts()
        logger.info(f"Oracle SaaS IAM: Detected {len(self.sod_conflicts)} SoD conflicts.")

    def _load_users(self) -> None:
        """Fetch users and their role assignments from Oracle Fusion HCM REST API or IDCS."""
        raw_users = []

        if self.provider.session.auth_type == "basic":
            # Direct Oracle Fusion Cloud HCM REST API
            url = self.provider.get_erp_url("hcmRestApi/resources/11.13.18.05/userAccounts?limit=100&expand=userAccountRoles")
            data = self.provider.get_json(url)
            items = data.get("items", [])
            for u in items:
                uname = u.get("Username", "")
                guid = u.get("UserGUID") or uname
                suspended = u.get("Suspended") in (True, "true", "True", "Y")
                person_no = u.get("PersonNumber") or ""

                # Extract user roles dynamically from child userAccountRoles or roles list
                user_roles = []
                roles_items = u.get("userAccountRoles", {}).get("items", []) if isinstance(u.get("userAccountRoles"), dict) else []
                if not roles_items and "roles" in u and isinstance(u["roles"], list):
                    roles_items = u["roles"]
                for r in roles_items:
                    if isinstance(r, dict):
                        role_name = r.get("RoleCommonName") or r.get("RoleName") or r.get("RoleCode") or r.get("value")
                        if role_name:
                            user_roles.append(role_name)
                    elif isinstance(r, str):
                        user_roles.append(r)

                if not user_roles:
                    user_roles = ["ORA_FND_APPLICATION_USER"]

                domain = self.provider.domain_url.replace("https://", "").replace("http://", "") if self.provider.domain_url else "oraclecloud.com"
                email = u.get("Email") or f"{uname.lower()}@{domain}"

                self.users.append(ErpUser(
                    id=guid,
                    username=uname,
                    display_name=u.get("DisplayName") or uname,
                    email=email,
                    active=not suspended,
                    mfa_enabled=False,
                    last_login=None,
                    roles=user_roles,
                ))
            if self.users:
                return

        # Fallback to IDCS OAuth2 endpoint
        url = self.provider.get_idcs_url("admin/v1/Users?count=200&attributes=userName,displayName,emails,active,mfaEnabled,roles,lastLogin")
        data = self.provider.get_json(url)
        raw_users = data.get("Resources", [])

        for u in raw_users:
            roles = [r.get("value", "") for r in u.get("roles", [])]
            emails = u.get("emails", [])
            email = next((e["value"] for e in emails if e.get("primary")), "")

            last_login_str = u.get("lastLogin") or u.get("meta", {}).get("lastModified")
            last_login = None
            if last_login_str:
                try:
                    last_login = datetime.datetime.fromisoformat(
                        last_login_str.replace("Z", "+00:00")
                    )
                except Exception:
                    pass

            self.users.append(ErpUser(
                id=u.get("id", u.get("userName", "")),
                username=u.get("userName", ""),
                display_name=u.get("displayName", u.get("userName", "")),
                email=email,
                active=u.get("active", True),
                mfa_enabled=u.get("mfaEnabled", False),
                last_login=last_login,
                roles=roles,
            ))

    def _detect_sod_conflicts(self) -> None:
        """Identify SoD toxic combinations across all users."""
        for user in self.users:
            user_roles = set(user.roles)
            for role_a, role_b, risk in SOD_TOXIC_COMBINATIONS:
                if role_a in user_roles and role_b in user_roles:
                    self.sod_conflicts.append(SodConflict(
                        user_id=user.id,
                        username=user.username,
                        role_a=role_a,
                        role_b=role_b,
                        risk_description=risk,
                    ))

    @property
    def superuser_users(self) -> list[ErpUser]:
        """Return users holding any superuser/implementation role."""
        return [
            u for u in self.users
            if SUPERUSER_ROLES.intersection(set(u.roles))
        ]

    @property
    def dormant_privileged_users(self) -> list[ErpUser]:
        """Return privileged users who have not logged in for > 90 days."""
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DORMANT_THRESHOLD_DAYS)
        result = []
        for u in self.superuser_users:
            if u.last_login is None or u.last_login < cutoff:
                result.append(u)
        return result

    @property
    def implementation_role_users(self) -> list[ErpUser]:
        """Return users still holding the Implementation Consultant role post-GoLive."""
        impl_role = "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT"
        return [u for u in self.users if impl_role in u.roles and u.active]

    @property
    def no_mfa_admin_users(self) -> list[ErpUser]:
        """Return active privileged users without MFA enabled."""
        return [
            u for u in self.superuser_users
            if u.active and not u.mfa_enabled
        ]
