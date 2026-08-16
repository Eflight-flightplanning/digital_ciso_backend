import uuid

import api.rls
import django.contrib.postgres.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0097_attack_paths_scan_db_defaults"),
    ]

    operations = [
        # ── AIAssessment ─────────────────────────────────────────────
        migrations.CreateModel(
            name="AIAssessment",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("finding_id", models.UUIDField(db_index=True)),
                ("summary", models.TextField()),
                ("domain", models.CharField(max_length=50)),
                ("exposure", models.CharField(max_length=50)),
                ("root_cause", models.TextField()),
                ("technical_impact", models.TextField()),
                ("business_impact", models.TextField()),
                ("attack_scenario", models.TextField()),
                (
                    "remediation",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(), default=list, size=None
                    ),
                ),
                (
                    "verification",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(), default=list, size=None
                    ),
                ),
                (
                    "unknowns",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(), default=list, size=None
                    ),
                ),
                ("rationale_summary", models.TextField()),
                ("confidence", models.FloatField(default=0.5)),
                ("model", models.CharField(default="claude", max_length=50)),
                ("prompt_version", models.CharField(default="1.0.0", max_length=20)),
                ("fingerprint", models.CharField(db_index=True, max_length=64)),
                ("inserted_at", models.DateTimeField(auto_now_add=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="api.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "ai_assessments",
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="aiassessment",
            constraint=api.rls.RowLevelSecurityConstraint(
                "tenant_id",
                name="rls_on_aiassessment",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ),
        # ── SecurityDecision ─────────────────────────────────────────
        migrations.CreateModel(
            name="SecurityDecision",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("finding_id", models.UUIDField(db_index=True)),
                (
                    "assessment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="decisions",
                        to="api.aiassessment",
                    ),
                ),
                ("risk_score", models.IntegerField()),
                ("risk_level", models.CharField(max_length=20)),
                ("decision", models.CharField(max_length=50)),
                ("priority", models.CharField(max_length=5)),
                ("reason", models.TextField()),
                (
                    "recommended_owner",
                    models.CharField(default="Security Team", max_length=100),
                ),
                ("sla_hours", models.IntegerField(default=72)),
                (
                    "human_review_status",
                    models.CharField(default="PENDING", max_length=20),
                ),
                (
                    "reviewed_by",
                    models.CharField(blank=True, max_length=100, null=True),
                ),
                (
                    "reviewed_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "remediation_status",
                    models.CharField(default="PENDING", max_length=50),
                ),
                (
                    "applied_policy_rules",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(max_length=100),
                        default=list,
                        size=None,
                    ),
                ),
                ("inserted_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="api.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "security_decisions",
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="securitydecision",
            constraint=api.rls.RowLevelSecurityConstraint(
                "tenant_id",
                name="rls_on_securitydecision",
                statements=["SELECT", "INSERT", "UPDATE", "DELETE"],
            ),
        ),
    ]
