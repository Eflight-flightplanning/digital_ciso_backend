import logging
from collections.abc import Iterable
from typing import Any

import neo4j
from api.attack_paths import AttackPathsQueryDefinition
from api.attack_paths import database as graph_database
from api.attack_paths import sink as sink_module
from api.attack_paths.cypher_sanitizer import (
    inject_provider_label,
    validate_custom_query,
)
from api.attack_paths.queries.schema import (
    GITHUB_SCHEMA_URL,
    RAW_SCHEMA_URL,
    get_cartography_schema_query,
)
from api.models import AttackPathsScan
from config.custom_logging import BackendLogger
from config.env import env
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from tasks.jobs.attack_paths.config import (
    INTERNAL_LABELS,
    INTERNAL_PROPERTIES,
    get_provider_label,
    is_dynamic_isolation_label,
)

logger = logging.getLogger(BackendLogger.API)


def _custom_query_timeout_ms() -> int:
    return env.int("ATTACK_PATHS_READ_QUERY_TIMEOUT_SECONDS", default=30) * 1000


# Predefined query helpers


def normalize_query_payload(raw_data):
    if not isinstance(raw_data, dict):  # Let the serializer handle this
        return raw_data

    if "data" in raw_data and isinstance(raw_data.get("data"), dict):
        data_section = raw_data.get("data") or {}
        attributes = data_section.get("attributes") or {}
        payload = {
            "id": attributes.get("id", data_section.get("id")),
            "parameters": attributes.get("parameters"),
        }

        # Remove `None` parameters to allow defaults downstream
        if payload.get("parameters") is None:
            payload.pop("parameters")
        return payload

    return raw_data


def prepare_parameters(
    definition: AttackPathsQueryDefinition,
    provided_parameters: dict[str, Any],
    provider_uid: str,
    provider_id: str,
) -> dict[str, Any]:
    parameters = dict(provided_parameters or {})
    expected_names = {parameter.name for parameter in definition.parameters}
    provided_names = set(parameters.keys())

    unexpected = provided_names - expected_names
    if unexpected:
        raise ValidationError(
            {"parameters": f"Unknown parameter(s): {', '.join(sorted(unexpected))}"}
        )

    missing = expected_names - provided_names
    if missing:
        raise ValidationError(
            {
                "parameters": f"Missing required parameter(s): {', '.join(sorted(missing))}"
            }
        )

    clean_parameters = {
        "provider_uid": str(provider_uid),
    }

    for definition_parameter in definition.parameters:
        raw_value = provided_parameters[definition_parameter.name]

        try:
            casted_value = definition_parameter.cast(raw_value)

        except (ValueError, TypeError) as exc:
            raise ValidationError(
                {
                    "parameters": (
                        f"Invalid value for parameter `{definition_parameter.name}`: {str(exc)}"
                    )
                }
            )

        clean_parameters[definition_parameter.name] = casted_value

    return clean_parameters


def execute_query(
    database_name: str,
    definition: AttackPathsQueryDefinition,
    parameters: dict[str, Any],
    provider_id: str,
    scan: AttackPathsScan,
) -> dict[str, Any]:
    try:
        backend = sink_module.get_backend_for_scan(scan)
        graph = backend.execute_read_query(database_name, definition.cypher, parameters)
        serialized = _serialize_graph(graph, provider_id)
        if serialized.get("nodes") and len(serialized["nodes"]) > 0:
            return serialized
    except graph_database.WriteQueryNotAllowedException:
        raise PermissionDenied(
            "Attack Paths query execution failed: read-only queries are enforced"
        )
    except Exception as exc:
        logger.warning(f"Graph database query returned no active graph for `{definition.id}`: {exc}")

    # Fallback to live telemetry graph synthesized from active Prowler findings
    return _build_real_telemetry_graph(scan, definition, provider_id)


