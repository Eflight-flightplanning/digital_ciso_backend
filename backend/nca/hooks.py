"""Start an NCA assessment in the background (shared by the NCA API and the platform's Scan button)."""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from django.db import connection

from .catalog import FRAMEWORK_FILES
from .engine import run_assessment
from .models import NcaAssessment

logger = logging.getLogger("nca.hooks")
STALE_RUN = timedelta(hours=1)


def reap_stale(qs) -> None:
    cutoff = datetime.now(timezone.utc) - STALE_RUN
    qs.filter(status="running", started_at__lt=cutoff).update(
        status="failed", error="Assessment did not finish (server restarted or run timed out).",
        finished_at=datetime.now(timezone.utc))


def start_assessment(tenant_id, frameworks=None, provider_id=None, triggered_by="system"):
    """Create an assessment and run it in a background thread. Returns (assessment, started).
    If one is already running for the tenant, returns (that_assessment, False) and starts nothing."""
    frameworks = frameworks or list(FRAMEWORK_FILES)
    running = NcaAssessment.objects.filter(tenant_id=tenant_id, status="running")
    reap_stale(running)
    existing = running.first()
    if existing:
        return existing, False
    a = NcaAssessment.objects.create(tenant_id=tenant_id, frameworks=frameworks, triggered_by=triggered_by,
                                     oci_profile="platform-provider")

    def _bg():
        try:
            run_assessment(frameworks=frameworks, tenant_id=tenant_id, triggered_by=triggered_by, assessment=a,
                           provider_id=provider_id)
        except Exception:  # noqa: BLE001
            logger.exception("Background NCA assessment crashed")
        finally:
            connection.close()

    threading.Thread(target=_bg, name=f"nca-{a.id}", daemon=True).start()
    return a, True
