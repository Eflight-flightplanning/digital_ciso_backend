from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0109_db_column_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]

