"""Platform-native OCI checks for controls that Prowler's OCI provider has no check for.

All checks are strictly read-only (list/get calls). A native check is a function
``fn(ctx) -> list[dict]`` returning resource-level results:

    {"status": "PASS"|"FAIL", "resource_id", "resource_name", "resource_type",
     "region", "compartment_id", "status_extended", "evidence": {...}}

API problems are reported through ``ctx.add_error(...)`` (never swallowed into an
empty result), so the engine can distinguish "no resources" from "could not look".
"""
from __future__ import annotations

import logging

import oci

from .aggregate import FAIL, PASS, R_API_ERROR, R_PERMISSION_DENIED

logger = logging.getLogger(__name__)


def classify_exception(exc: Exception) -> str:
    """Map an exception to R_PERMISSION_DENIED / R_API_ERROR."""
    if isinstance(exc, oci.exceptions.ServiceError):
        if exc.status in (401, 403):
            return R_PERMISSION_DENIED
        # OCI deliberately answers 404 NotAuthorizedOrNotFound when it hides a resource you may not read.
        if exc.status == 404 and exc.code == "NotAuthorizedOrNotFound":
            return R_PERMISSION_DENIED
    return R_API_ERROR


def classify_text(text: str) -> str:
    t = text.lower()
    if any(m in t for m in ("notauthorizedornotfound", "status: 401", "status: 403", "'status': 401",
                            "'status': 403", "not authorized", "forbidden", "unauthorized")):
        return R_PERMISSION_DENIED
    return R_API_ERROR


class NativeContext:
    def __init__(self, provider):
        self.provider = provider
        self.errors: list[dict] = []

    @property
    def regions(self) -> list[str]:
        return [r.key for r in self.provider.regions]

    @property
    def compartments(self):
        return self.provider.compartments

    def client(self, cls, region: str):
        cfg = {**self.provider.session.config, "region": region}
        signer = self.provider.session.signer
        return cls(config=cfg, signer=signer) if signer else cls(config=cfg)

    def add_error(self, exc_or_msg, where: str = "") -> None:
        if isinstance(exc_or_msg, Exception):
            self.errors.append({"kind": classify_exception(exc_or_msg), "message": f"{where}: {exc_or_msg}".strip(": ")[:500]})
        else:
            self.errors.append({"kind": R_API_ERROR, "message": f"{where}: {exc_or_msg}"[:500]})


# --------------------------------------------------------------------------- checks

def oci_volume_backup_policy_assigned(ctx: NativeContext) -> list[dict]:
    """Every block and boot volume must have a backup policy assigned."""
    from prowler.providers.oraclecloud.services.blockstorage.blockstorage_client import blockstorage_client

    out = []
    clients: dict[str, object] = {}
    kinds = [("Volume", getattr(blockstorage_client, "volumes", [])),
             ("BootVolume", getattr(blockstorage_client, "boot_volumes", []))]
    for rtype, items in kinds:
        for v in items:
            if getattr(v, "lifecycle_state", "") not in ("AVAILABLE", "PROVISIONING"):
                continue
            try:
                client = clients.get(v.region) or clients.setdefault(
                    v.region, ctx.client(oci.core.BlockstorageClient, v.region))
                assignment = client.get_volume_backup_policy_asset_assignment(asset_id=v.id).data
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"{rtype} {v.name} ({v.region})")
                continue
            assigned = bool(assignment)
            out.append({
                "status": PASS if assigned else FAIL,
                "resource_id": v.id, "resource_name": v.name, "resource_type": rtype,
                "region": v.region, "compartment_id": v.compartment_id,
                "status_extended": (f"{rtype} {v.name} has backup policy {assignment[0].policy_id}."
                                    if assigned else f"{rtype} {v.name} has no backup policy assigned."),
                "evidence": {"policy_assignments": [a.policy_id for a in assignment]},
            })
    return out


def oci_vss_host_scan_enabled(ctx: NativeContext) -> list[dict]:
    """If compute instances exist, a Vulnerability Scanning host scan target must cover them."""
    from prowler.providers.oraclecloud.services.compute.compute_client import compute_client

    instances = [i for i in getattr(compute_client, "instances", [])
                 if getattr(i, "lifecycle_state", "") not in ("TERMINATED", "TERMINATING")]
    if not instances:
        return []  # no compute instances -> engine reports NOT_APPLICABLE / NO_RESOURCES
    out = []
    targets_by_comp: dict[tuple[str, str], list] = {}
    for inst in instances:
        key = (inst.region, inst.compartment_id)
        if key not in targets_by_comp:
            try:
                client = ctx.client(oci.vulnerability_scanning.VulnerabilityScanningClient, inst.region)
                targets_by_comp[key] = oci.pagination.list_call_get_all_results(
                    client.list_host_scan_targets, compartment_id=inst.compartment_id).data
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"VSS host scan targets {inst.compartment_id} ({inst.region})")
                targets_by_comp[key] = None
        targets = targets_by_comp[key]
        if targets is None:
            continue
        # A target covers the instance's compartment (and children when it targets a parent). Match by
        # compartment id or explicit instance ids.
        covering = [t for t in targets
                    if getattr(t, "target_compartment_id", None) == inst.compartment_id
                    or inst.id in (getattr(t, "instance_ids", None) or [])]
        out.append({
            "status": PASS if covering else FAIL,
            "resource_id": inst.id, "resource_name": inst.name, "resource_type": "Instance",
            "region": inst.region, "compartment_id": inst.compartment_id,
            "status_extended": (f"Instance {inst.name} is covered by VSS host scan target(s): "
                                f"{', '.join(t.display_name for t in covering)}." if covering else
                                f"Instance {inst.name} is not covered by any Vulnerability Scanning host scan target."),
            "evidence": {"targets": [t.id for t in covering]},
        })
    return out


NATIVE_CHECKS = {
    "oci_volume_backup_policy_assigned": {
        "fn": oci_volume_backup_policy_assigned,
        "service": "blockstorage", "severity": "medium",
        "title": "Block and boot volumes have a backup policy assigned",
        "description": "Verifies each block/boot volume has an OCI volume backup policy assigned so data can be recovered.",
        "remediation_text": "Assign a backup policy (bronze/silver/gold or a custom policy) to every volume.",
        "remediation_cli": "oci bv volume-backup-policy-assignment create --asset-id <VOLUME_OCID> --policy-id <POLICY_OCID>",
        "uses_clients": ["blockstorage"],
    },
    "oci_vss_host_scan_enabled": {
        "fn": oci_vss_host_scan_enabled,
        "service": "vulnerability_scanning", "severity": "high",
        "title": "Compute instances are covered by a Vulnerability Scanning host scan target",
        "description": "Verifies compute instances are covered by an OCI Vulnerability Scanning Service host scan target.",
        "remediation_text": "Create a host scan recipe and a host scan target covering the compartment of each instance.",
        "remediation_cli": "oci vulnerability-scanning host scan target create --compartment-id <C> --host-scan-recipe-id <R> --target-compartment-id <C>",
        "uses_clients": ["compute"],
    },
}


from . import native_checks_extra  # noqa: E402,F401  (registers additional checks into NATIVE_CHECKS)
from . import native_checks_full  # noqa: E402,F401
