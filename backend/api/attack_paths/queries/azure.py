from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

AZURE_SUBSCRIPTION_RISK_TOPOLOGY = AttackPathsQueryDefinition(
    id="azure-subscription-risk-topology",
    name="Azure Subscription Hierarchy & Resource Risk Attack Paths",
    short_description="Visualize Azure Subscription Resource Groups and active security findings.",
    description="Maps the full hierarchy of Azure Subscriptions, Resource Groups, and associated cloud assets with active security findings discovered during scans.",
    provider="azure",
    cypher=f"""
        MATCH (res:_AzureResource)-[pfr:HAS_FINDING]->(pf:{PROWLER_FINDING_LABEL})
        RETURN res, pfr, pf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-organization",
    ),
)

AZURE_FAILED_FINDINGS_BLAST_RADIUS = AttackPathsQueryDefinition(
    id="azure-failed-findings-blast-radius",
    name="Azure Failed Security Controls & Resource Blast Radius",
    short_description="Find Azure resources impacted by failed security and compliance checks.",
    description="Detects active security failures (App Services, VMs, Storage, Key Vaults) and maps them to resource boundaries to assess attack paths.",
    provider="azure",
    cypher=f"""
        MATCH (res:_AzureResource)-[pfr:HAS_FINDING]->(pf:{PROWLER_FINDING_LABEL})
        WHERE pf.status = 'FAIL'
        RETURN res, pfr, pf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/security/fundamentals/overview",
    ),
)

AZURE_INTERNET_EXPOSED_VM_KEYVAULT = AttackPathsQueryDefinition(
    id="azure-internet-exposed-vm-keyvault",
    name="Internet-Exposed Azure Virtual Machine Security Vulnerabilities",
    short_description="Find Azure Virtual Machines with active security violations and attack vectors.",
    description="Detect Azure Virtual Machines and Compute assets with active failed security findings and missing perimeter protections.",
    provider="azure",
    cypher=f"""
        MATCH (vm:AzureVirtualMachine)-[pfr:HAS_FINDING]->(pf:{PROWLER_FINDING_LABEL})
        RETURN vm, pfr, pf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/virtual-machines/security-policy",
    ),
)

AZURE_ENTRA_APP_PRIVILEGE_ESCALATION = AttackPathsQueryDefinition(
    id="azure-entra-app-privilege-escalation",
    name="Azure App Service Misconfiguration & Identity Exposure",
    short_description="Identify Azure App Services with missing client certificates or weak authentication.",
    description="Find Azure App Services and web endpoints with active authentication or certificate violations discovered during scans.",
    provider="azure",
    cypher=f"""
        MATCH (app:AzureAppService)-[pfr:HAS_FINDING]->(pf:{PROWLER_FINDING_LABEL})
        RETURN app, pfr, pf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/app-service/overview-security",
    ),
)

AZURE_PUBLIC_STORAGE_CRITICAL_FINDING = AttackPathsQueryDefinition(
    id="azure-public-storage-critical-finding",
    name="Publicly Accessible Azure Storage Account with Security Violations",
    short_description="Find Azure Blob Storage accounts with active security violations.",
    description="Detect Azure Storage Accounts with active failed security findings such as missing secure transfer or open access.",
    provider="azure",
    cypher=f"""
        MATCH (sa:AzureStorageAccount)-[pfr:HAS_FINDING]->(pf:{PROWLER_FINDING_LABEL})
        RETURN sa, pfr, pf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-prevent",
    ),
)

AZURE_QUERIES: list[AttackPathsQueryDefinition] = [
    AZURE_SUBSCRIPTION_RISK_TOPOLOGY,
    AZURE_FAILED_FINDINGS_BLAST_RADIUS,
    AZURE_INTERNET_EXPOSED_VM_KEYVAULT,
    AZURE_ENTRA_APP_PRIVILEGE_ESCALATION,
    AZURE_PUBLIC_STORAGE_CRITICAL_FINDING,
]
