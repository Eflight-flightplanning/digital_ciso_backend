import uuid

from django.conf import settings
from django.db import migrations, models

TABLES = ["client_store_container", "client_store_file"]
RULE = "tenant_id = NULLIF(current_setting('api.tenant_id', true), '')::uuid"


def protect(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    role = settings.DATABASES["default"]["USER"]
    with schema_editor.connection.cursor() as cursor:
        for table in TABLES:
            cursor.execute(f"""
                ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
                ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS {role}_{table}_client ON {table};
                CREATE POLICY {role}_{table}_client ON {table} FOR ALL TO {role} USING ({RULE}) WITH CHECK ({RULE});
                GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {role};
            """)


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ClientContainer",
            fields=[
                ("tenant_id", models.UUIDField(primary_key=True, serialize=False)),
                ("backend", models.CharField(max_length=16)),
                ("name", models.CharField(max_length=63, unique=True)),
                ("encryption_scope", models.CharField(blank=True, default="", max_length=63)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "client_store_container"},
        ),
        migrations.CreateModel(
            name="ClientFile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tenant_id", models.UUIDField(db_index=True)),
                ("category", models.CharField(max_length=40)),
                ("key", models.CharField(max_length=300)),
                ("name", models.CharField(max_length=255)),
                ("size", models.BigIntegerField(default=0)),
                ("sha256", models.CharField(blank=True, default="", max_length=64)),
                ("content_type", models.CharField(blank=True, default="", max_length=100)),
                ("uploaded_by", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "client_store_file", "ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="clientfile",
            constraint=models.UniqueConstraint(fields=("tenant_id", "key"), name="client_store_file_once"),
        ),
        migrations.AddIndex(
            model_name="clientfile",
            index=models.Index(fields=["tenant_id", "category"], name="client_store_file_category"),
        ),
        migrations.RunPython(protect, migrations.RunPython.noop),
    ]
