from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

AZURE_INTERNET_EXPOSED_VM_KEYVAULT = AttackPathsQueryDefinition(
    id="azure-internet-exposed-vm-keyvault",
    name="Internet-Exposed Azure Virtual Machine with Sensitive Key Vault Access",
    short_description="Find public RDP/SSH Azure VMs with Managed Identity permissions to read Key Vault Secrets.",
    description="Detect Azure Virtual Machines exposed to the internet that possess system/user-assigned Managed Identities with Key Vault Secrets Get/List access permissions.",
    provider="azure",
    cypher=f"""
        MATCH (sub:AzureSubscription {{id: $provider_uid}})--(vm:AzureVirtualMachine)
        WHERE vm.public_ip IS NOT NULL OR vm.exposed_internet = true

        MATCH (vm)-[:HAS_MANAGED_IDENTITY]->(id:AzureManagedIdentity)-[:HAS_ROLE_ASSIGNMENT]->(role:AzureRoleAssignment)
        MATCH (role)-[:SCOPED_TO]->(kv:AzureKeyVault)
        
        OPTIONAL MATCH (internet:Internet)-[can_access:CAN_ACCESS]->(vm)
        OPTIONAL MATCH (kv)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN collect(DISTINCT vm) AS vms, collect(DISTINCT kv) AS keyvaults, collect(DISTINCT pf) AS dpf, internet, can_access
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/key-vault/general/security-features",
    ),
)

AZURE_ENTRA_APP_PRIVILEGE_ESCALATION = AttackPathsQueryDefinition(
    id="azure-entra-app-privilege-escalation",
    name="Entra ID Application Administrator Privilege Escalation Path",
    short_description="Identify Entra ID accounts with App Administrator roles capable of credential injection.",
    description="Find non-MFA enforced accounts holding Application Administrator or Cloud Application Administrator roles capable of adding credentials to high-privileged Enterprise Applications.",
    provider="azure",
    cypher=f"""
        MATCH (sub:AzureSubscription {{id: $provider_uid}})--(u:AzureADUser)-[:HAS_ROLE]->(r:AzureADRole)
        WHERE r.name IN ['Application Administrator', 'Cloud Application Administrator', 'Global Administrator']
        
        MATCH (u)-[:CAN_CONTROL]->(app:AzureADApplication)-[:HAS_APP_ROLE]->(target:AzureADRole)
        OPTIONAL MATCH (u)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN u, r, app, target, collect(DISTINCT pf) AS dpf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference",
    ),
)

AZURE_PUBLIC_STORAGE_CRITICAL_FINDING = AttackPathsQueryDefinition(
    id="azure-public-storage-critical-finding",
    name="Publicly Accessible Azure Storage Account with Critical Finding",
    short_description="Find public Azure Blob Storage accounts with active security violations.",
    description="Detect Azure Storage Accounts allowing anonymous Blob access or public network access that have active failed security findings.",
    provider="azure",
    cypher=f"""
        MATCH (sub:AzureSubscription {{id: $provider_uid}})--(sa:AzureStorageAccount)
        WHERE sa.allow_blob_public_access = true OR sa.public_network_access = 'Enabled'

        MATCH (sa)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN sa, collect(DISTINCT pf) AS dpf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-prevent",
    ),
)

AZURE_QUERIES: list[AttackPathsQueryDefinition] = [
    AZURE_INTERNET_EXPOSED_VM_KEYVAULT,
    AZURE_ENTRA_APP_PRIVILEGE_ESCALATION,
    AZURE_PUBLIC_STORAGE_CRITICAL_FINDING,
]
