"""
Data migration to populate initial status and problem reason references.
"""
from django.db import migrations


def create_initial_statuses(apps, schema_editor):
    """Create initial manufacturing and purchase statuses."""
    ManufacturingStatus = apps.get_model('persistence', 'ManufacturingStatus')
    PurchaseStatus = apps.get_model('persistence', 'PurchaseStatus')
    ManufacturingProblemReason = apps.get_model('persistence', 'ManufacturingProblemReason')
    PurchaseProblemReason = apps.get_model('persistence', 'PurchaseProblemReason')
    
    # Manufacturing statuses
    manufacturing_statuses = [
        {'code': 'not_started', 'name': 'Не начато', 'color': 'default', 'sort_order': 10, 
         'is_default': True, 'is_completed': False, 'progress_percent': 0, 'is_system': True},
        {'code': 'in_progress', 'name': 'В работе', 'color': 'blue', 'sort_order': 20,
         'is_default': False, 'is_completed': False, 'progress_percent': 50, 'is_system': True},
        {'code': 'waiting_materials', 'name': 'Ожидание материалов', 'color': 'orange', 'sort_order': 25,
         'is_default': False, 'is_completed': False, 'progress_percent': 30,
         'auto_trigger': 'materials_not_delivered', 'is_system': False},
        {'code': 'suspended', 'name': 'Приостановлено', 'color': 'orange', 'sort_order': 30,
         'is_default': False, 'is_completed': False, 'progress_percent': 40, 'is_system': False},
        {'code': 'with_contractor', 'name': 'Передано подрядчику', 'color': 'purple', 'sort_order': 35,
         'is_default': False, 'is_completed': False, 'progress_percent': 50, 'is_system': False},
        {'code': 'from_contractor', 'name': 'Принято от подрядчика', 'color': 'cyan', 'sort_order': 40,
         'is_default': False, 'is_completed': False, 'progress_percent': 90, 'is_system': False},
        {'code': 'quality_check', 'name': 'На контроле качества', 'color': 'geekblue', 'sort_order': 50,
         'is_default': False, 'is_completed': False, 'progress_percent': 95, 'is_system': False},
        {'code': 'completed', 'name': 'Изготовлено', 'color': 'green', 'sort_order': 100,
         'is_default': False, 'is_completed': True, 'progress_percent': 100, 'is_system': True},
        {'code': 'rejected', 'name': 'Брак', 'color': 'red', 'sort_order': 110,
         'is_default': False, 'is_completed': False, 'progress_percent': 0, 'is_system': True},
    ]
    
    for status_data in manufacturing_statuses:
        ManufacturingStatus.objects.get_or_create(
            code=status_data['code'],
            defaults=status_data
        )
    
    # Purchase statuses
    purchase_statuses = [
        {'code': 'not_required', 'name': 'Не требуется', 'color': 'default', 'sort_order': 0,
         'is_default': False, 'is_delivered': False, 'is_not_required': True, 'progress_percent': 100, 'is_system': True},
        {'code': 'pending', 'name': 'Ожидает заказа', 'color': 'default', 'sort_order': 10,
         'is_default': True, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 0, 'is_system': True},
        {'code': 'ordered', 'name': 'Заказано', 'color': 'blue', 'sort_order': 20,
         'is_default': False, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 30, 'is_system': True},
        {'code': 'in_transit', 'name': 'В пути', 'color': 'cyan', 'sort_order': 30,
         'is_default': False, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 60, 'is_system': False},
        {'code': 'partially_delivered', 'name': 'Частично доставлено', 'color': 'orange', 'sort_order': 40,
         'is_default': False, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 70, 'is_system': False},
        {'code': 'delivered', 'name': 'Доставлено', 'color': 'green', 'sort_order': 100,
         'is_default': False, 'is_delivered': True, 'is_not_required': False, 'progress_percent': 100, 'is_system': True},
        {'code': 'delayed', 'name': 'Задержка поставщика', 'color': 'red', 'sort_order': 50,
         'is_default': False, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 30, 'is_system': False},
        {'code': 'cancelled', 'name': 'Отменено', 'color': 'red', 'sort_order': 110,
         'is_default': False, 'is_delivered': False, 'is_not_required': False, 'progress_percent': 0, 'is_system': True},
    ]
    
    for status_data in purchase_statuses:
        PurchaseStatus.objects.get_or_create(
            code=status_data['code'],
            defaults=status_data
        )
    
    # Manufacturing problem reasons
    manufacturing_reasons = [
        {'code': 'materials_shortage', 'name': 'Нехватка материалов', 'severity': 3, 'sort_order': 10,
         'suggested_action': 'Проверить статус закупок, ускорить доставку'},
        {'code': 'equipment_failure', 'name': 'Поломка оборудования', 'severity': 3, 'sort_order': 20,
         'suggested_action': 'Вызвать ремонтную службу'},
        {'code': 'quality_issues', 'name': 'Проблемы с качеством', 'severity': 2, 'sort_order': 30,
         'suggested_action': 'Провести анализ, скорректировать техпроцесс'},
        {'code': 'design_changes', 'name': 'Изменения в конструкции', 'severity': 2, 'sort_order': 40,
         'suggested_action': 'Дождаться обновлённой КД'},
        {'code': 'personnel_shortage', 'name': 'Нехватка персонала', 'severity': 2, 'sort_order': 50,
         'suggested_action': 'Привлечь дополнительных специалистов'},
        {'code': 'tooling_issues', 'name': 'Проблемы с оснасткой', 'severity': 2, 'sort_order': 60,
         'suggested_action': 'Заказать/изготовить оснастку'},
        {'code': 'contractor_delay', 'name': 'Задержка подрядчика', 'severity': 3, 'sort_order': 70,
         'suggested_action': 'Связаться с подрядчиком, уточнить сроки'},
        {'code': 'waiting_approval', 'name': 'Ожидание согласования', 'severity': 1, 'sort_order': 80,
         'suggested_action': 'Ускорить процесс согласования'},
        {'code': 'other', 'name': 'Прочие причины', 'severity': 1, 'sort_order': 100,
         'suggested_action': 'Указать в комментарии'},
    ]
    
    for reason_data in manufacturing_reasons:
        ManufacturingProblemReason.objects.get_or_create(
            code=reason_data['code'],
            defaults=reason_data
        )
    
    # Purchase problem reasons
    purchase_reasons = [
        {'code': 'supplier_delay', 'name': 'Задержка поставщика', 'severity': 2, 'sort_order': 10,
         'suggested_action': 'Связаться с поставщиком, уточнить сроки'},
        {'code': 'out_of_stock', 'name': 'Нет в наличии у поставщика', 'severity': 3, 'sort_order': 20,
         'suggested_action': 'Найти альтернативного поставщика'},
        {'code': 'quality_reject', 'name': 'Брак при приёмке', 'severity': 3, 'sort_order': 30,
         'suggested_action': 'Оформить рекламацию, заказать повторно'},
        {'code': 'price_increase', 'name': 'Повышение цены', 'severity': 2, 'sort_order': 40,
         'suggested_action': 'Согласовать новую цену или найти альтернативу'},
        {'code': 'wrong_item', 'name': 'Неверная поставка', 'severity': 2, 'sort_order': 50,
         'suggested_action': 'Вернуть и заказать правильную позицию'},
        {'code': 'documents_missing', 'name': 'Отсутствуют документы', 'severity': 1, 'sort_order': 60,
         'suggested_action': 'Запросить документы у поставщика'},
        {'code': 'customs_delay', 'name': 'Задержка на таможне', 'severity': 2, 'sort_order': 70,
         'suggested_action': 'Связаться с брокером'},
        {'code': 'payment_issues', 'name': 'Проблемы с оплатой', 'severity': 2, 'sort_order': 80,
         'suggested_action': 'Решить вопрос с бухгалтерией'},
        {'code': 'other', 'name': 'Прочие причины', 'severity': 1, 'sort_order': 100,
         'suggested_action': 'Указать в комментарии'},
    ]
    
    for reason_data in purchase_reasons:
        PurchaseProblemReason.objects.get_or_create(
            code=reason_data['code'],
            defaults=reason_data
        )


def reverse_initial_statuses(apps, schema_editor):
    """Remove initial statuses (for rollback)."""
    ManufacturingStatus = apps.get_model('persistence', 'ManufacturingStatus')
    PurchaseStatus = apps.get_model('persistence', 'PurchaseStatus')
    ManufacturingProblemReason = apps.get_model('persistence', 'ManufacturingProblemReason')
    PurchaseProblemReason = apps.get_model('persistence', 'PurchaseProblemReason')
    
    # Delete non-system statuses only
    ManufacturingStatus.objects.filter(is_system=False).delete()
    PurchaseStatus.objects.filter(is_system=False).delete()
    ManufacturingProblemReason.objects.all().delete()
    PurchaseProblemReason.objects.all().delete()


class Migration(migrations.Migration):
    
    dependencies = [
        ('persistence', '0009_historicalmanufacturingproblemreason_and_more'),
    ]
    
    operations = [
        migrations.RunPython(create_initial_statuses, reverse_initial_statuses),
    ]
