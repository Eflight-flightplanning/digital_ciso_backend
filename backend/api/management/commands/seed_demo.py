"""
Seed demo data command for Digital CISO Platform
"""
import uuid
from datetime import datetime, timezone, timedelta
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
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

    def add_arguments(self, parser):
        parser.add_argument(
            "--i-understand-this-writes-fake-data",
            action="store_true",
            dest="confirmed",
            help="Required outside DEBUG environments — confirms you intend to insert fabricated "
            "findings/compliance data into this database.",
        )

    def handle(self, *args, **options):
        # This command writes fabricated findings, resources, and compliance scores into the
        # SAME tables real Prowler scans write to — indistinguishable from real data once
        # inserted, and previously the source of a real mis-attributed-compliance-data bug.
        # Refuse to run against a non-DEBUG (i.e. production) settings module without an
        # explicit, deliberate confirmation flag.
        if not settings.DEBUG and not options.get("confirmed"):
            raise CommandError(
                "Refusing to seed fabricated demo data: DEBUG is off, which usually means this "
                "is a production or demo-facing environment. If you really intend to insert "
                "demo data here, re-run with --i-understand-this-writes-fake-data."
            )

        self.stdout.write("Seeding Digital CISO demo data...")

        # 1. Tenant
        tenant, created = Tenant.objects.get_or_create(
            name="Pravahya Enterprise",
            defaults={"id": uuid.uuid4()}
        )
        self.stdout.write(f"  [OK] Tenant: {tenant.name} ({tenant.id})")

        # 2. Admin Users
        for user_email, user_name in [
            ("digitalciso@eflight.aero", "Digital CISO Admin"),
            ("alex.ciso@eflight.aero", "Alex CISO"),
            ("akhilesh.merugu@pravahya.com", "Akhilesh Merugu"),
        ]:
            u = User.objects.filter(email=user_email).first()
            if not u:
                u = User.objects.create_user(
                    name=user_name,
                    email=user_email,
                    password="Admin1234!",
                    company_name="Pravahya Enterprise",
                )
                self.stdout.write(f"  [OK] Created Admin user: {user_email} / Admin1234!")
            else:
                u.set_password("Admin1234!")
                u.save()
                self.stdout.write(f"  [OK] Updated Admin user password: {user_email} / Admin1234!")

            # 3. Membership
            Membership.objects.get_or_create(
                tenant=tenant,
                user=u,
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
            oracle_saas_prov, _ = Provider.objects.get_or_create(
                tenant=tenant,
                uid="acme-fusion-saas",
                provider="oracle_saas",
                defaults={"alias": "acme-fusion-saas", "connected": True}
            )
            oci_prov, _ = Provider.objects.get_or_create(
                tenant=tenant,
                uid="ocid1.tenancy.oc1..aaaaaaaademoocitenancyuid12345",
                provider="oraclecloud",
                defaults={"alias": "acme-core-oci", "connected": True}
            )
            self.stdout.write("  [OK] Cloud Providers seeded: AWS (acme-prod), Azure (acme-emea), GCP (acme-core), Oracle SaaS (acme-fusion-saas), OCI (acme-core-oci)")

            # LLM Config (Private vLLM Qwen 3.5)
            TenantLLMConfig.objects.get_or_create(
                tenant=tenant,
                provider_type="vllm_azure",
                defaults={
                    "model_name": "/home/azureuser/models/qwen3.5-9b",
                    "is_active": True,
                }
            )

            # Scans — one per provider, so each framework's demo ComplianceOverview row is
            # attached to the scan of the provider it actually claims to assess.
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
            azure_scan, _ = Scan.objects.get_or_create(
                tenant=tenant,
                provider=azure_prov,
                defaults={
                    "trigger": "manual",
                    "state": "completed",
                    "started_at": now - timedelta(hours=1),
                    "completed_at": now - timedelta(minutes=52),
                    "unique_resource_count": 1420,
                }
            )
            gcp_scan, _ = Scan.objects.get_or_create(
                tenant=tenant,
                provider=gcp_prov,
                defaults={
                    "trigger": "manual",
                    "state": "completed",
                    "started_at": now - timedelta(hours=1),
                    "completed_at": now - timedelta(minutes=52),
                    "unique_resource_count": 980,
                }
            )
            oracle_saas_scan, _ = Scan.objects.get_or_create(
                tenant=tenant,
                provider=oracle_saas_prov,
                defaults={
                    "trigger": "manual",
                    "state": "completed",
                    "started_at": now - timedelta(hours=1),
                    "completed_at": now - timedelta(minutes=52),
                    "unique_resource_count": 2509,
                }
            )
            oci_scan, _ = Scan.objects.get_or_create(
                tenant=tenant,
                provider=oci_prov,
                defaults={
                    "trigger": "manual",
                    "state": "completed",
                    "started_at": now - timedelta(hours=1),
                    "completed_at": now - timedelta(minutes=52),
                    "unique_resource_count": 1840,
                }
            )

            # Materialize full per-requirement compliance tables from Prowler templates
            from tasks.jobs.scan import create_compliance_requirements
            for demo_scan in [scan, azure_scan, gcp_scan, oracle_saas_scan, oci_scan]:
                try:
                    create_compliance_requirements(str(tenant.id), str(demo_scan.id))
                except Exception as exc:
                    self.stdout.write(f"  [WARN] Compliance requirement materialization note for {demo_scan.provider.provider}: {exc}")

            # Attack Paths Scans — Seed completed attack path graph state for cloud providers (excluding SaaS)
            from api.models import AttackPathsScan
            AttackPathsScan.objects.filter(tenant=tenant, provider__provider__iexact="oracle_saas").delete()
            for p in Provider.objects.filter(tenant=tenant).exclude(provider__iexact="oracle_saas"):
                AttackPathsScan.objects.update_or_create(
                    tenant=tenant,
                    provider=p,
                    defaults={
                        "state": "completed",
                        "started_at": now - timedelta(hours=1),
                        "completed_at": now - timedelta(minutes=50),
                        "duration": 600,
                        "sink_backend": "neo4j",
                        "is_migrated": True,
                    }
                )
            self.stdout.write("  [OK] Attack Paths Scans seeded: Completed graph state enabled for cloud providers")

            # Compliance Frameworks — Exact requirement counts from Prowler's official JSON definitions
            frameworks_data = [
                # OCI (Oracle Cloud Infrastructure) Benchmarks
                ("cis_3.1_oraclecloud", "CIS Oracle Cloud Infrastructure Foundations Benchmark", "3.1.0", 0.74, 40, 14, 54),
                ("cis_3.0_oraclecloud", "CIS Oracle Cloud Infrastructure Foundations Benchmark", "3.0.0", 0.72, 39, 15, 54),
                ("secnumcloud_3.2_oraclecloud", "SecNumCloud Oracle Cloud", "3.2", 0.85, 78, 14, 92),
                ("nca_cscc_1.2019_oraclecloud", "NCA Cloud Cybersecurity Controls (CCC/CSCC)", "2:2024", 0.94, 17, 1, 18),
                ("nca_ecc_1.2018_oraclecloud", "NCA Essential Cybersecurity Controls (ECC)", "2:2024", 0.93, 26, 2, 28),
                ("iso27001_2022_oraclecloud", "ISO/IEC 27001:2022 (ISMS)", "2022", 0.91, 10, 1, 11),
                ("pci_4.0_oraclecloud", "PCI-DSS (Payment Card Industry)", "4.0", 0.93, 13, 1, 14),
                ("hipaa_oraclecloud", "HIPAA Security Rule & HITECH", "2023", 0.91, 10, 1, 11),
                ("mitre_attack_oraclecloud", "MITRE ATT&CK Cloud Matrix", "v14.1", 0.91, 10, 1, 11),
                ("rbi_cyber_security_framework_oraclecloud", "RBI Cyber Security Framework", "2024", 0.92, 11, 1, 12),
                ("soc2_oraclecloud", "SOC 2 Type II (Trust Services Criteria)", "2024", 0.90, 9, 1, 10),
                # Oracle SaaS Benchmarks (2 Core Frameworks)
                ("cis_1.0.0_oracle_saas", "CIS Oracle SaaS Foundations Benchmark", "1.0.0", 0.92, 40, 4, 44),
                ("sod_matrix_oracle_saas", "Oracle SaaS Separation of Duties (SoD)", "2024.1", 0.88, 23, 3, 26),
                # Azure Frameworks
                ("cis_3.0_azure", "CIS Microsoft Azure Benchmark", "3.0.0", 0.86, 118, 19, 137),
                ("cis_2.0_azure", "CIS Microsoft Azure Benchmark", "2.0.0", 0.87, 104, 16, 120),
                ("soc2_azure", "SOC 2 Type II (Trust Services Criteria)", "2023", 0.92, 24, 2, 26),
                ("iso27001_2022_azure", "ISO/IEC 27001:2022 (ISMS)", "2022", 0.89, 82, 10, 92),
                ("hipaa_azure", "HIPAA Security Rule & HITECH", "2023", 0.91, 31, 3, 34),
                ("nca_ecc_1.2018_azure", "NCA Essential Cybersecurity Controls (ECC)", "2:2024", 0.89, 25, 3, 28),
                ("nca_cscc_1.2019_azure", "NCA Cloud Cybersecurity Controls (CCC/CSCC)", "2:2024", 0.89, 16, 2, 18),
                # AWS & GCP Frameworks
                ("cis_3.0_aws", "CIS AWS Foundations Benchmark", "3.0.0", 0.91, 156, 15, 171),
                ("cis_2.0_aws", "CIS AWS Foundations Benchmark", "2.0.0", 0.89, 142, 17, 159),
                ("cis_3.0_gcp", "CIS Google Cloud Platform Benchmark", "3.0.0", 0.88, 74, 10, 84),
                ("cis_1.8_k8s", "CIS Kubernetes Benchmark", "1.8.0", 0.84, 110, 20, 130),
                ("soc2_aws", "SOC 2 Type II (Trust Services Criteria)", "2023", 0.94, 98, 6, 104),
                ("iso27001_2022_aws", "ISO/IEC 27001:2022 (ISMS)", "2022", 0.90, 118, 13, 131),
                ("pci_4.0_aws", "PCI-DSS (Payment Card Industry)", "4.0.0", 0.95, 145, 7, 152),
                ("nist_csf_2.0_aws", "NIST Cybersecurity Framework (CSF)", "2.0", 0.88, 108, 14, 122),
                ("nist_800_53_revision_5_aws", "NIST SP 800-53 Security Controls", "Rev. 5", 0.82, 215, 46, 261),
                ("hipaa_aws", "HIPAA Security Rule & HITECH", "2023", 0.94, 72, 4, 76),
                ("aws_foundational_security_best_practices_aws", "AWS Foundational Security Best Practices (FSBP)", "1.0", 0.89, 220, 27, 247),
                ("dora_2022_2554", "Digital Operational Resilience Act (DORA)", "EU 2022/2554", 0.89, 64, 8, 72),
                ("nis2_aws", "NIS2 Cybersecurity Directive", "EU 2022/2555", 0.88, 76, 10, 86),
                ("csa_ccm_4.0", "Cloud Security Alliance CCM", "4.0.0", 0.91, 195, 19, 214),
            ]
            for fid, fname, fver, prate, passed, failed, total in frameworks_data:
                if fid.endswith("_k8s"):
                    # No Kubernetes provider is seeded in this demo dataset — skip rather
                    # than attach a Kubernetes framework to a cloud provider's scan.
                    continue
                if fid.endswith("_azure"):
                    target_scan = azure_scan
                elif fid.endswith("_gcp"):
                    target_scan = gcp_scan
                elif fid.endswith("_oracle_saas"):
                    target_scan = oracle_saas_scan
                elif fid.endswith("_oraclecloud"):
                    target_scan = oci_scan
                else:
                    target_scan = scan
                ComplianceOverview.objects.update_or_create(
                    tenant=tenant,
                    compliance_id=fid,
                    scan=target_scan,
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
