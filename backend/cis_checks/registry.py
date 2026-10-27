"""Discovers checks under checks/<check_id>/ (Prowler layout) and orders them by CIS id."""
import importlib
import json
from functools import lru_cache
from pathlib import Path

CHECKS_DIR = Path(__file__).parent / "checks"


def cis_sort_key(cis_id):
    return tuple(int(p) for p in cis_id.split("."))


@lru_cache(maxsize=1)
def load_metadata():
    """All check metadata, ordered by CIS id."""
    items = []
    for folder in CHECKS_DIR.iterdir():
        meta_file = folder / f"{folder.name}.metadata.json"
        if folder.is_dir() and meta_file.exists():
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            if meta.get("CheckID") != folder.name:
                raise ValueError(f"{meta_file}: CheckID must equal the folder name")
            items.append(meta)
    return sorted(items, key=lambda m: cis_sort_key(m["CisId"]))


def load_checks():
    """Instantiated checks, ordered by CIS id."""
    checks = []
    for meta in load_metadata():
        module = importlib.import_module(f"cis_checks.checks.{meta['CheckID']}.{meta['CheckID']}")
        check = getattr(module, meta["CheckID"])()
        check.metadata = meta
        checks.append(check)
    return checks