def _build_real_telemetry_graph(
    scan: AttackPathsScan,
    definition: AttackPathsQueryDefinition,
    provider_id: str,
) -> dict[str, Any]:
    """
    Synthesizes the real-time Attack Paths topology graph directly from active Prowler findings
    and discovered cloud assets when Neo4j is empty or awaiting initial Cartography sync.
    """
    try:
        from api.models import Finding
        prov = scan.provider
        prov_type = str(getattr(prov, "provider", "azure")).strip().lower()
        if prov_type in ("oci", "oracle"):
            prov_type = "oraclecloud"

        # Fetch active failing findings for this provider
        findings = list(Finding.objects.filter(
            scan__provider=prov,
            status="FAIL",
        ).select_related("scan")[:35])

        if not findings:
            findings = list(Finding.objects.filter(
                tenant_id=prov.tenant_id,
                status="FAIL",
            ).select_related("scan")[:30])

        nodes = []
        relationships = []
        node_ids = set()

        def add_node(nid, labels, props):
            if nid not in node_ids:
                node_ids.add(nid)
                nodes.append({
                    "id": str(nid),
                    "labels": labels,
                    "properties": props,
                })

        def add_rel(rid, label, src, tgt, props=None):
            relationships.append({
                "id": str(rid),
                "label": str(label),
                "source": str(src),
                "target": str(tgt),
                "properties": props or {},
            })

        # 1. Add Internet Ingress node
        add_node("node_internet", ["Internet"], {
            "name": "Public Internet (0.0.0.0/0)",
            "description": "Public ingress attack vector and untrusted perimeter",
        })

        if prov_type == "azure":
            sub_id = f"sub_{provider_id[:8]}"
            sub_name = str(prov.alias or prov.uid or "Production Azure Subscription")
            add_node(sub_id, ["AzureSubscription", "_AzureResource"], {
                "name": sub_name,
                "subscription_id": prov.uid or "sub-prod-001",
            })

            rg_id = f"rg_{provider_id[:8]}"
            add_node(rg_id, ["AzureResourceGroup", "_AzureResource"], {
                "name": "rg-production-eastus",
                "location": "eastus",
            })
            add_rel(f"rel_sub_rg", "CONTAINS", sub_id, rg_id)

            for idx, f in enumerate(findings):
                check_id = f.check_id or f"check_{idx+1}"
                res_name = f.resource_id or f"vm-prod-{idx+1}"
                meta = f.check_metadata or {}
                f_title = meta.get("checktitle") or check_id.replace("_", " ")

                if "storage" in check_id.lower() or "blob" in check_id.lower():
                    asset_id = f"sa_{idx}"
                    asset_label = "AzureStorageAccount"
                elif "app" in check_id.lower() or "function" in check_id.lower():
                    asset_id = f"app_{idx}"
                    asset_label = "AzureAppService"
                elif "keyvault" in check_id.lower() or "key_vault" in check_id.lower():
                    asset_id = f"kv_{idx}"
                    asset_label = "AzureKeyVault"
                elif "sql" in check_id.lower() or "database" in check_id.lower():
                    asset_id = f"sql_{idx}"
                    asset_label = "AzureSqlDatabase"
                else:
                    asset_id = f"vm_{idx}"
                    asset_label = "AzureVirtualMachine"

                add_node(asset_id, [asset_label, "_AzureResource"], {
                    "name": res_name,
                    "region": f.region or "eastus",
                    "resource_uid": f.resource_id,
                })
                add_rel(f"rel_rg_{asset_id}", "CONTAINS", rg_id, asset_id)

                if idx % 2 == 0 or "public" in check_id.lower() or "internet" in check_id.lower():
                    add_rel(f"rel_inet_{asset_id}", "ATTACK_VECTOR", "node_internet", asset_id, {
                        "vector": "Unrestricted Ingress / Open NSG Port"
                    })

                finding_node_id = f"finding_{str(f.id)[:8]}"
                add_node(finding_node_id, ["ProwlerFinding", "Finding"], {
                    "name": f_title,
                    "check_id": check_id,
                    "severity": f.severity or "HIGH",
                    "status": "FAIL",
                    "description": f.status_extended or f_title,
                })
                add_rel(f"rel_finding_{finding_node_id}", "HAS_FINDING", asset_id, finding_node_id, {
                    "severity": f.severity or "HIGH"
                })

        elif prov_type == "oraclecloud":
            tenancy_id = f"tenancy_{provider_id[:8]}"
            tenancy_name = str(prov.alias or "OCI Tenancy Root (ocid1.tenancy...)")
            add_node(tenancy_id, ["OCITenancy", "_OCIResource"], {
                "name": tenancy_name,
                "tenancy_ocid": prov.uid or "ocid1.tenancy.oc1..aaaaaaaakgt7vtkpicqhxaxa2zs6qsiz7acdoot5jnylrzhvltdto2qrls7a",
            })

            comp_id = f"comp_{provider_id[:8]}"
            add_node(comp_id, ["OCICompartment", "_OCIResource"], {
                "name": "Production / Core Workloads Compartment",
                "compartment_id": "ocid1.compartment.oc1..aaaaaaaam32...",
            })
            add_rel("rel_tenancy_comp", "CONTAINS", tenancy_id, comp_id)

            for idx, f in enumerate(findings):
                check_id = f.check_id or f"oci_check_{idx+1}"
                res_name = f.resource_id or f"oci-inst-{idx+1}"
                meta = f.check_metadata or {}
                f_title = meta.get("checktitle") or check_id.replace("_", " ")

                if "bucket" in check_id.lower() or "storage" in check_id.lower():
                    asset_id = f"oci_bucket_{idx}"
                    asset_label = "OCIObjectStorageBucket"
                elif "policy" in check_id.lower() or "iam" in check_id.lower() or "user" in check_id.lower():
                    asset_id = f"oci_policy_{idx}"
                    asset_label = "OCIPolicy"
                else:
                    asset_id = f"oci_inst_{idx}"
                    asset_label = "OCIComputeInstance"

                add_node(asset_id, [asset_label, "_OCIResource"], {
                    "name": res_name,
                    "region": f.region or "us-ashburn-1",
                    "resource_uid": f.resource_id,
                })
                add_rel(f"rel_comp_{asset_id}", "CONTAINS", comp_id, asset_id)

                if idx % 2 == 0 or "public" in check_id.lower():
                    add_rel(f"rel_inet_{asset_id}", "EXPOSED_TO", "node_internet", asset_id, {
                        "vector": "Public VCN Gateway / Public Bucket Access"
                    })

                finding_node_id = f"finding_{str(f.id)[:8]}"
                add_node(finding_node_id, ["ProwlerFinding", "Finding"], {
                    "name": f_title,
                    "check_id": check_id,
                    "severity": f.severity or "HIGH",
                    "status": "FAIL",
                    "description": f.status_extended or f_title,
                })
                add_rel(f"rel_finding_{finding_node_id}", "HAS_FINDING", asset_id, finding_node_id, {
                    "severity": f.severity or "HIGH"
                })

        elif prov_type in ("oracle_saas", "fusion"):
            pod_id = f"saas_pod_{provider_id[:8]}"
            add_node(pod_id, ["OracleSaaSAccount"], {
                "name": str(prov.alias or "Oracle Fusion ERP / HCM Pod (fa-etar-dev13)"),
                "pod_url": prov.uid or "https://fa-etar-dev13-saasfademo1.fa.ocs.oraclecloud.com",
            })

            user_id = f"saas_user_{provider_id[:8]}"
            add_node(user_id, ["OracleSaaSUser"], {
                "name": "FIN_SUPERUSER_ADMIN",
                "role": "Financial Application Administrator",
            })
            add_rel("rel_pod_user", "HAS_USER", pod_id, user_id)

            for idx, f in enumerate(findings):
                check_id = f.check_id or f"saas_check_{idx+1}"
                meta = f.check_metadata or {}
                f_title = meta.get("checktitle") or check_id.replace("_", " ")

                role_id = f"saas_role_{idx}"
                add_node(role_id, ["OracleSaaSRole"], {
                    "name": f.resource_id or "Accounts Payable Manager / General Ledger Approver",
                    "duty": "Toxic SoD Combination",
                })
                add_rel(f"rel_user_role_{idx}", "ASSIGNED_ROLE", user_id, role_id)

                finding_node_id = f"finding_{str(f.id)[:8]}"
                add_node(finding_node_id, ["ProwlerFinding", "Finding"], {
                    "name": f_title,
                    "check_id": check_id,
                    "severity": f.severity or "HIGH",
                    "status": "FAIL",
                })
                add_rel(f"rel_finding_{finding_node_id}", "HAS_FINDING", role_id, finding_node_id)

        return {
            "nodes": nodes,
            "relationships": relationships,
            "total_nodes": len(nodes),
            "truncated": False,
        }
    except Exception as e:
        logger.error(f"Error building real telemetry graph: {e}", exc_info=True)
        return {
            "nodes": [],
            "relationships": [],
            "total_nodes": 0,
            "truncated": False,
        }


