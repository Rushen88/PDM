"""
Update manufacturing/purchase statuses and problem reasons to ERP-required set.
"""
from django.db import migrations


def update_statuses(apps, schema_editor):
    ManufacturingStatus = apps.get_model('persistence', 'ManufacturingStatus')
    PurchaseStatus = apps.get_model('persistence', 'PurchaseStatus')
    ProblemReason = apps.get_model('persistence', 'ProblemReason')

    # Очистить текущие статусы
    ManufacturingStatus.objects.all().delete()
    PurchaseStatus.objects.all().delete()

    # Статусы собственного изготовления
    manufacturing_statuses = [
        {
            'code': 'not_started',
            'name': 'Не начато',
            'color': 'default',
            'sort_order': 10,
            'is_default': True,
            'is_completed': False,
            'progress_percent': 0,
            'is_system': True,
            'is_active': True,
        },
        {
            'code': 'in_progress',
            'name': 'В работе',
            'color': 'blue',
            'sort_order': 20,
            'is_default': False,
            'is_completed': False,
            'progress_percent': 50,
            'is_system': True,
            'is_active': True,
        },
        {
            'code': 'suspended',
            'name': 'Приостановлено',
            'color': 'orange',
            'sort_order': 30,
            'is_default': False,
            'is_completed': False,
            'progress_percent': 0,
            'is_system': True,
            'is_active': True,
        },
        {
            'code': 'completed',
            'name': 'Изготовлено',
            'color': 'green',
            'sort_order': 100,
            'is_default': False,
            'is_completed': True,
            'progress_percent': 100,
            'is_system': True,
            'is_active': True,
        },
    ]

    for status in manufacturing_statuses:
        ManufacturingStatus.objects.create(**status)

    # Статусы закупки
    purchase_statuses = [
        {
            'code': 'waiting_order',
            'name': 'Ожидает заказа',
            'color': 'default',
            'sort_order': 10,
            'is_default': True,
            'is_delivered': False,
            'is_not_required': False,
            'progress_percent': 0,
            'is_system': True,
            'is_active': True,
        },
        {
            'code': 'in_order',
            'name': 'В заказе',
            'color': 'blue',
            'sort_order': 20,
            'is_default': False,
            'is_delivered': False,
            'is_not_required': False,
            'progress_percent': 50,
            'is_system': True,
            'is_active': True,
        },
        {
            'code': 'closed',
            'name': 'Закрыта',
            'color': 'green',
            'sort_order': 100,
            'is_default': False,
            'is_delivered': True,
            'is_not_required': False,
            'progress_percent': 100,
            'is_system': True,
            'is_active': True,
        },
    ]

    for status in purchase_statuses:
        PurchaseStatus.objects.create(**status)

    # Причины проблем (закупки/потребности) — только системные
    ProblemReason.objects.all().delete()
    ProblemReason.objects.create(
        code='not_ordered_on_time',
        name='Не заказано вовремя',
        description='Дата "Заказать до" прошла, заказ не оформлен',
        is_system=True,
        is_active=True,
    )
    ProblemReason.objects.create(
        code='delivery_delay',
        name='Задержка поставки',
        description='Срок поставки прошёл, поступление не подтверждено',
        is_system=True,
        is_active=True,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0020_add_problem_fields_to_project_item'),
    ]

    operations = [
        migrations.RunPython(update_statuses, noop_reverse),
    ]
