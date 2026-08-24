# Portions of this file are based on code from the Cartography project
# (https://github.com/cartography-cncf/cartography), which is licensed under the Apache 2.0 License.

from typing import Any

import neo4j
from api.models import (
    AttackPathsScan as ProwlerAPIAttackPathsScan,
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
except Exception:
    cartography_azure = None
from celery.utils.log import get_task_logger
from prowler.providers.common.provider import Provider as ProwlerSDKProvider
from tasks.jobs.attack_paths import db_utils

logger = get_task_logger(__name__)


def extract_short_uid(uid: str) -> str:
    """Azure resource IDs are already the form Cartography stores; no shortening needed."""
    return uid


def start_azure_ingestion(
    neo4j_session: neo4j.Session,
    cartography_config: CartographyConfig,
    prowler_api_provider: ProwlerAPIProvider,
    prowler_sdk_provider: ProwlerSDKProvider,
    attack_paths_scan: ProwlerAPIAttackPathsScan,
) -> dict[str, dict[str, str]]:
    """
    Real Azure ingestion via the upstream Cartography library's own Azure
    intel module (`cartography.intel.azure.start_azure_ingestion`), which
    handles authentication and the full resource sync internally given a
    populated Config. This wrapper only needs to supply the tenant's real
    Service Principal credentials from their stored ProviderSecret.
    """
    if cartography_azure is None:
        return {"azure": {"error": "cartography.intel.azure is not importable in this environment"}}

    try:
        secret = prowler_api_provider.secret.secret or {}
    except Exception:
        secret = {}

    tenant_id = secret.get("tenant_id", "")
    client_id = secret.get("client_id", "")
    client_secret = secret.get("client_secret", "")
    subscription_id = secret.get("subscription_id") or prowler_api_provider.uid

    if not (tenant_id and client_id and client_secret):
        return {
            "azure": {
                "error": "Provider is missing tenant_id/client_id/client_secret — "
                "cannot authenticate for Attack Paths ingestion."
            }
        }

    cartography_config.azure_sp_auth = True
    cartography_config.azure_tenant_id = tenant_id
    cartography_config.azure_client_id = client_id
    cartography_config.azure_client_secret = client_secret
    cartography_config.azure_subscription_id = subscription_id
    cartography_config.azure_sync_all_subscriptions = False
    cartography_config.permission_relationships_file = getattr(
        cartography_config, "permission_relationships_file", None
    )

    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 3)

    failed_syncs: dict[str, dict[str, str]] = {}
    try:
        logger.info(
            f"Syncing Azure subscription {subscription_id} for provider {prowler_api_provider.uid}"
        )
        cartography_azure.start_azure_ingestion(neo4j_session, cartography_config)
    except Exception as e:
        logger.error(f"Azure Cartography ingestion failed for {prowler_api_provider.uid}: {e}")
        failed_syncs["azure"] = {"error": str(e)}

    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 88)
    return failed_syncs
