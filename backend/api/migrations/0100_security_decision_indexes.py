from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0099_ai_assessment_indexes"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="securitydecision",
            index=models.Index(
                fields=["tenant_id", "finding_id"],
                name="sec_dec_tenant_find_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="securitydecision",
            index=models.Index(
                fields=["tenant_id", "priority", "human_review_status"],
                name="sec_dec_tenant_prio_rev_idx",
            ),
        ),
    ]
