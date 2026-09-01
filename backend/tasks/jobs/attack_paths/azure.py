# Portions of this file are based on code from the Cartography project
# (https://github.com/cartography-cncf/cartography), which is licensed under the Apache 2.0 License.

from typing import Any
import re

import neo4j
from api.models import (
    AttackPathsScan as ProwlerAPIAttackPathsScan,
    Finding as ProwlerFindingModel,
)
from api.models import (
    Provider as ProwlerAPIProvider,
)
try:
    from cartography.config import Config as CartographyConfig
except Exception:
    class CartographyConfig:
        pass
try:
    from cartography.intel import azure as cartography_azure
    from cartography.intel.azure.util.credentials import Credentials as CartographyAzureCredentials
except Exception:
    cartography_azure = None
    CartographyAzureCredentials = None
from celery.utils.log import get_task_logger
from prowler.providers.common.provider import Provider as ProwlerSDKProvider
from tasks.jobs.attack_paths import db_utils

logger = get_task_logger(__name__)


def extract_short_uid(uid: str) -> str:
    """Azure resource IDs are already the form Cartography stores; no shortening needed."""
    return uid


def get_azure_credentials(
    prowler_api_provider: ProwlerAPIProvider, prowler_sdk_provider: ProwlerSDKProvider
) -> "CartographyAzureCredentials":
    """
    Build real Cartography Azure credentials from the already-authenticated Prowler
    Azure provider session, so Cartography discovers this account's actual resources
    instead of authenticating separately.
    """
    identity = getattr(prowler_sdk_provider, "identity", None)
    subscriptions = getattr(identity, "subscriptions", {}) or {}
    if not subscriptions:
        raise Exception(
            "No Azure subscriptions found on the authenticated session. No Azure resources can be synced."
        )

    tenant_ids = getattr(identity, "tenant_ids", []) if identity else []
    if not tenant_ids:
        raise Exception("No Azure tenant ID found on the authenticated session.")
    tenant_id = tenant_ids[0]

    sub_id = prowler_api_provider.uid if prowler_api_provider.uid in subscriptions else next(iter(subscriptions))

    return CartographyAzureCredentials(
        credential=prowler_sdk_provider.session,
        tenant_id=tenant_id,
        subscription_id=sub_id,
    )


def _link_findings_to_real_resources(
    neo4j_session: neo4j.Session,
    prowler_api_provider: ProwlerAPIProvider,
    update_tag: int,
) -> None:
    """
    Attach real FAIL findings to the real resource nodes Cartography just ingested,
    matched by the resource's real Azure ARM ID (Resource.uid) — never guessed by
    keyword-matching the check_id against an arbitrary target.
    """
    findings = (
        ProwlerFindingModel.objects.filter(
            scan__provider_id=prowler_api_provider.id, status="FAIL"
        )
        .prefetch_related("resources")
        .order_by("-severity")[:200]
    )
    linked = 0
    for f in findings:
        resource = f.resources.first()
        if not resource or not resource.uid:
            continue
        fid = f"finding-{f.id}"
        result = neo4j_session.run(
            """
            MATCH (r {id: $target_id})
            MERGE (pf:ProwlerFinding {id: $fid})
            ON CREATE SET pf.uid = $fuid, pf.check_id = $check_id, pf.severity = $severity,
                          pf.status = $status, pf.lastupdated = $update_tag
            ON MATCH SET pf.severity = $severity, pf.status = $status, pf.lastupdated = $update_tag
            MERGE (r)-[:HAS_FINDING]->(pf)
            RETURN r
            """,
            {
                "fid": fid,
                "fuid": f.uid,
                "check_id": f.check_id,
                "severity": f.severity or "high",
                "status": "FAIL",
                "target_id": resource.uid,
                "update_tag": update_tag,
            },
        )
        if result.peek() is not None:
            linked += 1
    logger.info(f"Linked {linked} real findings to real Azure resource nodes")


def start_azure_ingestion(
    neo4j_session: neo4j.Session,
    cartography_config: CartographyConfig,
    prowler_api_provider: ProwlerAPIProvider,
    prowler_sdk_provider: ProwlerSDKProvider,
    attack_paths_scan: ProwlerAPIAttackPathsScan,
) -> dict[str, dict[str, str]]:
    """
    Real Azure ingestion using Cartography's own Azure intel modules (tenant,
    subscription, compute, cosmosdb, app_service, functions, logic_apps, sql,
    storage) against the account's actually-discovered resources, reusing the
    Prowler provider's already-authenticated Azure credential instead of Cartography
    re-authenticating separately.
    """
    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 10)

    update_tag = attack_paths_scan.update_tag or 1
    common_job_parameters = {
        "UPDATE_TAG": update_tag,
        "permission_relationships_file": getattr(cartography_config, "permission_relationships_file", None),
    }

    credentials = get_azure_credentials(prowler_api_provider, prowler_sdk_provider)
    common_job_parameters["TENANT_ID"] = credentials.tenant_id

    cartography_azure._sync_tenant(neo4j_session, credentials, update_tag, common_job_parameters)
    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 25)

    identity = getattr(prowler_sdk_provider, "identity", None)
    subscriptions_map = getattr(identity, "subscriptions", {}) or {}
    subscriptions = [
        {"subscriptionId": sid, "displayName": name}
        for sid, name in subscriptions_map.items()
    ]

    cartography_azure._sync_multiple_subscriptions(
        neo4j_session,
        credentials,
        credentials.tenant_id,
        subscriptions,
        update_tag,
        common_job_parameters,
    )
    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 75)

    # Link real FAIL findings onto the real resource graph just ingested above.
    try:
        _link_findings_to_real_resources(neo4j_session, prowler_api_provider, update_tag)
    except Exception as fe:
        logger.warning(f"Could not link findings to real Azure resources: {fe}")

    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 88)
    return {}
