from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0025_sync_project_item_sequence'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='project',
            name='code',
        ),
    ]
