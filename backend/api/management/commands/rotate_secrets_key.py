"""Re-encrypt every stored secret with the primary SECRETS_ENCRYPTION_KEY.

Usage (after setting the NEW key in SECRETS_ENCRYPTION_KEY and the old key in
SECRETS_ENCRYPTION_KEY_PREVIOUS):

    python manage.py rotate_secrets_key --dry-run   # report only
    python manage.py rotate_secrets_key             # perform the rotation

Safe to re-run. Rows already encrypted with the primary key are skipped; rows no
configured key can decrypt are reported and left untouched.
"""
from api.crypto import fernet, primary_fernet
from api.db_router import MainRouter
from api.models import (
    Integration,
    LighthouseConfiguration,
    LighthouseProviderConfiguration,
    ProviderSecret,
)
from cryptography.fernet import InvalidToken
from django.core.management.base import BaseCommand
from django.db import transaction

# (model, raw binary column attribute)
TARGETS = [
    (ProviderSecret, "_secret"),
    (Integration, "_credentials"),
    (LighthouseConfiguration, "api_key"),
    (LighthouseProviderConfiguration, "credentials"),
]


def _to_bytes(value):
    if value is None:
        return None
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, str):
        return value.encode()
    return bytes(value)


class Command(BaseCommand):
    help = "Re-encrypt stored secrets with the primary SECRETS_ENCRYPTION_KEY."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report only; change nothing.")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        primary = primary_fernet()
        totals = {"rotated": 0, "current": 0, "empty": 0, "failed": 0}

        for model, attr in TARGETS:
            manager = getattr(model, "all_objects", model.objects)
            qs = manager.using(MainRouter.admin_db).all()
            counts = {"rotated": 0, "current": 0, "empty": 0, "failed": 0}
            with transaction.atomic(using=MainRouter.admin_db):
                for obj in qs.iterator():
                    token = _to_bytes(getattr(obj, attr))
                    if not token:
                        counts["empty"] += 1
                        continue
                    try:
                        primary.decrypt(token)
                        counts["current"] += 1
                        continue
                    except InvalidToken:
                        pass
                    try:
                        new_token = fernet.rotate(token)
                    except InvalidToken:
                        counts["failed"] += 1
                        self.stderr.write(f"  cannot decrypt {model.__name__} id={obj.pk}")
                        continue
                    if not dry:
                        manager.using(MainRouter.admin_db).filter(pk=obj.pk).update(**{attr: new_token})
                    counts["rotated"] += 1
            for k, v in counts.items():
                totals[k] += v
            self.stdout.write(f"{model.__name__}.{attr}: {counts}")

        verb = "would rotate" if dry else "rotated"
        self.stdout.write(self.style.SUCCESS(f"Done ({'dry run' if dry else 'applied'}): {verb} {totals['rotated']}, "
                                             f"already current {totals['current']}, empty {totals['empty']}, "
                                             f"undecryptable {totals['failed']}"))
        if totals["failed"]:
            self.stdout.write(self.style.WARNING(
                "Some rows could not be decrypted with any configured key. Add the key that "
                "encrypted them to SECRETS_ENCRYPTION_KEY_PREVIOUS and re-run."))
