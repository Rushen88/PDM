from django.db import migrations, transaction
from django.db.models import Max


def populate_missing_item_numbers(apps, schema_editor):
    ProjectItem = apps.get_model('persistence', 'ProjectItem')
    ProjectItemSequence = apps.get_model('persistence', 'ProjectItemSequence')

    with transaction.atomic():
        seq, _ = ProjectItemSequence.objects.select_for_update().get_or_create(key='project_item')

        max_existing = ProjectItem.objects.aggregate(max_item_number=Max('item_number')).get('max_item_number') or 0
        if max_existing > (seq.last_value or 0):
            seq.last_value = max_existing
            seq.save(update_fields=['last_value'])

        missing = ProjectItem.objects.filter(item_number__isnull=True).order_by('created_at', 'id')
        for item in missing.iterator():
            seq.last_value += 1
            item.item_number = seq.last_value
            item.save(update_fields=['item_number'])

        seq.save(update_fields=['last_value'])


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0026_remove_project_code'),
    ]

    operations = [
        migrations.RunPython(populate_missing_item_numbers, migrations.RunPython.noop),
    ]
