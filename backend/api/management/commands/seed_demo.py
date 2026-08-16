"""
Seed demo data command for Digital CISO Platform
"""
import uuid
from datetime import datetime, timezone, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction

from api.rls import Tenant
from api.db_utils import rls_transaction
from api.models import (
    User,
    Membership,
    Provider,
    Scan,
    Finding,
    Resource,
    ComplianceOverview,
    DecisionLog,
    HITLReviewQueue,
    TenantLLMConfig,
    StatusChoices,
)


class Command(BaseCommand):
    help = "Seed demo data for Digital CISO (Tenant, User, Providers, Scans, Findings, Decisions)"

    def handle(self, *args, **options):
        self.stdout.write("Seeding Digital CISO demo data...")

        # 1. Tenant
        tenant, created = Tenant.objects.get_or_create(
            name="Acme Corp",
            defaults={"id": uuid.uuid4()}
        )
        self.stdout.write(f"  [OK] Tenant: {tenant.name} ({tenant.id})")

        # 2. Demo User
        user = User.objects.filter(email="admin@acme.io").first()
        if not user:
            user = User.objects.create_user(
                name="Nadia Harding",
                email="admin@acme.io",
                password="Admin1234!",
                company_name="Acme Corp",
            )
            self.stdout.write("  [OK] Created Demo Admin user: admin@acme.io / Admin1234!")
        else:
            user.set_password("Admin1234!")
            user.save()
            self.stdout.write("  [OK] Updated Demo Admin user password: admin@acme.io / Admin1234!")

        # 3. Membership
        Membership.objects.get_or_create(
            tenant=tenant,
            user=user,
            defaults={"role": Membership.RoleChoices.OWNER}
        )

        # 4. RLS-protected records
        with rls_transaction(str(tenant.id)):
            # Providers
            aws_prov, _ = Provider.objects.get_or_create(
                tenant=tenant,
                uid="123456789012",
                provider="aws",
                defaults={"alias": "acme-prod", "connected": True}
            )
            azure_prov, _ = Provider.objects.get_or_create(
                tenant=tenant,
                uid="9d5543c7-14eb-4a67-b50a-86c075fbd182",
                provider="azure",
                defaults={"alias": "acme-emea", "connected": True}
            )
            gcp_prov, _ = Provider.objects.get_or_create(
                tenant=tenant,
                uid="acme-core-gcp",
                provider="gcp",
                defaults={"alias": "acme-core", "connected": True}
            )
            self.stdout.write("  [OK] Cloud Providers seeded: AWS (acme-prod), Azure (acme-emea), GCP (acme-core)")

            # LLM Config
            TenantLLMConfig.objects.get_or_create(
                tenant=tenant,
                provider_type="claude",
                defaults={
                    "model_name": "claude-sonnet-4-6",
                    "is_active": True,
                }
            )

            # Scans
            now = datetime.now(timezone.utc)
            scan, _ = Scan.objects.get_or_create(
                tenant=tenant,
                provider=aws_prov,
                defaults={
                    "trigger": "manual",
                    "state": "completed",
                    "started_at": now - timedelta(hours=1),
                    "completed_at": now - timedelta(minutes=52),
                    "unique_resource_count": 3120,
                }
            )

            # Compliance Frameworks
            frameworks_data = [
                ("cis_3.0_aws", "CIS AWS Foundations Benchmark", "3.0.0", 0.91, 156, 15, 171),
                ("cis_2.0_aws", "CIS AWS Foundations Benchmark", "2.0.0", 0.89, 142, 17, 159),
                ("cis_3.0_azure", "CIS Microsoft Azure Benchmark", "3.0.0", 0.87, 134, 20, 154),
                ("cis_3.0_gcp", "CIS Google Cloud Platform Benchmark", "3.0.0", 0.88, 112, 15, 127),
                ("cis_1.8_k8s", "CIS Kubernetes Benchmark", "1.8.0", 0.84, 98, 18, 116),
                ("soc2_aws", "SOC 2 Type II (Trust Services Criteria)", "2023", 0.94, 98, 6, 104),
                ("iso27001_2022_aws", "ISO/IEC 27001:2022 (ISMS)", "2022", 0.90, 118, 13, 131),
                ("iso27001_2013_aws", "ISO/IEC 27001:2013", "2013", 0.92, 114, 9, 123),
                ("pci_4.0_aws", "PCI-DSS (Payment Card Industry)", "4.0.0", 0.95, 145, 7, 152),
                ("pci_3.2.1_aws", "PCI-DSS", "3.2.1", 0.96, 138, 5, 143),
                ("nist_csf_2.0_aws", "NIST Cybersecurity Framework (CSF)", "2.0", 0.88, 108, 14, 122),
                ("nist_csf_1.1_aws", "NIST Cybersecurity Framework (CSF)", "1.1", 0.90, 95, 11, 106),
                ("nist_800_53_revision_5_aws", "NIST SP 800-53 Security Controls", "Rev. 5", 0.82, 215, 46, 261),
                ("nist_800_171_revision_2_aws", "NIST SP 800-171 Protecting CUI", "Rev. 2", 0.86, 110, 17, 127),
                ("hipaa_aws", "HIPAA Security Rule & HITECH", "2023", 0.94, 72, 4, 76),
                ("aws_foundational_security_best_practices_aws", "AWS Foundational Security Best Practices (FSBP)", "1.0", 0.89, 220, 27, 247),
                ("aws_well_architected_framework_security_pillar_aws", "AWS Well-Architected Security Pillar", "2024", 0.91, 165, 15, 180),
                ("mitre_attack_aws", "MITRE ATT&CK Cloud Matrix", "14.1", 0.85, 140, 24, 164),
                ("gdpr_aws", "EU General Data Protection Regulation (GDPR)", "2018", 0.93, 58, 4, 62),
                ("fedramp_moderate_revision_4_aws", "FedRAMP Moderate Baseline", "Rev. 4", 0.81, 180, 42, 222),
                ("fedramp_low_revision_4_aws", "FedRAMP Low Baseline", "Rev. 4", 0.92, 85, 7, 92),
                ("dora_2022_2554", "Digital Operational Resilience Act (DORA)", "EU 2022/2554", 0.89, 64, 8, 72),
                ("nis2_aws", "NIS2 Cybersecurity Directive", "EU 2022/2555", 0.88, 76, 10, 86),
                ("csa_ccm_4.0", "Cloud Security Alliance CCM", "4.0.0", 0.91, 195, 19, 214),
                ("cisa_aws", "CISA Cloud Security Technical Reference Architecture", "2.0", 0.92, 88, 7, 95),
                ("ens_rd2022_aws", "Esquema Nacional de Seguridad (ENS)", "RD 311/2022", 0.87, 120, 17, 137),
                ("ffiec_aws", "FFIEC Cybersecurity Assessment Tool", "2023", 0.90, 78, 8, 86),
                ("rbi_cyber_security_framework_aws", "RBI Cyber Security Framework", "2023", 0.93, 52, 4, 56),
            ]
            for fid, fname, fver, prate, passed, failed, total in frameworks_data:
                ComplianceOverview.objects.update_or_create(
                    tenant=tenant,
                    compliance_id=fid,
                    scan=scan,
                    defaults={
                        "framework": fid,
                        "description": fname,
                        "version": fver,
                        "requirements_passed": passed,
                        "requirements_failed": failed,
                        "total_requirements": total,
                    }
                )
            self.stdout.write("  [OK] Compliance overviews seeded (CIS, SOC 2, ISO 27001, PCI-DSS, HIPAA)")



            # Resources
            r1, _ = Resource.objects.get_or_create(
                tenant=tenant,
                uid="arn:aws:s3:::prod-billing-exports",
                defaults={
                    "name": "prod-billing-exports",
                    "type": "aws_s3_bucket",
                    "region": "us-east-1",
                    "provider": aws_prov,
                    "failed_findings_count": 2,
                }
            )
            r2, _ = Resource.objects.get_or_create(
                tenant=tenant,
                uid="arn:aws:iam::123456789012:role/ci-deployer",
                defaults={
                    "name": "ci-deployer",
                    "type": "aws_iam_role",
                    "region": "global",
                    "provider": aws_prov,
                    "failed_findings_count": 1,
                }
            )

            # Findings
            f1, _ = Finding.objects.get_or_create(
                tenant=tenant,
                uid="FND-40281",
                defaults={
                    "check_id": "s3_bucket_acl_prohibits_public_read_access",
                    "severity": "critical",
                    "impact": "critical",
                    "status": StatusChoices.FAIL,
                    "scan": scan,
                    "check_metadata": {
                        "CheckTitle": "S3 bucket allows public read access via ACL",
                        "Remediation": {"Recommendation": {"Text": "Block public ACLs on bucket prod-billing-exports and enable S3 Block Public Access."}}
                    },
                    "first_seen_at": now - timedelta(days=2),
                }
            )
            f2, _ = Finding.objects.get_or_create(
                tenant=tenant,
                uid="FND-40277",
                defaults={
                    "check_id": "iam_role_administrator_access_wildcard",
                    "severity": "critical",
                    "impact": "critical",
                    "status": StatusChoices.FAIL,
                    "scan": scan,
                    "check_metadata": {
                        "CheckTitle": "IAM role AdministratorAccess assumable by any principal",
                        "Remediation": {"Recommendation": {"Text": "Scope trust relationship policy to restrict sts:AssumeRole strictly to specific CI identity pools."}}
                    },
                    "first_seen_at": now - timedelta(days=1),
                }
            )
            f3, _ = Finding.objects.get_or_create(
                tenant=tenant,
                uid="FND-40266",
                defaults={
                    "check_id": "ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_3389",
                    "severity": "high",
                    "impact": "high",
                    "status": StatusChoices.FAIL,
                    "scan": scan,
                    "check_metadata": {
                        "CheckTitle": "Security group exposes RDP (3389) to 0.0.0.0/0",
                        "Remediation": {"Recommendation": {"Text": "Remove ingress rule granting 0.0.0.0/0 access to TCP port 3389 in security group sg-0d81ba91f2c7."}}
                    },
                    "first_seen_at": now - timedelta(days=3),
                }
            )
            self.stdout.write("  [OK] Security findings seeded (FND-40281, FND-40277, FND-40266)")

            review, _ = HITLReviewQueue.objects.get_or_create(
                tenant=tenant,
                finding=f1,
                defaults={
                    "scan": scan,
                    "status": HITLReviewQueue.StatusChoices.PENDING,
                    "review_mode": HITLReviewQueue.ReviewModeChoices.STANDARD,
                }
            )

            # Decision Logs
            dlog, _ = DecisionLog.objects.get_or_create(
                tenant_id=tenant.id,
                finding_check_id="s3_bucket_acl_prohibits_public_read_access",
                defaults={
                    "severity": "critical",
                    "decision": "Remediate ACL",
                    "rationale_summary": "Direct internet exposure to customer billing export repository",
                    "review_id": review.id,
                }
            )
            self.stdout.write("  [OK] Decision log & HITL review queue seeded")

        self.stdout.write(self.style.SUCCESS("OK Digital CISO demo data seeding complete!"))
