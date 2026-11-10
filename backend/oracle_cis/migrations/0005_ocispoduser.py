from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("oracle_cis", "0004_alter_ocisidentity_kind_ocissnapshot")]

    operations = [
        migrations.CreateModel(
            name="OcisPodUser",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("tenant_id", models.UUIDField(db_index=True)),
                ("username", models.CharField(max_length=255)),
                ("position", models.PositiveIntegerField(default=0)),
                ("data", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "oracle_cis_pod_user", "ordering": ["position"]},
        ),
        migrations.AddConstraint(
            model_name="ocispoduser",
            constraint=models.UniqueConstraint(fields=("tenant_id", "username"), name="oracle_cis_pod_user_once"),
        ),
    ]
