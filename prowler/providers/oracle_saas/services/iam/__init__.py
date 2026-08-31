"""
Oracle SaaS IAM Service
=======================
Fetches users, role assignments, and SoD (Separation of Duties) conflicts
from Oracle Fusion ERP / IDCS Identity Domain via REST API.

Checks implemented in this service:
  - iam_sod_conflict_detected
  - iam_superuser_role_assigned
  - iam_dormant_privileged_account
  - iam_implementation_role_active
  - iam_mfa_not_enforced_admin
"""
from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel

from prowler.lib.logger import logger
from prowler.providers.oracle_saas.oracle_saas_provider import OracleSaasProvider

# Comprehensive 27 SoD Toxic Combinations for Oracle Fusion Cloud ERP
# Format: (role_a, role_b, risk_description)
SOD_TOXIC_COMBINATIONS = [
    # 1. Procure-to-Pay (P2P)
    (
        "ORA_AP_ACCOUNTS_PAYABLE_MANAGER_JOB",
        "ORA_AP_PAYMENT_PROCESSING_JOB",
        "AP Manager + Payment Processor: Can create and disburse vendor payments without a second approver (P2P Fraud Risk)",
    ),
    (
        "ORA_PO_BUYER_JOB",
        "ORA_AP_ACCOUNTS_PAYABLE_SPECIALIST_JOB",
        "Buyer + AP Specialist: Can raise POs and approve vendor invoices (Fictitious Invoicing Risk)",
    ),
    (
        "ORA_PO_SUPPLIER_ADMINISTRATOR_JOB",
        "ORA_AP_PAYMENT_PROCESSING_JOB",
        "Supplier Administrator + Payment Processor: Can create vendor bank details and disburse payments (Vendor Fraud Risk)",
    ),
    (
        "ORA_POR_PURCHASE_REQUISITION_SPECIALIST",
        "ORA_PO_PURCHASE_ORDER_APPROVER",
        "Requisitioner + PO Approver: Can request and self-approve purchase orders without managerial authorization",
    ),
    (
        "ORA_INV_WAREHOUSE_RECEIVING_SPECIALIST",
        "ORA_AP_ACCOUNTS_PAYABLE_SPECIALIST_JOB",
        "Goods Receipt Entry + AP Specialist: Can confirm fictitious goods receipt and process invoices",
    ),
    (
        "ORA_PO_SUPPLIER_ADMINISTRATOR_JOB",
        "ORA_AP_DISBURSEMENT_APPROVER_JOB",
        "Supplier Administrator + Disbursement Approver: Can alter remittance accounts and approve EFT payment batches",
    ),

    # 2. Record-to-Report (R2R)
    (
        "ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB",
        "ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB",
        "GL Accountant + Journal Entry Manager: Can post and approve journal entries without independent peer review",
    ),
    (
        "ORA_GL_CHART_OF_ACCOUNTS_ADMINISTRATOR",
        "ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB",
        "Chart of Accounts Admin + GL Accountant: Can create ledger accounts and post unauthorized financial transactions",
    ),
    (
        "ORA_GL_PERIOD_CLOSE_ADMINISTRATOR",
        "ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB",
        "Period Close Admin + Journal Creator: Can open historical financial periods and insert unapproved back-dated journals",
    ),
    (
        "ORA_FUN_INTERCOMPANY_ACCOUNTANT",
        "ORA_FUN_INTERCOMPANY_APPROVER",
        "Intercompany Accountant + Approver: Can initiate and approve intercompany balancing transactions without dual control",
    ),
    (
        "ORA_GL_FINANCIAL_REPORT_DESIGNER",
        "ORA_GL_POSTING_RULE_ADMINISTRATOR",
        "Report Designer + Posting Administrator: Can alter posting rules and suppress discrepancies in reporting",
    ),

    # 3. Order-to-Cash (O2C)
    (
        "ORA_AR_BILLING_SPECIALIST_JOB",
        "ORA_AR_CASH_APPLICATION_SPECIALIST_JOB",
        "Billing Specialist + Cash Application: Can issue invoices and apply cash receipts — enables revenue lapping fraud",
    ),
    (
        "ORA_AR_CUSTOMER_ADMINISTRATOR",
        "ORA_AR_CREDIT_RISK_MANAGER",
        "Customer Admin + Credit Manager: Can create customer accounts and unilaterally grant excessive credit limits",
    ),
    (
        "ORA_AR_CREDIT_MEMO_SPECIALIST",
        "ORA_AR_RECEIVABLES_MANAGER_JOB",
        "Credit Memo Creator + AR Manager: Can generate credit memos and write off customer receivable balances",
    ),
    (
        "ORA_FOM_SALES_ORDER_ENTRY_SPECIALIST",
        "ORA_WSH_SHIPPING_FULFILLMENT_SPECIALIST",
        "Sales Order Entry + Shipping Specialist: Can create fictitious orders and confirm stock dispatch without fulfillment review",
    ),
    (
        "ORA_AR_DIRECT_DEBIT_MANDATE_SPECIALIST",
        "ORA_AR_AUTOMATIC_RECEIPTS_PROCESSOR",
        "Direct Debit Setup + Automatic Receipt Processor: Can enter bank mandates and trigger unauthorized direct debits",
    ),

    # 4. Fixed Assets & Inventory (FA / SCM)
    (
        "ORA_FA_FIXED_ASSET_ACCOUNTANT_JOB",
        "ORA_FA_ASSET_RETIREMENT_SPECIALIST",
        "Asset Accountant + Retirement Specialist: Can add capital assets and write off assets without dual verification",
    ),
    (
        "ORA_INV_STOCK_COUNT_RECORDING_SPECIALIST",
        "ORA_INV_STOCK_ADJUSTMENT_APPROVER",
        "Stock Counter + Adjustment Approver: Can record inventory counts and approve stock write-downs (Inventory Shrinkage Risk)",
    ),
    (
        "ORA_CST_COST_ACCOUNTANT_JOB",
        "ORA_CST_INVENTORY_REVALUATION_SPECIALIST",
        "Cost Accountant + Revaluation Specialist: Can define standard costs and execute unapproved inventory revaluations",
    ),

    # 5. Hire-to-Retire (H2R / HCM)
    (
        "ORA_HR_HUMAN_RESOURCE_SPECIALIST_JOB",
        "ORA_PAY_PAYROLL_MANAGER_JOB",
        "HR Specialist + Payroll Manager: Can create fictitious employees and disburse payroll compensation (Ghost Employee Risk)",
    ),
    (
        "ORA_HXT_TIME_AND_LABOR_APPROVER",
        "ORA_PAY_PAYROLL_EXECUTION_SPECIALIST",
        "Time & Labor Approver + Payroll Operator: Can approve contractor hours and execute automated payroll runs",
    ),
    (
        "ORA_PER_EMPLOYEE_BANK_ACCOUNT_SPECIALIST",
        "ORA_PAY_PAYROLL_PAYMENT_FILE_PROCESSOR",
        "Employee Bank Admin + Payment File Processor: Can alter employee direct deposit bank details and disburse salary files",
    ),

    # 6. Security & System Administration (SEC)
    (
        "ORA_IT_SECURITY_MANAGER",
        "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
        "IT Security Manager + Implementation Consultant: Holds simultaneous super-privileges and security management post-go-live",
    ),
    (
        "ORA_FND_SYSTEM_ADMIN_JOB",
        "ORA_AP_ACCOUNTS_PAYABLE_MANAGER_JOB",
        "System Administrator + AP Manager: Combines IT administrative provisioning with financial execution duties",
    ),
    (
        "ORA_IDCS_ADMINISTRATOR",
        "ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB",
        "Identity Domain Admin + GL Accountant: Can grant self-elevated privileges to alter ledger journals",
    ),
    (
        "ORA_FND_AUDIT_ADMINISTRATOR",
        "ORA_IT_SECURITY_MANAGER",
        "Audit Policy Admin + Security Manager: Can alter audit tracking policies while modifying user security contexts",
    ),
    (
        "ORA_FND_INTEGRATION_DEVELOPER",
        "ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB",
        "Integration Developer + Journal Manager: Can build automated REST interfaces and execute unvetted financial postings",
    ),
]