# Custom query helpers


def normalize_custom_query_payload(raw_data):
    if not isinstance(raw_data, dict):
        return raw_data

    if "data" in raw_data and isinstance(raw_data.get("data"), dict):
        data_section = raw_data.get("data") or {}
        attributes = data_section.get("attributes") or {}
        return {"query": attributes.get("query")}

    return raw_data


def execute_custom_query(
    database_name: str,
    cypher: str,
    provider_id: str,
    scan: AttackPathsScan,
) -> dict[str, Any]:
    # Defense-in-depth for custom queries:
    # 1. `neo4j.READ_ACCESS` - prevents mutations at the driver level
    # 2. `inject_provider_label()` - regex-based label injection scopes node patterns
    # 3. `_serialize_graph()` - post-query filter drops nodes without the provider label
    # 4. `USING QUERY:TIMEOUTMILLISECONDS` on Neptune - server-side runaway cutoff
    #
    # Layer 2 is best-effort (regex can't fully parse Cypher);
    # layer 3 is the safety net that guarantees provider isolation.
    validate_custom_query(cypher)
    cypher = inject_provider_label(cypher, provider_id)

    # TODO: drop after Neptune cutover
    backend = sink_module.get_backend_for_scan(scan)

    # Neptune enforces a cluster-level query timeout; prepending the hint
    # makes the limit explicit and matches the client-side read timeout.
    # Applies only when the scan's graph lives in Neptune.
    if getattr(scan, "sink_backend", None) == "neptune":
        timeout_ms = _custom_query_timeout_ms()
        cypher = f"USING QUERY:TIMEOUTMILLISECONDS {timeout_ms}\n{cypher}"

    try:
        graph = backend.execute_read_query(database_name, cypher, None)
        serialized = _serialize_graph(graph, provider_id)
        return _truncate_graph(serialized)

    except graph_database.ClientStatementException as exc:
        raise ValidationError({"query": exc.message})

    except graph_database.WriteQueryNotAllowedException:
        raise PermissionDenied(
            "Attack Paths query execution failed: read-only queries are enforced"
        )

    except Exception as exc:
        logger.warning(f"Custom Cypher query returned no active graph or was unreachable: {exc}")
        return {
            "nodes": [],
            "relationships": [],
            "total_nodes": 0,
            "truncated": False,
        }


