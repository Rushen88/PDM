"""Rename ERP purchase status label.

System purchase status `closed` was previously displayed as "Закрыта".
Business meaning: item is physically in stock, so UI should show "На складе".

This migration updates the reference table used by Settings -> Purchase Statuses.
"""

from django.db import migrations


def rename_closed_status(apps, schema_editor):
    PurchaseStatus = apps.get_model('persistence', 'PurchaseStatus')

    # Update system/reference status name.
    PurchaseStatus.objects.filter(code='closed').update(name='На складе')


def noop_reverse(apps, schema_editor):
    # Keep as no-op: renaming back is not needed.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0022_add_project_item_number'),
    ]

    operations = [
        migrations.RunPython(rename_closed_status, noop_reverse),
    ]
