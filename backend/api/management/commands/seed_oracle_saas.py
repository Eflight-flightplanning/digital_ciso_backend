"""
Seed Oracle SaaS / Fusion ERP findings and provider into Digital CISO database across all tenants.
Usage:
  python manage.py seed_oracle_saas
"""
import uuid
from datetime import datetime, timezone, timedelta
from django.core.management.base import BaseCommand

from api.rls import Tenant
from api.db_utils import rls_transaction
from api.models import (
    Provider,
    ProviderSecret,
    Scan,
    Finding,
    Resource,
    ResourceFindingMapping,
)

ERP_FINDINGS_DATA = [
    {
        "check_id": "erp_iam_sod_conflict_detected",
        "title": "Oracle Fusion ERP Separation of Duties (SoD) conflict: AP Manager + Payment Disburser",
        "severity": "critical",
        "status": "FAIL",
        "status_extended": "SoD Conflict detected for user 'sarah.connor': Roles 'ORA_AP_ACCOUNTS_PAYABLE_MANAGER_JOB' and 'ORA_AP_PAYMENT_PROCESSING_JOB' are held simultaneously. Risk: AP Manager + Payment Processor can create and disburse vendor payments without second-person authorization (SOC 1 Fraud Risk).",
        "service": "iam",
        "resource_name": "sarah.connor (AP Manager)",
        "resource_id": "user_sc_88219",
        "remediation": "Navigate to Oracle Fusion ERP > Security Console > Users. Remove ORA_AP_PAYMENT_PROCESSING_JOB role from sarah.connor or implement a compensating dual-authorization approval workflow in Financials.",
    },
    {
        "check_id": "erp_iam_sod_conflict_detected",
        "title": "Oracle Fusion ERP Separation of Duties (SoD) conflict: GL Accountant + Journal Entry Approver",
        "severity": "critical",
        "status": "FAIL",
        "status_extended": "SoD Conflict detected for user 'david.ross': Roles 'ORA_GL_GENERAL_LEDGER_ACCOUNTANT_JOB' and 'ORA_GL_JOURNAL_ENTRY_MANAGEMENT_JOB' held concurrently. User can create, post, and approve manual journal entries without independent verification.",
        "service": "iam",
        "resource_name": "david.ross (Senior GL Accountant)",
        "resource_id": "user_dr_40192",
        "remediation": "Enforce Separation of Duties by revoking Journal Entry Management privilege from GL Accountant role.",
    },
    {
        "check_id": "erp_iam_implementation_role_active",
        "title": "Oracle Fusion ERP Application Implementation Consultant role active post-go-live",
        "severity": "critical",
        "status": "FAIL",
        "status_extended": "User 'oracle_impl_consultant' still holds 'ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT' in production environment (Go-live occurred 142 days ago). This role grants unrestricted access to all ERP configurations and data.",
        "service": "iam",
        "resource_name": "oracle_impl_consultant",
        "resource_id": "user_impl_001",
        "remediation": "Revoke ORA_FND_APPLICATION_IMPLEMENTATION_CONSULTANT from all production users. Implementation roles must not exist in live production tenants.",
    },
    {
        "check_id": "erp_iam_superuser_role_assigned",
        "title": "Oracle Fusion ERP superuser role assigned to non-admin user",
        "severity": "critical",
        "status": "FAIL",
        "status_extended": "User 'finance_lead_ext' assigned 'ORA_APPS_SUPER_USER' role without documented change management approval or expiration date.",
        "service": "iam",
        "resource_name": "finance_lead_ext (External Contractor)",
        "resource_id": "user_fle_99012",
        "remediation": "Remove ORA_APPS_SUPER_USER from contractor account. Use role-based least privilege principles.",
    },
    {
        "check_id": "erp_iam_mfa_not_enforced_admin",
        "title": "MFA not enforced for Oracle Identity Domain ERP Finance Admin group",
        "severity": "high",
        "status": "FAIL",
        "status_extended": "Oracle IDCS sign-on policy 'ERP_Finance_Admins' does not require multi-factor authentication for interactive logins outside corporate CIDR ranges.",
        "service": "iam",
        "resource_name": "ERP_Finance_Admins (IDCS Sign-On Policy)",
        "resource_id": "policy_sop_finance_admin",
        "remediation": "Edit IDCS Sign-On Policy 'ERP_Finance_Admins' > Set MFA Requirement to 'Prompt for MFA on every session'.",
    },
    {
        "check_id": "erp_audit_trail_disabled",
        "title": "Oracle Fusion ERP Audit Trail disabled for Journal Entries and Supplier Bank Accounts",
        "severity": "high",
        "status": "FAIL",
        "status_extended": "Audit policy inspection indicates business objects 'JournalEntries' and 'SupplierBankAccounts' have audit level set to 'None'. Tamper-proof audit retention is not active.",
        "service": "audit",
        "resource_name": "Oracle ERP Audit Policy Configuration",
        "resource_id": "fscm_audit_policy_01",
        "remediation": "Navigate to ERP Setup & Maintenance > Manage Audit Policies > Set Oracle Fusion Financials audit level to 'Auditing' for Journal Entries and Supplier Bank Accounts.",
    },
    {
        "check_id": "erp_oauth_app_excessive_scopes",
        "title": "Oracle IDCS OAuth Confidential Application has excessive admin scopes",
        "severity": "high",
        "status": "FAIL",
        "status_extended": "Confidential Application 'Legacy_Payroll_Sync' is granted 'urn:opc:idm:__myscopes__' (All scopes) instead of read-only payroll data scopes.",
        "service": "network",
        "resource_name": "Legacy_Payroll_Sync (OAuth App)",
        "resource_id": "oauth_client_c9284fa0",
        "remediation": "Navigate to IDCS > Applications > Legacy_Payroll_Sync > Client Configuration. Replace full scope with specific least-privilege API scopes.",
    },
    {
        "check_id": "erp_ip_allowlist_not_configured",
        "title": "Oracle Fusion ERP network perimeter allowlist not configured",
        "severity": "medium",
        "status": "FAIL",
        "status_extended": "Oracle ERP endpoint is publicly accessible from 0.0.0.0/0 without Network Access Control List restrictions to corporate egress IPs.",
        "service": "network",
        "resource_name": "Oracle Fusion Network ACL",
        "resource_id": "net_acl_fusion_01",
        "remediation": "Configure Network Access Control Lists in Oracle Cloud Console to restrict access to trusted corporate VPN CIDR blocks.",
    },
    {
        "check_id": "erp_iam_dormant_privileged_user",
        "title": "Dormant ERP user with Accounts Payable privileges inactive > 90 days",
        "severity": "medium",
        "status": "FAIL",
        "status_extended": "User 'rachel.clark' (AP Specialist) has not logged in for 114 days but retains active accounts payable creation privileges.",
        "service": "iam",
        "resource_name": "rachel.clark (AP Specialist)",
        "resource_id": "user_rc_3391",
        "remediation": "Perform user access review and deactivate dormant account in Oracle Identity Domain.",
    },
    {
        "check_id": "erp_iam_superuser_role_assigned",
        "title": "IT Security Manager role properly audited and governed",
        "severity": "informational",
        "status": "PASS",
        "status_extended": "Role 'ORA_IT_SECURITY_MANAGER' is assigned to 2 authorized security officers with active MFA and quarterly access review sign-off.",
        "service": "iam",
        "resource_name": "Security Administration Team",
        "resource_id": "sec_team_audit_01",
        "remediation": "Maintain periodic quarterly reviews.",
    },
]

