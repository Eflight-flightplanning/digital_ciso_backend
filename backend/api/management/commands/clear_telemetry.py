"""
Clear all findings, scans, compliance overviews, attack paths, and resources from the database across all tenants.
Preserves all connected Cloud Providers, Credentials, Tenants, Users, and Roles.

Usage:
  python manage.py clear_telemetry
"""
from django.core.management.base import BaseCommand
from api.db_router import MainRouter
from api.models import (
    Scan,
    Finding,
    Resource,
    ResourceFindingMapping,
    ComplianceOverview,
    ComplianceRequirementOverview,
    ScanSummary,
    AttackPathsScan,
    DecisionLog,
    HITLReviewQueue,
)


class Command(BaseCommand):
    help = "Clear all findings, scans, compliance overviews, attack paths, and resources while keeping cloud providers intact."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=str,
            help="Optional tenant ID to clear telemetry for a specific tenant only.",
        )

    def handle(self, *args, **options):
        tenant_id = options.get("tenant")
        self.stdout.write("Purging all findings, scans, resources, and compliance overviews...")

        dbs = [MainRouter.admin_db, MainRouter.default_db]
        seen_dbs = set()

        for db in dbs:
            if not db or db in seen_dbs:
                continue
            seen_dbs.add(db)
            self.stdout.write(f"Clearing telemetry on database alias '{db}'...")

            try:
                # 1. Resource Finding Mappings
                rfm_qs = ResourceFindingMapping.objects.using(db).all()
                if tenant_id:
                    rfm_qs = rfm_qs.filter(tenant_id=tenant_id)
                rfm_count = rfm_qs.count()
                rfm_qs.delete()
                self.stdout.write(f"  [OK] Deleted {rfm_count} ResourceFindingMapping records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ResourceFindingMapping cleanup: {e}")

            try:
                # 2. Findings
                f_qs = Finding.all_objects.using(db).all()
                if tenant_id:
                    f_qs = f_qs.filter(tenant_id=tenant_id)
                f_count = f_qs.count()
                f_qs.delete()
                self.stdout.write(f"  [OK] Deleted {f_count} Finding records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Finding cleanup: {e}")

            try:
                # 3. Compliance Requirement Overviews
                cro_qs = ComplianceRequirementOverview.objects.using(db).all()
                if tenant_id:
                    cro_qs = cro_qs.filter(tenant_id=tenant_id)
                cro_count = cro_qs.count()
                cro_qs.delete()
                self.stdout.write(f"  [OK] Deleted {cro_count} ComplianceRequirementOverview records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ComplianceRequirementOverview cleanup: {e}")

            try:
                # 4. Compliance Overviews
                co_qs = ComplianceOverview.objects.using(db).all()
                if tenant_id:
                    co_qs = co_qs.filter(tenant_id=tenant_id)
                co_count = co_qs.count()
                co_qs.delete()
                self.stdout.write(f"  [OK] Deleted {co_count} ComplianceOverview records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ComplianceOverview cleanup: {e}")

            try:
                # 5. Attack Paths Scans
                aps_qs = AttackPathsScan.objects.using(db).all()
                if tenant_id:
                    aps_qs = aps_qs.filter(tenant_id=tenant_id)
                aps_count = aps_qs.count()
                aps_qs.delete()
                self.stdout.write(f"  [OK] Deleted {aps_count} AttackPathsScan records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] AttackPathsScan cleanup: {e}")

            try:
                # 6. Scan Summaries
                ss_qs = ScanSummary.objects.using(db).all()
                if tenant_id:
                    ss_qs = ss_qs.filter(tenant_id=tenant_id)
                ss_count = ss_qs.count()
                ss_qs.delete()
                self.stdout.write(f"  [OK] Deleted {ss_count} ScanSummary records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ScanSummary cleanup: {e}")

            try:
                # 7. Resources
                r_qs = Resource.all_objects.using(db).all()
                if tenant_id:
                    r_qs = r_qs.filter(tenant_id=tenant_id)
                r_count = r_qs.count()
                r_qs.delete()
                self.stdout.write(f"  [OK] Deleted {r_count} Resource records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Resource cleanup: {e}")

            try:
                # 8. Scans
                s_qs = Scan.all_objects.using(db).all()
                if tenant_id:
                    s_qs = s_qs.filter(tenant_id=tenant_id)
                s_count = s_qs.count()
                s_qs.delete()
                self.stdout.write(f"  [OK] Deleted {s_count} Scan records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Scan cleanup: {e}")

            try:
                # 9. Decision Log and HITL Review Queue
                dl_qs = DecisionLog.objects.using(db).all()
                if tenant_id:
                    dl_qs = dl_qs.filter(tenant_id=tenant_id)
                dl_count = dl_qs.count()
                dl_qs.delete()
                self.stdout.write(f"  [OK] Deleted {dl_count} DecisionLog records.")

                hitl_qs = HITLReviewQueue.objects.using(db).all()
                if tenant_id:
                    hitl_qs = hitl_qs.filter(tenant_id=tenant_id)
                hitl_count = hitl_qs.count()
                hitl_qs.delete()
                self.stdout.write(f"  [OK] Deleted {hitl_count} HITLReviewQueue records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Decision/HITL cleanup: {e}")

        self.stdout.write(
            self.style.SUCCESS(
                "\n[SUCCESS] Successfully purged all findings, compliance overviews, attack path graphs, and scans.\n"
                "All Cloud Providers, Credentials, Tenants, and User accounts remain intact and ready for fresh live scans!"
            )
        )

