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
    ComplianceOverview,
)

# Known dummy provider IDs and aliases from initial demo seed dump
DUMMY_IDS = [
    "84147068-56f1-49c3-bd71-f4e512c3d89e",
    "6b06b83c-edcd-4f4d-afa1-2ec9bd3d3fb3",
    "60db9295-29f5-42b4-b04d-66b6e88fcc5a",
    "ff951289-adfd-4781-87eb-46907329e895",
]

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
    "Production AWS Environment",
]


class Command(BaseCommand):
    help = "Purge all dummy seed providers, mock findings, and fake compliance data from production database."

    def handle(self, *args, **options):
        self.stdout.write("Purging dummy seed providers and mock telemetry...")

        # Select all providers
        all_provs = list(Provider.all_objects.using(MainRouter.admin_db).all())
        dummy_prov_ids = []

        for p in all_provs:
            p_id = str(p.id)
            alias = str(p.alias or "").strip()
            uid = str(p.uid or "").strip()
            prov_type = str(p.provider or "").strip()

            is_dummy = (
                p_id in DUMMY_IDS
                or uid in DUMMY_UIDS
                or alias in DUMMY_ALIASES
                or alias.startswith("acme-")
                or alias.startswith("Production AWS")
                or (prov_type in ["aws", "gcp"] and "eflight" not in alias.lower() and "digital-ciso" not in alias.lower())
            )

            # Preserve real user providers
            if "eflight" in alias.lower() or "oracle" in alias.lower() or "oracle" in prov_type.lower() or "digital-ciso" in alias.lower():
                is_dummy = False

            if is_dummy:
                dummy_prov_ids.append(p.id)

        if not dummy_prov_ids:
            self.stdout.write("  [OK] No dummy seed providers found.")
            return

        self.stdout.write(f"  [OK] Found {len(dummy_prov_ids)} dummy provider(s) to remove.")

        # Delete associated telemetry across all databases
        for db in [MainRouter.admin_db, MainRouter.default_db]:
            try:
                scans = Scan.all_objects.using(db).filter(provider_id__in=dummy_prov_ids)
                scan_ids = list(scans.values_list("id", flat=True))

                findings = Finding.all_objects.using(db).filter(scan_id__in=scan_ids)
                findings.delete()

                resources = Resource.all_objects.using(db).filter(provider_id__in=dummy_prov_ids)
                resources.delete()

                ComplianceOverview.objects.using(db).filter(scan_id__in=scan_ids).delete()
                ProviderSecret.all_objects.using(db).filter(provider_id__in=dummy_prov_ids).delete()
                scans.delete()

                Provider.all_objects.using(db).filter(id__in=dummy_prov_ids).delete()
            except Exception as e:
                self.stdout.write(f"  [Notice] Clean exception on db {db}: {e}")

        self.stdout.write(
            self.style.SUCCESS(
                f"  [OK] Purged {len(dummy_prov_ids)} dummy provider(s) and associated mock telemetry."
            )
        )
