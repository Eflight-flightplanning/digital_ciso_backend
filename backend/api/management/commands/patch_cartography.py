"""
Re-apply required patches to the installed `cartography` package.

The pip-installed `cartography` library (declared in pyproject.toml) has two
real bugs against the dependency/driver versions this project pins:

  1. `cartography.intel.azure.*` imports `SubscriptionClient` from
     `azure.mgmt.resource`, which no longer exports it — newer
     `azure-mgmt-resource` releases split that client out into the separate
     `azure-mgmt-subscription` package (already a declared dependency here).
  2. Several cartography modules call the deprecated Neo4j driver methods
     `Session.write_transaction()` / `Session.read_transaction()`, which are
     fully removed in `neo4j>=6.2.0` (this project's pinned driver) in favor
     of `execute_write()` / `execute_read()` (same call signature).

These live in site-packages, not in this repo, so a fresh `uv sync` / `pip
install` wipes them out. Run this command once after every dependency
install/update:

    python manage.py patch_cartography

Idempotent — safe to run repeatedly; already-patched files are skipped.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Re-apply required source patches to the installed cartography package."

    def handle(self, *args, **options):
        try:
            import cartography
        except ImportError:
            self.stderr.write(self.style.ERROR(
                "cartography is not installed — run `uv sync` first."
            ))
            return

        cartography_root = Path(cartography.__file__).parent
        if cartography_root.name != "cartography" or "site-packages" not in str(cartography_root):
            self.stderr.write(self.style.WARNING(
                f"cartography resolved to {cartography_root}, which doesn't look like the "
                "pip-installed package. If this is a local shadow package again, delete it "
                "instead of patching it — see the incident this command exists to prevent."
            ))
            return

        self.stdout.write(f"Patching cartography at {cartography_root}")

        patched = 0
        patched += self._patch_subscription_client_import(cartography_root)
        patched += self._patch_transaction_methods(cartography_root)

        if patched:
            self.stdout.write(self.style.SUCCESS(f"Applied {patched} patch(es)."))
        else:
            self.stdout.write(self.style.SUCCESS("Already patched — nothing to do."))

    def _patch_subscription_client_import(self, root: Path) -> int:
        targets = [
            root / "intel" / "azure" / "subscription.py",
            root / "intel" / "azure" / "util" / "credentials.py",
        ]
        old = "from azure.mgmt.resource import SubscriptionClient"
        new = "from azure.mgmt.subscription import SubscriptionClient"
        count = 0
        for path in targets:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            if old in text:
                path.write_text(text.replace(old, new), encoding="utf-8")
                self.stdout.write(f"  patched SubscriptionClient import: {path}")
                count += 1
        return count

    def _patch_transaction_methods(self, root: Path) -> int:
        pattern = re.compile(r"\.(write_transaction|read_transaction)\(")
        replacements = {"write_transaction": "execute_write", "read_transaction": "execute_read"}
        count = 0
        for path in root.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            if not pattern.search(text):
                continue
            new_text = pattern.sub(lambda m: f".{replacements[m.group(1)]}(", text)
            path.write_text(new_text, encoding="utf-8")
            self.stdout.write(f"  patched deprecated transaction methods: {path}")
            count += 1
        return count