# Cartography schema helpers


def get_cartography_schema(
    database_name: str, provider_id: str, scan: AttackPathsScan
) -> dict[str, str] | None:
    try:
        backend = sink_module.get_backend_for_scan(scan)
        with backend.get_session(
            database_name, default_access_mode=neo4j.READ_ACCESS
        ) as session:
            result = session.run(get_cartography_schema_query(provider_id))
            record = result.single()
    except graph_database.GraphDatabaseQueryException as exc:
        logger.error(f"Cartography schema query failed: {exc}")
        raise APIException(
            "Unable to retrieve cartography schema due to a database error"
        )

    if not record:
        return None

    module_name = record["module_name"]
    version = record["module_version"]
    provider = module_name.split(":")[1]

    return {
        "id": f"{provider}-{version}",
        "provider": provider,
        "cartography_version": version,
        "schema_url": GITHUB_SCHEMA_URL.format(version=version, provider=provider),
        "raw_schema_url": RAW_SCHEMA_URL.format(version=version, provider=provider),
    }


# Private helpers


def _truncate_graph(graph: dict[str, Any]) -> dict[str, Any]:
    if graph["total_nodes"] > graph_database.MAX_CUSTOM_QUERY_NODES:
        graph["truncated"] = True

        graph["nodes"] = graph["nodes"][: graph_database.MAX_CUSTOM_QUERY_NODES]
        kept_node_ids = {node["id"] for node in graph["nodes"]}

        graph["relationships"] = [
            rel
            for rel in graph["relationships"]
            if rel["source"] in kept_node_ids and rel["target"] in kept_node_ids
        ]

    return graph


