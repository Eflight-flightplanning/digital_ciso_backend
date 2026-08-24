from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

OCI_PUBLIC_INSTANCE_COMPARTMENT_ADMIN = AttackPathsQueryDefinition(
    id="oci-public-instance-compartment-admin",
    name="Internet-Exposed OCI Compute Instance with Compartment Admin Access",
    short_description="Find public OCI Compute Instances with Instance Principal access to Compartment Admin policies.",
    description="Detect Oracle Cloud Infrastructure (OCI) compute instances with public IP addresses whose Instance Principal dynamic group grants tenancy or compartment administrator capabilities.",
    provider="oci",
    cypher=f"""
        MATCH (comp:OCICompartment {{id: $provider_uid}})--(inst:OCIComputeInstance)
        WHERE inst.public_ip IS NOT NULL OR inst.is_public = true

        MATCH (inst)-[:MEMBER_OF]->(dg:OCIDynamicGroup)-[:GRANTED_POLICY]->(pol:OCIPolicy)
        WHERE toLower(pol.statement) CONTAINS 'manage all-resources' OR toLower(pol.statement) CONTAINS 'use tenancy'

        OPTIONAL MATCH (internet:Internet)-[can_access:CAN_ACCESS]->(inst)
        OPTIONAL MATCH (inst)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN inst, dg, pol, collect(DISTINCT pf) AS dpf, internet, can_access
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
    provider="oci",
    cypher=f"""
        MATCH (comp:OCICompartment {{id: $provider_uid}})--(bkt:OCIObjectStorageBucket)
        WHERE bkt.public_access_type IN ['ObjectRead', 'ObjectReadWithoutList'] OR bkt.kms_key_id IS NULL

        MATCH (bkt)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN bkt, collect(DISTINCT pf) AS dpf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/managingbuckets.htm",
    ),
)

OCI_QUERIES: list[AttackPathsQueryDefinition] = [
    OCI_PUBLIC_INSTANCE_COMPARTMENT_ADMIN,
    OCI_PUBLIC_UNENCRYPTED_OBJECT_STORAGE,
]
