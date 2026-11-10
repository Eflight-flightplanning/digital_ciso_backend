"""Create every client's storage folder and save copies of reports from tests that already finished.

Safe to run again: reports that are already saved are left alone.
"""
import hashlib

from django.core.management.base import BaseCommand, CommandError

from api import client_reports
from api.client_storage import get_storage
from api.db_router import MainRouter
from api.models import Scan, Tenant
from api.tenant_scope import tenant_scope
from nca.models import NcaAssessment
from oracle_cis.models import OcisRun


class Command(BaseCommand):
    help = "Save report copies for finished tests into each client's own folder."

    def handle(self, *args, **opts):
        storage = get_storage()
        failures = 0
        for tenant in Tenant.objects.using(MainRouter.admin_db).all():
            storage.create_client(tenant.id)
            saved = {(r["kind"], r["run_id"]) for r in client_reports.list_reports(tenant.id)}
            count = 0
            with tenant_scope(tenant.id):
                for a in NcaAssessment.objects.filter(tenant_id=tenant.id, status="completed"):
                    if ("nca", str(a.id)) not in saved:
                        failures += not client_reports.save_assessment(a)
                        count += 1
                for run in OcisRun.objects.filter(tenant_id=tenant.id, status=OcisRun.FINISHED):
                    if ("oracle", str(run.id)) not in saved:
                        failures += not client_reports.save_oracle_run(run)
                        count += 1
                for scan in Scan.objects.filter(tenant_id=tenant.id, state="completed"):
                    if ("scan", str(scan.id)) not in saved:
                        failures += not client_reports.save_scan(tenant.id, scan.id)
                        count += 1
                recorded = self.record_existing(storage, tenant.id)
            self.stdout.write(f"{tenant.id}: saved {count} new test(s), recorded {recorded} existing file(s)")
        if failures:
            raise CommandError(f"{failures} report(s) could not be saved. See the log.")

    @staticmethod
    def record_existing(storage, tenant_id) -> int:
        """Files saved before the database kept file records."""
        from client_store.models import ClientFile

        known = set(ClientFile.objects.filter(tenant_id=tenant_id).values_list("key", flat=True))
        added = 0
        for key, size in storage.list_files(tenant_id, client_reports.FOLDER):
            if key not in known:
                with storage.open(tenant_id, key) as saved:
                    digest = hashlib.sha256(saved.read()).hexdigest()
                client_reports.record_file(tenant_id, key, name=key.rsplit("/", 1)[1], size=size, sha256=digest,
                                           category=client_reports.FOLDER)
                added += 1
        return added
