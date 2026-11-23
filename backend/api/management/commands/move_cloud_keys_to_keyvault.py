"""Move cloud keys that are still encrypted in the database into the cloud-keys Key Vault.

  python manage.py move_cloud_keys_to_keyvault --dry-run    report only
  python manage.py move_cloud_keys_to_keyvault              move them

Needs CLOUD_KEYS_BACKEND=azure_keyvault and CLOUD_KEYS_VAULT_URL. Each secret is written to Key
Vault first and read back; only then is the database row changed to the reference, so a failure
part-way leaves every row readable. Safe to run again: rows already moved are skipped. Values are
never printed.
"""
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api import cloud_keys_vault
from api.db_router import MainRouter
from api.crypto import fernet
from api.models import ProviderSecret


class Command(BaseCommand):
    help = "Move cloud keys from the database into Azure Key Vault."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report only; change nothing.")

    def handle(self, *args, **options):
        if not cloud_keys_vault.enabled():
            raise CommandError("Set CLOUD_KEYS_BACKEND=azure_keyvault and CLOUD_KEYS_VAULT_URL first.")
        dry = options["dry_run"]
        alias = MainRouter.admin_db
        counts = {"moved": 0, "already": 0, "failed": 0}
        for row in ProviderSecret.all_objects.using(alias).all().iterator():
            raw = row._raw_secret()
            if cloud_keys_vault.name_from_reference(raw):
                counts["already"] += 1
                continue
            name = cloud_keys_vault.secret_name(row.id)
            try:
                value = json.loads(fernet.decrypt(raw).decode())
                if not dry:
                    cloud_keys_vault.put(name, value)
                    if cloud_keys_vault.get(name) != value:
                        raise RuntimeError("read-back did not match")
                    with transaction.atomic(using=alias):
                        ProviderSecret.all_objects.using(alias).filter(pk=row.pk).update(
                            _secret=cloud_keys_vault.reference(row.id))
                counts["moved"] += 1
            except Exception as e:  # noqa: BLE001 - report and carry on; the row is unchanged
                counts["failed"] += 1
                self.stderr.write(f"  could not move provider secret {row.pk}: {type(e).__name__}")
        verb = "would move" if dry else "moved"
        self.stdout.write(self.style.SUCCESS(
            f"Done ({'dry run' if dry else 'applied'}): {verb} {counts['moved']}, already in Key Vault {counts['already']}, "
            f"failed {counts['failed']}"))
