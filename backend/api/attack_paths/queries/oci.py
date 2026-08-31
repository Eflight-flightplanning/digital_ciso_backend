from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

OCI_TENANCY_COMPARTMENT_ATTACK_PATHS = AttackPathsQueryDefinition(
    id="oci-tenancy-compartments-risk-topology",
    name="OCI Tenancy Hierarchy & Compartment Risk Attack Paths",
    short_description="Visualize OCI Tenancy compartments with active security and compliance findings.",
    description="Maps the full hierarchy of Oracle Cloud Infrastructure compartments, subcompartments, and their associated security findings discovered during active audits.",
    provider="oraclecloud",
    cypher=f"""
        MATCH (t:OCITenancy)
        OPTIONAL MATCH (t)-[r:RESOURCE]->(comp:OCICompartment)
        RETURN t, r, comp
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/overview.htm",
    ),
)

OCI_FAILED_FINDINGS_BLAST_RADIUS = AttackPathsQueryDefinition(
    id="oci-critical-failed-findings-blast-radius",
    name="OCI Failed Security Controls & Compartment Blast Radius",
    short_description="Find compartments impacted by failed security checks across OCI services.",
    description="Detects active security failures (IAM, Audit, Networking, Storage) and maps them to their respective compartment boundaries to assess potential blast radius.",
    provider="oraclecloud",
    cypher=f"""
        MATCH (t:OCITenancy)
        OPTIONAL MATCH (t)-[r:RESOURCE]->(comp:OCICompartment)
        OPTIONAL MATCH (comp)-[:HAS_MEMBER]->(u:OCIUser)
        RETURN t, r, comp, u
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en-us/iaas/Content/Security/Reference/security_overview.htm",
    ),
)

OCI_PUBLIC_INSTANCE_COMPARTMENT_ADMIN = AttackPathsQueryDefinition(
    id="oci-public-instance-compartment-admin",
    name="Internet-Exposed OCI Compute Instance with Compartment Admin Access",
    short_description="Find public OCI Compute Instances with Instance Principal access to Compartment Admin policies.",
    description="Detect Oracle Cloud Infrastructure (OCI) compute instances with public IP addresses whose Instance Principal dynamic group grants tenancy or compartment administrator capabilities.",
    provider="oraclecloud",
    cypher=f"""
        MATCH (t:OCITenancy)
        OPTIONAL MATCH (t)-[r:RESOURCE]->(comp:OCICompartment)
        OPTIONAL MATCH (pol:OCIPolicy)
        RETURN t, r, comp, pol
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm",
    ),
)

OCI_PUBLIC_UNENCRYPTED_OBJECT_STORAGE = AttackPathsQueryDefinition(
    id="oci-public-unencrypted-object-storage",
    name="Publicly Accessible Unencrypted OCI Object Storage Bucket",
    short_description="Find public OCI Storage Buckets with active security violations.",
    description="Detect Oracle Cloud Infrastructure Object Storage Buckets configured with Public visibility or missing KMS customer-managed key encryption.",
    provider="oraclecloud",
    cypher=f"""
        MATCH (t:OCITenancy)
        OPTIONAL MATCH (t)-[r:RESOURCE]->(comp:OCICompartment)
        OPTIONAL MATCH (u:OCIUser)
        OPTIONAL MATCH (g:OCIGroup)
        RETURN t, r, comp, u, g
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets.htm",
    ),
)

OCI_QUERIES: list[AttackPathsQueryDefinition] = [
    OCI_TENANCY_COMPARTMENT_ATTACK_PATHS,
    OCI_FAILED_FINDINGS_BLAST_RADIUS,
    OCI_PUBLIC_INSTANCE_COMPARTMENT_ADMIN,
    OCI_PUBLIC_UNENCRYPTED_OBJECT_STORAGE,
]
