"""Row-level security for the client tables that had none."""
from django.conf import settings
from django.db import migrations

# Direct: each row names its client.
TENANT_TABLES = [
    "ciso_advisor_conversations", "customer_billing_records", "decision_log", "finding_ai_analyses",
    "remediation_playbooks", "tenant_llm_configs",
    "nca_assessment", "nca_audit_log", "nca_control_comment", "nca_control_review", "nca_manual_evidence",
    "nca_remediation",
    "oracle_cis_identity", "oracle_cis_jira_ticket", "oracle_cis_remediation", "oracle_cis_run",
    "oracle_cis_snapshot", "oracle_cis_pod_user",
]
# Indirect: a row belongs to whichever client owns its parent.
CHILD_TABLES = {
    "nca_check_run": ("assessment_id", "nca_assessment"),
    "nca_control_result": ("assessment_id", "nca_assessment"),
    "nca_finding": ("assessment_id", "nca_assessment"),
    "nca_subcontrol_result": ("assessment_id", "nca_assessment"),
    "oracle_cis_result": ("run_id", "oracle_cis_run"),
}
CURRENT_TENANT = "NULLIF(current_setting('api.tenant_id', true), '')::uuid"
CURRENT_USER = "NULLIF(current_setting('api.user_id', true), '')::uuid"


def _protect(cursor, table, role, rule):
    cursor.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS {role}_{table}_client ON {table};
        CREATE POLICY {role}_{table}_client ON {table} FOR ALL TO {role} USING ({rule}) WITH CHECK ({rule});
    """)


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    role = settings.DATABASES["default"]["USER"]
    with schema_editor.connection.cursor() as cursor:
        for table in TENANT_TABLES:
            _protect(cursor, table, role, f"tenant_id = {CURRENT_TENANT}")
        for table, (column, parent) in CHILD_TABLES.items():
            _protect(cursor, table, role, f"EXISTS (SELECT 1 FROM {parent} p WHERE p.id = {table}.{column})")
        # A member sees their client's list, and their own memberships when choosing a client.
        _protect(cursor, "memberships", role, f"tenant_id = {CURRENT_TENANT} OR user_id = {CURRENT_USER}")


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    role = settings.DATABASES["default"]["USER"]
    with schema_editor.connection.cursor() as cursor:
        for table in [*TENANT_TABLES, *CHILD_TABLES, "memberships"]:
            cursor.execute(f"""
                DROP POLICY IF EXISTS {role}_{table}_client ON {table};
                ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;
                ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
            """)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0107_user_mfa"),
        ("nca", "0002_ncasubcontrolresult"),
        ("oracle_cis", "0005_ocispoduser"),
    ]
    operations = [migrations.RunPython(forwards, backwards)]