class Command(BaseCommand):
    help = "Seed Oracle SaaS / Fusion ERP provider and findings for Digital CISO across all tenants"

    def handle(self, *args, **options):
        self.stdout.write("Seeding Oracle SaaS / Fusion ERP telemetry across all tenants...")

        tenants = list(Tenant.objects.all())
        if not tenants:
            tenant, _ = Tenant.objects.get_or_create(
                name="Enterprise Security Tenant",
                defaults={"id": uuid.uuid4()}
            )
            tenants = [tenant]

        for tenant in tenants:
            with rls_transaction(str(tenant.id)):
                # 1. Oracle SaaS Provider
                saas_uid = "fa-etar-dev13-saasfademo1.ds-fa.oraclepdemos.com"
                provider, created = Provider.objects.get_or_create(
                    tenant=tenant,
                    uid=saas_uid,
                    defaults={
                        "provider": "oracle_saas",
                        "alias": "Oracle Fusion Cloud ERP & HCM",
                        "connected": True,
                    }
                )
                if not created and (provider.provider != "oracle_saas" or provider.alias != "Oracle Fusion Cloud ERP & HCM"):
                    provider.provider = "oracle_saas"
                    provider.alias = "Oracle Fusion Cloud ERP & HCM"
                    provider.connected = True
                    provider.save()

                self.stdout.write(f"  [OK] Tenant '{tenant.name}' -> Provider: {provider.alias} ({provider.uid})")

                # 2. Provider Secret
                secret, _ = ProviderSecret.objects.get_or_create(
                    tenant=tenant,
                    provider=provider,
                    defaults={
                        "secret_type": ProviderSecret.TypeChoices.STATIC,
                        "secret": {
                            "auth_mode": "BASIC_AUTH",
                            "erp_base_url": "https://fa-etar-dev13-saasfademo1.ds-fa.oraclepdemos.com",
                            "username": "ciso_auditor",
                            "password": "••••••••••••",
                            "erp_type": "FUSION_ERP",
                        }
                    }
                )

                # 3. Scan
                now = datetime.now(timezone.utc)
                scan, _ = Scan.objects.get_or_create(
                    tenant=tenant,
                    provider=provider,
                    defaults={
                        "trigger": "manual",
                        "state": "completed",
                        "progress": 100,
                        "completed_at": now,
                    }
                )

                # 4. Resources and Findings
                for idx, item in enumerate(ERP_FINDINGS_DATA):
                    res_uid = f"oracle-saas://{saas_uid}/{item['resource_id']}"
                    res, _ = Resource.objects.get_or_create(
                        tenant=tenant,
                        uid=res_uid,
                        defaults={
                            "name": item["resource_name"],
                            "type": "oracle_fusion_resource",
                            "region": "global",
                            "provider": provider,
                            "failed_findings_count": 1 if item["status"] == "FAIL" else 0,
                        }
                    )

                    finding_uid = f"prowler-oracle_saas-{item['check_id']}-{item['resource_id']}-{tenant.id}"
                    finding, _ = Finding.objects.update_or_create(
                        tenant=tenant,
                        uid=finding_uid,
                        defaults={
                            "scan": scan,
                            "check_id": item["check_id"],
                            "status": item["status"],
                            "status_extended": item["status_extended"],
                            "severity": item["severity"],
                            "impact": item["severity"],
                            "check_metadata": {
                                "CheckTitle": item["title"],
                                "ServiceName": item["service"],
                                "Provider": "oracle_saas",
                                "ResourceId": item["resource_id"],
                                "ResourceName": item["resource_name"],
                                "Remediation": {
                                    "Recommendation": {"Text": item["remediation"]}
                                },
                            },
                            "raw_result": {
                                "service": item["service"],
                                "resource_name": item["resource_name"],
                                "remediation": item["remediation"],
                                "check_title": item["title"],
                                "sox_control": "ITGC-AC-01 / SOC 1 Type 2 ICFR",
                            }
                        }
                    )
                    ResourceFindingMapping.objects.get_or_create(
                        tenant=tenant,
                        resource=res,
                        finding=finding,
                    )

        self.stdout.write(self.style.SUCCESS("[SUCCESS] Successfully seeded Oracle SaaS provider across all tenants!"))