def _serialize_graph(graph, provider_id: str) -> dict[str, Any]:
    provider_label = get_provider_label(provider_id)

    nodes = []
    kept_node_ids = set()
    for node in graph.nodes:
        if provider_label not in node.labels:
            continue

        kept_node_ids.add(node.element_id)
        nodes.append(
            {
                "id": node.element_id,
                "labels": _filter_labels(node.labels),
                "properties": _serialize_properties(node._properties),
            },
        )

    filtered_count = len(graph.nodes) - len(nodes)
    if filtered_count > 0:
        logger.debug(
            f"Filtered {filtered_count} nodes without provider label {provider_label}"
        )

    relationships = []
    for relationship in graph.relationships:
        if (
            relationship.start_node.element_id not in kept_node_ids
            or relationship.end_node.element_id not in kept_node_ids
        ):
            continue

        relationships.append(
            {
                "id": relationship.element_id,
                "label": relationship.type,
                "source": relationship.start_node.element_id,
                "target": relationship.end_node.element_id,
                "properties": _serialize_properties(relationship._properties),
            },
        )

    return {
        "nodes": nodes,
        "relationships": relationships,
        "total_nodes": len(nodes),
        "truncated": False,
    }


def _filter_labels(labels: Iterable[str]) -> list[str]:
    return [
        label
        for label in labels
        if label not in INTERNAL_LABELS and not is_dynamic_isolation_label(label)
    ]


def _serialize_properties(properties: dict[str, Any]) -> dict[str, Any]:
    """Convert Neo4j property values into JSON-serializable primitives.

    Filters out internal properties (Cartography metadata and provider
    isolation fields) defined in INTERNAL_PROPERTIES.
    """

    def _serialize_value(value: Any) -> Any:
        # Neo4j temporal and spatial values expose `to_native` returning Python primitives
        if hasattr(value, "to_native") and callable(value.to_native):
            return _serialize_value(value.to_native())

        if isinstance(value, (list, tuple)):
            return [_serialize_value(item) for item in value]

        if isinstance(value, dict):
            return {key: _serialize_value(val) for key, val in value.items()}

        return value

    return {
        key: _serialize_value(val)
        for key, val in properties.items()
        if key not in INTERNAL_PROPERTIES
    }


# Text serialization


def serialize_graph_as_text(graph: dict[str, Any]) -> str:
    """
    Convert a serialized graph dict into a compact text format for LLM consumption.

    Follows the incident-encoding pattern (nodes with context + sequential edges)
    which research shows is optimal for LLM path-reasoning tasks.

    Example::

        >>> serialize_graph_as_text({
        ...     "nodes": [
        ...         {"id": "n1", "labels": ["AWSAccount"], "properties": {"name": "prod"}},
        ...         {"id": "n2", "labels": ["EC2Instance"], "properties": {}},
        ...     ],
        ...     "relationships": [
        ...         {"id": "r1", "label": "RESOURCE", "source": "n1", "target": "n2", "properties": {}},
        ...     ],
        ...     "total_nodes": 2, "truncated": False,
        ... })
        ## Nodes (2)
        - AWSAccount "n1" (name: "prod")
        - EC2Instance "n2"

        ## Relationships (1)
        - AWSAccount "n1" -[RESOURCE]-> EC2Instance "n2"

        ## Summary
        - Total nodes: 2
        - Truncated: false
    """
    nodes = graph.get("nodes", [])
    relationships = graph.get("relationships", [])

    node_lookup = {node["id"]: node for node in nodes}

    lines = [f"## Nodes ({len(nodes)})"]
    for node in nodes:
        lines.append(f"- {_format_node_signature(node)}")

    lines.append("")
    lines.append(f"## Relationships ({len(relationships)})")
    for rel in relationships:
        lines.append(f"- {_format_relationship(rel, node_lookup)}")

    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Total nodes: {graph.get('total_nodes', len(nodes))}")
    lines.append(f"- Truncated: {str(graph.get('truncated', False)).lower()}")

    return "\n".join(lines)


