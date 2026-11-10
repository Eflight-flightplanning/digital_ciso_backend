"""Keeps a copy of each finished test's reports in that client's own storage area.

A saving problem is logged and never fails the test itself: the results are still in the database.
"""
import csv
import functools
import hashlib
import io
import json
import logging
import re

from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder

from api.client_storage import get_storage

logger = logging.getLogger("api.client_reports")

KINDS = ("nca", "oracle", "scan")
FOLDER = "reports"
_RUN_ID = re.compile(r"[A-Za-z0-9-]{1,36}")
_NAME = re.compile(r"^report-[a-z_]{1,12}\.[a-z]{1,4}$")
_BOM = "﻿"  # lets Excel show non-English characters correctly
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
SCAN_HEADER = ["Check", "Severity", "Resource", "Region", "What failed"]


def valid_location(kind, run_id, name) -> bool:
    return kind in KINDS and bool(_RUN_ID.fullmatch(run_id)) and bool(_NAME.fullmatch(name))


def report_key(kind, run_id, name) -> str:
    run_id = str(run_id)
    if not valid_location(kind, run_id, name):
        raise ValueError("Unknown report.")
    return f"{FOLDER}/{kind}/{run_id}/{name}"


def list_reports(tenant_id) -> list[dict]:
    rows = []
    for key, size in get_storage().list_files(tenant_id, FOLDER):
        _, kind, run_id, name = key.split("/")
        rows.append({"kind": kind, "run_id": run_id, "name": name, "size": size})
    return rows


def _store(tenant_id, kind, run_id, files) -> None:
    storage = get_storage()
    for name, text in files.items():
        key, data = report_key(kind, run_id, name), text.encode()
        storage.put(tenant_id, key, data)
        record_file(tenant_id, key, name=name, size=len(data), sha256=hashlib.sha256(data).hexdigest(), category=FOLDER)


def record_file(tenant_id, key, **details) -> None:
    """Note the file in the database, where the platform's file records exist."""
    if apps.is_installed("client_store"):
        from client_store.service import record_system_file

        record_system_file(tenant_id, key, **details)


def _never_fails(save):
    @functools.wraps(save)
    def wrapper(*args, **kwargs):
        try:
            save(*args, **kwargs)
            return True
        except Exception:  # noqa: BLE001
            logger.exception("Could not save a copy of a report")
            return False
    return wrapper


@_never_fails
def save_assessment(assessment) -> None:
    from nca import reports

    report = reports.build_report(assessment)
    _store(assessment.tenant_id, "nca", assessment.id, {
        "report-html.html": reports.render_html(report),
        "report-csv.csv": _BOM + reports.render_csv(report),
        "report-csv_checks.csv": _BOM + reports.render_csv_checks(report),
        "report-md.md": reports.render_markdown(report),
        "report-json.json": json.dumps(report, cls=DjangoJSONEncoder, indent=2),
    })


@_never_fails
def save_oracle_run(run) -> None:
    from oracle_cis.views import export_csv, export_payload

    # Masked: a stored file must not hold the usernames and addresses that need a permission to reveal.
    _store(run.tenant_id, "oracle", run.id, {
        "report-csv.csv": _BOM + export_csv(run, reveal=False),
        "report-json.json": json.dumps(export_payload(run, reveal=False), cls=DjangoJSONEncoder, indent=2),
    })


def spreadsheet_safe(value) -> str:
    # A cell starting with one of these runs as a formula when the file is opened in a spreadsheet.
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_FORMULA_START) else text


def scan_csv(rows) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(SCAN_HEADER)
    writer.writerows([spreadsheet_safe(cell) for cell in row] for row in rows)
    return out.getvalue()


@_never_fails
def save_scan(tenant_id, scan_id) -> None:
    from api.models import Finding

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
    rows = []
    failed = Finding.objects.filter(tenant_id=tenant_id, scan_id=scan_id, status="FAIL").prefetch_related("resources")
    for finding in failed:
        resource = next(iter(finding.resources.all()), None)
        rows.append([finding.check_id, finding.severity, (resource.name or resource.uid) if resource else "",
                     resource.region if resource else "", finding.status_extended])
    rows.sort(key=lambda row: (order.get(row[1], 9), row[0]))
    _store(tenant_id, "scan", scan_id, {"report-csv.csv": _BOM + scan_csv(rows)})
