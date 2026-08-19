import api.db_utils
from django.db import migrations


class Migration(migrations.Migration):
    """Add oracle_saas as a new provider type for Oracle Fusion ERP / HCM / NetSuite scanning."""

    dependencies = [
        ("api", "0104_securitydecision_jira_ticket_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="provider",
            name="provider",
            field=api.db_utils.ProviderEnumField(
                choices=[
                    ("aws", "AWS"),
                    ("azure", "Azure"),
                    ("gcp", "GCP"),
                    ("kubernetes", "Kubernetes"),
                    ("m365", "M365"),
                    ("github", "GitHub"),
                    ("mongodbatlas", "MongoDB Atlas"),
                    ("iac", "IaC"),
                    ("oraclecloud", "Oracle Cloud Infrastructure"),
                    ("alibabacloud", "Alibaba Cloud"),
                    ("cloudflare", "Cloudflare"),
                    ("openstack", "OpenStack"),
                    ("image", "Image"),
                    ("googleworkspace", "Google Workspace"),
                    ("vercel", "Vercel"),
                    ("okta", "Okta"),
                    ("oracle_saas", "Oracle SaaS / ERP"),
                ],
                default="aws",
            ),
        ),
        migrations.RunSQL(
            "ALTER TYPE provider ADD VALUE IF NOT EXISTS 'oracle_saas';",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