# Roles classified as superuser/privileged in Oracle Fusion ERP
SUPERUSER_ROLES = {
    "ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT",
    "ORA_IT_SECURITY_MANAGER",
    "ORA_APPS_SUPER_USER",
    "ORA_FND_SYSTEM_ADMIN_JOB",
    "ORA_IDCS_ADMINISTRATOR",
    "ORA_FND_INTEGRATION_SPECIALIST",
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
        # True only if a real per-user MFA/last-login source was actually reached
        # (the IDCS SCIM Users endpoint). The Fusion HCM REST API path does not
        # expose either field at all — checks that depend on them must not treat
        # "field defaulted to False/None" as a genuine negative finding.
        self.identity_detail_available = False

        logger.info("Oracle SaaS IAM: Loading users and roles...")
        self._load_users()
        logger.info(f"Oracle SaaS IAM: Loaded {len(self.users)} users.")
        self._detect_sod_conflicts()
        logger.info(f"Oracle SaaS IAM: Detected {len(self.sod_conflicts)} SoD conflicts.")

    def _load_users(self) -> None:
        """Fetch users and their role assignments from Oracle Fusion HCM REST API or IDCS."""
        if self.provider.session.auth_type == "basic":
            # Direct Oracle Fusion Cloud HCM REST API
            url = self.provider.get_erp_url("hcmRestApi/resources/11.13.18.05/userAccounts?limit=100&expand=userAccountRoles")
            data = self.provider.get_json(url)
            items = data.get("items", [])
            for u in items:
                uname = u.get("Username", "")
                uid = str(u.get("UserAccountId", uname))
                dname = u.get("DisplayName", uname)
                active = u.get("ActiveFlag", True)
                raw_roles = u.get("userAccountRoles", [])
                # The real HCM REST API returns this as {"items": [...]} on some
                # Fusion releases and as a bare list on others — handle both shapes.
                roles_data = raw_roles.get("items", []) if isinstance(raw_roles, dict) else raw_roles
                user_roles = [r.get("RoleCommonName", "") for r in roles_data if isinstance(r, dict) and r.get("RoleCommonName")]

                self.users.append(ErpUser(
                    id=uid,
                    username=uname,
                    display_name=dname,
                    email=u.get("EmailAddress", ""),
                    active=active,
                    mfa_enabled=False,
                    last_login=None,
                    roles=user_roles,
                ))
            if self.users:
                # Populated from the Fusion HCM REST API, which has no MFA/last-login
                # fields — identity_detail_available stays False so the checks that
                # need those fields report "cannot determine" instead of a false FAIL.
                return

        # Fallback to IDCS OAuth2 endpoint
        url = self.provider.get_idcs_url("admin/v1/Users?count=200&attributes=userName,displayName,emails,active,mfaEnabled,roles,lastLogin")
        data, ok = self.provider.get_json_with_status(url)
        raw_users = data.get("Resources", [])
        # A successful call with zero users is still a real, trustworthy answer
        # (empty tenant); a failed call is not — only the former should let the
        # MFA/dormant-account checks assert a real PASS or FAIL.
        self.identity_detail_available = ok

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
            if not u.mfa_enabled and u.active
        ]
