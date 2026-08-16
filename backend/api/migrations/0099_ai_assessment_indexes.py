from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0098_ai_assessment_security_decision"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="aiassessment",
            index=models.Index(
                fields=["tenant_id", "finding_id"],
                name="ai_assess_tenant_find_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="aiassessment",
            index=models.Index(
                fields=["tenant_id", "fingerprint"],
                name="ai_assess_tenant_fp_idx",
            ),
        ),
    ]
