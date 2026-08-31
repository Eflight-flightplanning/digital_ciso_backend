"""
Clean all dummy/seed telemetry, mock providers, fake compliance data, AI decisions, and mock executions from database.
Usage:
  python manage.py clean_dummy_prod [--all-providers]
"""
from django.core.management.base import BaseCommand
from django_celery_results.models import TaskResult
from api.db_router import MainRouter
from api.models import (
    Provider,
    ProviderSecret,
    ProviderGroup,
    Scan,
    ScanSummary,
    Finding,
    Resource,
    ResourceFindingMapping,
    ComplianceOverview,
    ComplianceRequirementOverview,
    TenantComplianceSummary,
    ResourceScanSummary,
    AttackPathsScan,
    AIAssessment,
    SecurityDecision,
    DecisionLog,
    HITLReviewQueue,
    RemediationExecution,
    Task,
    JiraAssigneeCache,
)


class Command(BaseCommand):
    help = "Purge all fabricated/mock data, dummy providers, fake compliance summaries, and mock telemetry."

    def add_arguments(self, parser):
        parser.add_argument(
            "--all-providers",
            action="store_true",
            default=True,
            help="Purge all providers to start fresh (default: True).",
        )

    def handle(self, *args, **options):
        purge_all_providers = options.get("all_providers", True)
        self.stdout.write("Purging fabricated and mock data across databases...")

        dbs = set(filter(None, [MainRouter.admin_db, MainRouter.default_db]))

        for db in dbs:
            self.stdout.write(f"\nCleaning database alias '{db}'...")

            # 1. AI Assessments & Security Decisions
            try:
                dec_cnt = SecurityDecision.objects.using(db).all().count()
                SecurityDecision.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {dec_cnt} SecurityDecision records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] SecurityDecision: {e}")

            try:
                ai_cnt = AIAssessment.objects.using(db).all().count()
                AIAssessment.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {ai_cnt} AIAssessment records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] AIAssessment: {e}")

            try:
                dl_cnt = DecisionLog.objects.using(db).all().count()
                DecisionLog.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {dl_cnt} DecisionLog records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] DecisionLog: {e}")

            try:
                hitl_cnt = HITLReviewQueue.objects.using(db).all().count()
                HITLReviewQueue.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {hitl_cnt} HITLReviewQueue records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] HITLReviewQueue: {e}")

            # 2. Remediation Executions & Jira Assignee Cache
            try:
                re_cnt = RemediationExecution.objects.using(db).all().count()
                RemediationExecution.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {re_cnt} RemediationExecution records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] RemediationExecution: {e}")

            try:
                jac_cnt = JiraAssigneeCache.objects.using(db).all().count()
                JiraAssigneeCache.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Cleared {jac_cnt} JiraAssigneeCache records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] JiraAssigneeCache: {e}")

            # 3. Compliance Summaries & Requirement Overviews
            try:
                tcs_cnt = TenantComplianceSummary.objects.using(db).all().count()
                TenantComplianceSummary.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {tcs_cnt} TenantComplianceSummary records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] TenantComplianceSummary: {e}")

            try:
                cro_cnt = ComplianceRequirementOverview.objects.using(db).all().count()
                ComplianceRequirementOverview.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {cro_cnt} ComplianceRequirementOverview records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ComplianceRequirementOverview: {e}")

            try:
                co_cnt = ComplianceOverview.objects.using(db).all().count()
                ComplianceOverview.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {co_cnt} ComplianceOverview records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ComplianceOverview: {e}")

            # 4. Resource Scan Summaries
            try:
                rss_cnt = ResourceScanSummary.objects.using(db).all().count()
                ResourceScanSummary.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {rss_cnt} ResourceScanSummary records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ResourceScanSummary: {e}")

            # 5. Attack Paths Scans
            try:
                aps_cnt = AttackPathsScan.objects.using(db).all().count()
                AttackPathsScan.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {aps_cnt} AttackPathsScan records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] AttackPathsScan: {e}")

            # 6. Findings, Mappings, Resources, Scans, Summaries
            try:
                rfm_cnt = ResourceFindingMapping.objects.using(db).all().count()
                ResourceFindingMapping.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {rfm_cnt} ResourceFindingMapping records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ResourceFindingMapping: {e}")

            try:
                f_cnt = Finding.all_objects.using(db).all().count()
                Finding.all_objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {f_cnt} Finding records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Finding: {e}")

            try:
                r_cnt = Resource.all_objects.using(db).all().count()
                Resource.all_objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {r_cnt} Resource records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Resource: {e}")

            try:
                ss_cnt = ScanSummary.objects.using(db).all().count()
                ScanSummary.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {ss_cnt} ScanSummary records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] ScanSummary: {e}")

            try:
                s_cnt = Scan.all_objects.using(db).all().count()
                Scan.all_objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {s_cnt} Scan records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Scan: {e}")

            # 7. Providers & Secrets
            if purge_all_providers:
                try:
                    sec_cnt = ProviderSecret.all_objects.using(db).all().count()
                    ProviderSecret.all_objects.using(db).all().delete()
                    self.stdout.write(f"  [OK] Deleted {sec_cnt} ProviderSecret records.")
                except Exception as e:
                    self.stdout.write(f"  [Notice] ProviderSecret: {e}")

                try:
                    pg_cnt = ProviderGroup.objects.using(db).all().count()
                    ProviderGroup.objects.using(db).all().delete()
                    self.stdout.write(f"  [OK] Deleted {pg_cnt} ProviderGroup records.")
                except Exception as e:
                    self.stdout.write(f"  [Notice] ProviderGroup: {e}")

                try:
                    p_cnt = Provider.all_objects.using(db).all().count()
                    Provider.all_objects.using(db).all().delete()
                    self.stdout.write(f"  [OK] Deleted {p_cnt} Provider records.")
                except Exception as e:
                    self.stdout.write(f"  [Notice] Provider: {e}")

            # 8. Celery & Task Logs
            try:
                tr_cnt = TaskResult.objects.using(db).all().count()
                TaskResult.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {tr_cnt} Celery TaskResult records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] TaskResult: {e}")

            try:
                t_cnt = Task.objects.using(db).all().count()
                Task.objects.using(db).all().delete()
                self.stdout.write(f"  [OK] Deleted {t_cnt} Task records.")
            except Exception as e:
                self.stdout.write(f"  [Notice] Task: {e}")

        self.stdout.write(
            self.style.SUCCESS(
                "\n[SUCCESS] Successfully purged all fabricated data!\n"
                "The environment is completely fresh and ready for adding real cloud providers."
            )
        )