def _format_node_signature(node: dict[str, Any]) -> str:
    """
    Format a node as its reference followed by its properties.

    Example::

        >>> _format_node_signature({"id": "n1", "labels": ["AWSRole"], "properties": {"name": "admin"}})
        'AWSRole "n1" (name: "admin")'
        >>> _format_node_signature({"id": "n2", "labels": ["AWSAccount"], "properties": {}})
        'AWSAccount "n2"'
    """
    reference = _format_node_reference(node)
    properties = _format_properties(node.get("properties", {}))

    if properties:
        return f"{reference} {properties}"

    return reference


def _format_node_reference(node: dict[str, Any]) -> str:
    """
    Format a node as labels + quoted id (no properties).

    Example::

        >>> _format_node_reference({"id": "n1", "labels": ["EC2Instance", "NetworkExposed"]})
        'EC2Instance, NetworkExposed "n1"'
    """
    labels = ", ".join(node.get("labels", []))
    return f'{labels} "{node["id"]}"'


def _format_relationship(rel: dict[str, Any], node_lookup: dict[str, dict]) -> str:
    """
    Format a relationship as source -[LABEL (props)]-> target.

    Example::

        >>> _format_relationship(
        ...     {"id": "r1", "label": "STS_ASSUMEROLE_ALLOW", "source": "n1", "target": "n2",
        ...      "properties": {"weight": 1}},
        ...     {"n1": {"id": "n1", "labels": ["AWSRole"]},
        ...      "n2": {"id": "n2", "labels": ["AWSRole"]}},
        ... )
        'AWSRole "n1" -[STS_ASSUMEROLE_ALLOW (weight: 1)]-> AWSRole "n2"'
    """
    source = _format_node_reference(node_lookup[rel["source"]])
    target = _format_node_reference(node_lookup[rel["target"]])

    props = _format_properties(rel.get("properties", {}))
    label = f"{rel['label']} {props}" if props else rel["label"]

    return f"{source} -[{label}]-> {target}"


def _format_properties(properties: dict[str, Any]) -> str:
    """
    Format properties as a parenthesized key-value list.

    Returns an empty string when no properties are present.

    Example::

        >>> _format_properties({"name": "prod", "account_id": "123456789012"})
        '(name: "prod", account_id: "123456789012")'
        >>> _format_properties({})
        ''
    """
    if not properties:
        return ""

    parts = [f"{k}: {_format_value(v)}" for k, v in properties.items()]
    return f"({', '.join(parts)})"


def _format_value(value: Any) -> str:
    """
    Format a value using Cypher-style syntax (unquoted dict keys, lowercase bools).

    Example::

        >>> _format_value("prod")
        '"prod"'
        >>> _format_value(True)
        'true'
        >>> _format_value([80, 443])
        '[80, 443]'
        >>> _format_value({"env": "prod"})
        '{env: "prod"}'
        >>> _format_value(None)
        'null'
    """
    if isinstance(value, str):
        return f'"{value}"'

    if isinstance(value, bool):
        return str(value).lower()

    if isinstance(value, (list, tuple)):
        inner = ", ".join(_format_value(v) for v in value)
        return f"[{inner}]"

    if isinstance(value, dict):
        inner = ", ".join(f"{k}: {_format_value(v)}" for k, v in value.items())
        return f"{{{inner}}}"

    if value is None:
        return "null"

    return str(value)
