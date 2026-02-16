from django.db import migrations, models


def populate_item_numbers(apps, schema_editor):
    ProjectItem = apps.get_model('persistence', 'ProjectItem')
    ProjectItemSequence = apps.get_model('persistence', 'ProjectItemSequence')

    counter = 0
    for item in ProjectItem.objects.all().order_by('created_at', 'id').iterator():
        counter += 1
        ProjectItem.objects.filter(pk=item.pk).update(item_number=counter)

    ProjectItemSequence.objects.update_or_create(
        key='project_item',
        defaults={'last_value': counter},
    )


def rollback_item_numbers(apps, schema_editor):
    ProjectItem = apps.get_model('persistence', 'ProjectItem')
    ProjectItemSequence = apps.get_model('persistence', 'ProjectItemSequence')

    ProjectItem.objects.update(item_number=None)
    ProjectItemSequence.objects.filter(key='project_item').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0021_update_status_references'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectItemSequence',
            fields=[
                ('key', models.CharField(max_length=50, primary_key=True, serialize=False, verbose_name='Ключ')),
                ('last_value', models.PositiveBigIntegerField(default=0, verbose_name='Последнее значение')),
            ],
            options={
                'db_table': 'project_item_sequences',
                'verbose_name': 'Счётчик ID позиций проекта',
                'verbose_name_plural': 'Счётчики ID позиций проекта',
            },
        ),
        migrations.AddField(
            model_name='projectitem',
            name='item_number',
            field=models.PositiveBigIntegerField(blank=True, db_index=True, null=True, unique=True, verbose_name='ID позиции'),
        ),
        migrations.RunPython(populate_item_numbers, rollback_item_numbers),
    ]
