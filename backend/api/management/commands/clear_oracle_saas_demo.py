"""
Clear Oracle SaaS demo provider, secrets, scans, findings, and resources from the database across all tenants.
Usage:
  python manage.py clear_oracle_saas_demo
"""
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


class Command(BaseCommand):
    help = "Remove seeded Oracle SaaS demo data (providers, secrets, scans, findings, and resources)"

    def handle(self, *args, **options):
        self.stdout.write("Clearing Oracle SaaS demo data across all tenants...")

        tenants = list(Tenant.objects.all())
        if not tenants:
            self.stdout.write("No tenants found.")
            return

        total_findings_del = 0
        total_resources_del = 0
        total_providers_del = 0

        for tenant in tenants:
            with rls_transaction(str(tenant.id)):
                # 1. Delete mappings and findings
                findings_qs = Finding.objects.filter(
                    tenant=tenant,
                    uid__startswith="prowler-oracle_saas",
                )
                count_f = findings_qs.count()
                ResourceFindingMapping.objects.filter(
                    tenant=tenant,
                    finding__in=findings_qs,
                ).delete()
                findings_qs.delete()
                total_findings_del += count_f

                # 2. Delete Resources
                resources_qs = Resource.objects.filter(
                    tenant=tenant,
                    type="oracle_fusion_resource",
                )
                count_r = resources_qs.count()
                resources_qs.delete()
                total_resources_del += count_r

                # 3. Delete Provider, Secrets, and Scans
                providers_qs = Provider.objects.filter(
                    tenant=tenant,
                    provider="oracle_saas",
                )
                count_p = providers_qs.count()
                for prov in providers_qs:
                    Scan.objects.filter(tenant=tenant, provider=prov).delete()
                    ProviderSecret.objects.filter(tenant=tenant, provider=prov).delete()
                providers_qs.delete()
                total_providers_del += count_p

                self.stdout.write(
                    f"  [OK] Tenant '{tenant.name}': Cleared {count_f} findings, {count_r} resources, {count_p} demo providers."
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"[SUCCESS] Cleared Oracle SaaS demo telemetry: {total_findings_del} findings, {total_resources_del} resources, {total_providers_del} providers removed."
            )
        )
