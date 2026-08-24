from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

ORACLE_SAAS_UNRESTRICTED_FINANCIAL_ROLE = AttackPathsQueryDefinition(
    id="oracle-saas-unrestricted-financial-role",
    name="Oracle Fusion SaaS High-Privilege Account without MFA Enforcement",
    short_description="Find Oracle Fusion ERP/HCM user accounts with financial administrator roles lacking MFA.",
    description="Detect Oracle Fusion SaaS ERP / Financials Cloud user accounts possessing Application Administrator, Financial Controller, or Payroll Manager roles that do not enforce Multi-Factor Authentication (MFA).",
    provider="oracle_saas",
    cypher=f"""
        MATCH (saas:OracleSaaSAccount {{id: $provider_uid}})--(u:OracleSaaSUser)-[:HAS_ROLE]->(r:OracleSaaSRole)
        WHERE r.name IN ['Application Administrator', 'Financial Controller', 'Payroll Manager', 'IT Security Manager']
          AND (u.mfa_enabled = false OR u.is_mfa_active = false)

        OPTIONAL MATCH (u)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN u, r, collect(DISTINCT pf) AS dpf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en/cloud/saas/applications-common/24c/secus/security-overview.html",
    ),
)

ORACLE_SAAS_DATA_EXPORT_EXPOSURE = AttackPathsQueryDefinition(
    id="oracle-saas-data-export-exposure",
    name="Oracle SaaS Bulk Data Export Privilege Exposure",
    short_description="Identify accounts with BIP / FSM Data Export privileges lacking IP whitelisting.",
    description="Find Oracle Cloud SaaS users with BI Publisher (BIP) report export or Functional Setup Manager (FSM) migration privileges accessible outside corporate network IP boundaries.",
    provider="oracle_saas",
    cypher=f"""
        MATCH (saas:OracleSaaSAccount {{id: $provider_uid}})--(u:OracleSaaSUser)-[:HAS_PRIVILEGE]->(priv:OracleSaasPrivilege)
        WHERE priv.name IN ['BIP_DATA_EXPORT', 'FSM_MIGRATION_EXPORT', 'REST_API_ADMIN']
          AND (u.network_restriction_enabled = false OR u.ip_whitelisted = false)

        OPTIONAL MATCH (u)-[pfr:HAS_FINDING]-(pf:{PROWLER_FINDING_LABEL} {{status: 'FAIL'}})

        RETURN u, priv, collect(DISTINCT pf) AS dpf
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en/cloud/saas/financials/",
    ),
)

ORACLE_FUSION_SAAS_QUERIES: list[AttackPathsQueryDefinition] = [
    ORACLE_SAAS_UNRESTRICTED_FINANCIAL_ROLE,
    ORACLE_SAAS_DATA_EXPORT_EXPOSURE,
]
