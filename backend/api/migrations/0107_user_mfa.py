import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0106_jira_remediation_execution_models")]

    operations = [
        migrations.CreateModel(
            name="UserMfa",
            fields=[
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True,
                                              related_name="mfa", serialize=False, to=settings.AUTH_USER_MODEL)),
                ("secret", models.BinaryField()),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("last_step", models.BigIntegerField(blank=True, null=True)),
                ("failed_attempts", models.PositiveSmallIntegerField(default=0)),
                ("locked_until", models.DateTimeField(blank=True, null=True)),
            ],
            options={"db_table": "user_mfa"},
        ),
    ]
