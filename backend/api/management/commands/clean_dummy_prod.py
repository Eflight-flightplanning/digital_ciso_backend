"""
Clean all dummy/seed telemetry, mock providers, and dummy compliance data from production database.
Usage:
  python manage.py clean_dummy_prod
"""
from django.core.management.base import BaseCommand
from api.db_router import MainRouter
from api.models import (
    Provider,
    ProviderSecret,
    Scan,
    Finding,
    Resource,
    ResourceFindingMapping,
    ComplianceOverview,
    DecisionLog,
    HITLReviewQueue,
)

DUMMY_UIDS = [
    "123456789012",
    "9d5543c7-14eb-4a67-b50a-86c075fbd182",
    "acme-core-gcp",
]

DUMMY_ALIASES = [
    "acme-prod",
    "acme-emea",
    "acme-core",
    "acme-dev",
    "test.ciso",
]


class Command(BaseCommand):
    help = "Purge all dummy seed providers, mock findings, and fake compliance data from production database."

    def handle(self, *args, **options):
        self.stdout.write("Purging dummy seed providers and mock telemetry...")

        # Find dummy providers
        dummy_providers = Provider.all_objects.using(MainRouter.admin_db).filter(
            uid__in=DUMMY_UIDS
        ) | Provider.all_objects.using(MainRouter.admin_db).filter(
            alias__in=DUMMY_ALIASES
        ) | Provider.all_objects.using(MainRouter.admin_db).filter(
            alias__startswith="acme-"
        )

        dummy_provider_ids = list(dummy_providers.values_list("id", flat=True))

        if not dummy_provider_ids:
            self.stdout.write("  [OK] No dummy seed providers found.")
            return

        self.stdout.write(f"  [OK] Found {len(dummy_provider_ids)} dummy provider(s) to remove.")

        # Delete associated telemetry
        scans = Scan.all_objects.using(MainRouter.admin_db).filter(provider_id__in=dummy_provider_ids)
        scan_ids = list(scans.values_list("id", flat=True))

        findings = Finding.all_objects.using(MainRouter.admin_db).filter(scan_id__in=scan_ids)
        finding_count = findings.count()
        findings.delete()

        resources = Resource.all_objects.using(MainRouter.admin_db).filter(provider_id__in=dummy_provider_ids)
        resource_count = resources.count()
        resources.delete()

        ComplianceOverview.objects.using(MainRouter.admin_db).filter(scan_id__in=scan_ids).delete()
        ProviderSecret.all_objects.using(MainRouter.admin_db).filter(provider_id__in=dummy_provider_ids).delete()
        scans.delete()

        dummy_providers.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"  [OK] Purged {len(dummy_provider_ids)} dummy provider(s), {finding_count} mock findings, and {resource_count} resources."
            )
        )
