from api.attack_paths.queries.types import (
    AttackPathsQueryAttribution,
    AttackPathsQueryDefinition,
    AttackPathsQueryParameterDefinition,
)
from tasks.jobs.attack_paths.config import PROWLER_FINDING_LABEL

ORACLE_SAAS_UNRESTRICTED_FINANCIAL_ROLE = AttackPathsQueryDefinition(
    id="oracle-saas-unrestricted-financial-role",
    name="Oracle Fusion SaaS Security Findings Overview",
    short_description="Find Oracle Fusion ERP/HCM security violations from the last scan.",
    description="Detect Oracle Fusion SaaS ERP / Financials Cloud active security control failures including audit, MFA, and privilege violations discovered during scans.",
    provider="oracle_saas",
    cypher=f"""
        MATCH (pf:{PROWLER_FINDING_LABEL})
        WHERE pf.status = 'FAIL'
        RETURN pf
        LIMIT 25
    """,
    parameters=[],
    attribution=AttackPathsQueryAttribution(
        text="Digital CISO Platform",
        link="https://docs.oracle.com/en/cloud/saas/applications-common/24c/secus/security-overview.html",
    ),
)

ORACLE_SAAS_DATA_EXPORT_EXPOSURE = AttackPathsQueryDefinition(
    id="oracle-saas-data-export-exposure",
    name="Oracle SaaS All Security Control Findings",
    short_description="All Oracle SaaS security findings including passed and failed controls.",
    description="Shows all Oracle Cloud SaaS security findings from the latest scan, including IAM privilege controls, audit trail violations, and configuration gaps.",
    provider="oracle_saas",
    cypher=f"""
        MATCH (pf:{PROWLER_FINDING_LABEL})
        RETURN pf
        LIMIT 30
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
