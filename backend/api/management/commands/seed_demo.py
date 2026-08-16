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
                ("cis_aws_foundations_v2.0", "CIS AWS Foundations", "2.0.0", 0.91, 142, 14, 156),
                ("soc2_type_ii", "SOC 2 Type II", "2023", 0.88, 78, 11, 89),
                ("iso_27001_2022", "ISO 27001", "2022", 0.84, 110, 21, 131),
                ("pci_dss_v4.0", "PCI-DSS", "4.0", 0.79, 95, 25, 120),
                ("hipaa_security", "HIPAA Security Rule", "2023", 0.94, 62, 4, 66),
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
