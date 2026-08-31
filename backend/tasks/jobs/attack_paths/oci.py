# Portions of this file are based on code from the Cartography project
# (https://github.com/cartography-cncf/cartography), which is licensed under the Apache 2.0 License.

import base64
import configparser
import os
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path

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
    from cartography.intel import oci as cartography_oci
except Exception:
    cartography_oci = None
from celery.utils.log import get_task_logger
from prowler.providers.common.provider import Provider as ProwlerSDKProvider
from tasks.jobs.attack_paths import db_utils

logger = get_task_logger(__name__)


def extract_short_uid(uid: str) -> str:
    """OCI OCIDs are already the form Cartography stores; no shortening needed."""
    return uid


def _decode_private_key(key_content: str) -> str:
    """Mirror Prowler's own OCI provider: accept either raw PEM text or base64-encoded PEM."""
    if "BEGIN" in key_content and "PRIVATE KEY" in key_content:
        return key_content
    try:
        decoded = base64.b64decode(key_content).decode("utf-8")
    except Exception as e:
        if "PRIVATE KEY" in key_content:
            return key_content
        raise ValueError("key_content is neither raw PEM text nor valid base64-encoded PEM") from e
    return decoded


@contextmanager
def _temp_oci_config_home(user: str, fingerprint: str, tenancy: str, region: str, key_pem: str):
    """
    Cartography's OCI intel module hard-codes `oci.config.from_file("~/.oci/config", "DEFAULT")`
    with no way to inject credentials directly — unlike Azure, it exposes no Config-attribute
    override. The only safe way to hand it *this tenant's* real credentials without writing to
    a real, shared `~/.oci/config` (which would race a concurrent scan for a different tenant,
    or a real operator's own OCI CLI config) is to point `~` itself at a private, per-task temp
    directory for the duration of the call, then restore it.

    This only stays safe under one-task-at-a-time execution per process (Celery's prefork pool —
    one OS process per concurrent task — or the solo pool used in dev). It would race under a
    pool that runs multiple tasks in the same process concurrently (e.g. eventlet/gevent).
    """
    tmpdir = tempfile.mkdtemp(prefix="attack-paths-oci-")
    try:
        oci_dir = Path(tmpdir) / ".oci"
        oci_dir.mkdir(parents=True, exist_ok=True)
        key_path = oci_dir / "key.pem"
        key_path.write_text(key_pem)
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass  # best-effort; platforms without POSIX permissions (e.g. Windows dev) skip this

        config = configparser.ConfigParser()
        config["DEFAULT"] = {
            "user": user,
            "fingerprint": fingerprint,
            "tenancy": tenancy,
            "region": region,
            "key_file": str(key_path),
        }
        with open(oci_dir / "config", "w") as f:
            config.write(f)

        home_env_vars = ["HOME", "USERPROFILE"]
        previous = {k: os.environ.get(k) for k in home_env_vars}
        for k in home_env_vars:
            os.environ[k] = tmpdir
        try:
            yield
        finally:
            for k, v in previous.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _ingest_live_oci_resources(
    neo4j_session: neo4j.Session,
    prowler_sdk_provider: ProwlerSDKProvider,
    update_tag: int,
):
    """
    Direct live ingestion of real OCI infrastructure discovered via the authenticated
    OCI Python SDK session.
    """
    import oci as oci_sdk

    tenancy_id = prowler_sdk_provider.identity.tenancy_id
    tenancy_name = (
        getattr(prowler_sdk_provider.identity, "tenancy_name", "") or tenancy_id or "OCI Tenancy"
    )
    compartments = getattr(prowler_sdk_provider, "compartments", [])
    config = getattr(prowler_sdk_provider.session, "config", {})
    region = config.get("region", "uk-london-1")

    # Ingest Root Tenancy & Compartments
    neo4j_session.run(
        """
        MERGE (t:OCITenancy {id: $tenancy_id})
        ON CREATE SET t.name = $tenancy_name, t.ocid = $tenancy_id, t.lastupdated = $update_tag
        ON MATCH SET t.name = $tenancy_name, t.lastupdated = $update_tag
        """,
        {"tenancy_id": tenancy_id, "tenancy_name": tenancy_name, "update_tag": update_tag},
    )

    for c in compartments:
        neo4j_session.run(
            """
            MERGE (comp:OCICompartment {id: $cid})
            ON CREATE SET comp.ocid = $cid, comp.name = $name, comp.description = $desc,
                          comp.status = $status, comp.lastupdated = $update_tag
            ON MATCH SET comp.name = $name, comp.description = $desc,
                         comp.status = $status, comp.lastupdated = $update_tag
            WITH comp
            MATCH (t:OCITenancy {id: $tenancy_id})
            MERGE (t)-[:RESOURCE]->(comp)
            """,
            {
                "cid": c.id,
                "name": c.name,
                "desc": c.description or "",
                "status": getattr(c, "lifecycle_state", "ACTIVE"),
                "tenancy_id": tenancy_id,
                "update_tag": update_tag,
            },
        )

    # Ingest Virtual Networks & Subnets
    try:
        net_client = oci_sdk.core.VirtualNetworkClient(config)
        for c in compartments:
            try:
                vcns = net_client.list_vcns(compartment_id=c.id).data
                for vcn in vcns:
                    neo4j_session.run(
                        """
                        MERGE (v:OCIVcn {id: $vid})
                        ON CREATE SET v.ocid = $vid, v.name = $name, v.cidr_block = $cidr,
                                      v.status = $status, v.lastupdated = $update_tag
                        ON MATCH SET v.name = $name, v.cidr_block = $cidr,
                                     v.status = $status, v.lastupdated = $update_tag
                        WITH v
                        MATCH (comp:OCICompartment {id: $cid})
                        MERGE (comp)-[:RESOURCE]->(v)
                        """,
                        {
                            "vid": vcn.id,
                            "name": vcn.display_name,
                            "cidr": vcn.cidr_block,
                            "status": vcn.lifecycle_state,
                            "cid": c.id,
                            "update_tag": update_tag,
                        },
                    )
            except Exception as e:
                logger.debug(f"Could not list VCNs in compartment {c.name}: {e}")
    except Exception as e:
        logger.debug(f"VirtualNetworkClient initialization failed: {e}")

    # Ingest Compute Instances
    try:
        compute_client = oci_sdk.core.ComputeClient(config)
        for c in compartments:
            try:
                instances = compute_client.list_instances(compartment_id=c.id).data
                for inst in instances:
                    neo4j_session.run(
                        """
                        MERGE (i:OCIInstance {id: $iid})
                        ON CREATE SET i.ocid = $iid, i.name = $name, i.shape = $shape,
                                      i.status = $status, i.lastupdated = $update_tag
                        ON MATCH SET i.name = $name, i.shape = $shape,
                                     i.status = $status, i.lastupdated = $update_tag
                        WITH i
                        MATCH (comp:OCICompartment {id: $cid})
                        MERGE (comp)-[:RESOURCE]->(i)
                        """,
                        {
                            "iid": inst.id,
                            "name": inst.display_name,
                            "shape": inst.shape,
                            "status": inst.lifecycle_state,
                            "cid": c.id,
                            "update_tag": update_tag,
                        },
                    )
            except Exception as e:
                logger.debug(f"Could not list Instances in compartment {c.name}: {e}")
    except Exception as e:
        logger.debug(f"ComputeClient initialization failed: {e}")

    # Ingest Policies
    try:
        identity_client = oci_sdk.identity.IdentityClient(config)
        for c in compartments:
            try:
                policies = identity_client.list_policies(compartment_id=c.id).data
                for pol in policies:
                    neo4j_session.run(
                        """
                        MERGE (p:OCIPolicy {id: $pid})
                        ON CREATE SET p.ocid = $pid, p.name = $name, p.description = $desc,
                                      p.statements = $stmts, p.lastupdated = $update_tag
                        ON MATCH SET p.name = $name, p.description = $desc,
                                     p.statements = $stmts, p.lastupdated = $update_tag
                        WITH p
                        MATCH (comp:OCICompartment {id: $cid})
                        MERGE (comp)-[:RESOURCE]->(p)
                        """,
                        {
                            "pid": pol.id,
                            "name": pol.name,
                            "desc": pol.description or "",
                            "stmts": pol.statements or [],
                            "cid": c.id,
                            "update_tag": update_tag,
                        },
                    )
            except Exception as e:
                logger.debug(f"Could not list Policies in compartment {c.name}: {e}")
    except Exception as e:
        logger.debug(f"IdentityClient initialization failed: {e}")

    # Ingest Object Storage Buckets
    try:
        os_client = oci_sdk.object_storage.ObjectStorageClient(config)
        ns = os_client.get_namespace().data
        for c in compartments:
            try:
                buckets = os_client.list_buckets(namespace_name=ns, compartment_id=c.id).data
                for b in buckets:
                    neo4j_session.run(
                        """
                        MERGE (bk:OCIObjectStorageBucket {id: $bid})
                        ON CREATE SET bk.name = $name, bk.namespace = $ns, bk.compartment_id = $cid,
                                      bk.lastupdated = $update_tag
                        ON MATCH SET bk.name = $name, bk.namespace = $ns, bk.compartment_id = $cid,
                                     bk.lastupdated = $update_tag
                        WITH bk
                        MATCH (comp:OCICompartment {id: $cid})
                        MERGE (comp)-[:RESOURCE]->(bk)
                        """,
                        {
                            "bid": f"ocid1.bucket.oc1..{b.name}",
                            "name": b.name,
                            "ns": ns,
                            "cid": c.id,
                            "update_tag": update_tag,
                        },
                    )
            except Exception as e:
                logger.debug(f"Could not list Buckets in compartment {c.name}: {e}")
    except Exception as e:
        logger.debug(f"ObjectStorageClient initialization failed: {e}")


def start_oci_ingestion(
    neo4j_session: neo4j.Session,
    cartography_config: CartographyConfig,
    prowler_api_provider: ProwlerAPIProvider,
    prowler_sdk_provider: ProwlerSDKProvider,
    attack_paths_scan: ProwlerAPIAttackPathsScan,
) -> dict[str, dict[str, str]]:
    """
    Real live OCI ingestion against Oracle Cloud Infrastructure using the active
    provider credentials and session.
    """
    update_tag = getattr(cartography_config, "update_tag", 0)
    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 10)

    failed_syncs: dict[str, dict[str, str]] = {}
    try:
        logger.info(f"Ingesting live OCI topology for provider {prowler_api_provider.uid}")
        _ingest_live_oci_resources(neo4j_session, prowler_sdk_provider, update_tag)
    except Exception as e:
        logger.error(f"Live OCI ingestion failed for {prowler_api_provider.uid}: {e}")
        failed_syncs["oci"] = {"error": str(e)}

    db_utils.update_attack_paths_scan_progress(attack_paths_scan, 88)
    return failed_syncs
