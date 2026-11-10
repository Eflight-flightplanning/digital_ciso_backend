"""Some databases hold required columns the code never sets, which blocks creating users and clients.

Give them safe defaults. Databases without these columns are left alone.
"""
from django.db import migrations

DEFAULTS = [("tenants", "is_active", "true"), ("users", "is_staff", "false"), ("users", "is_superuser", "false")]


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for table, column, value in DEFAULTS:
            cursor.execute("SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
                           [table, column])
            if cursor.fetchone():
                cursor.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {value}")


class Migration(migrations.Migration):
    dependencies = [("api", "0108_tenant_rls_gaps")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
