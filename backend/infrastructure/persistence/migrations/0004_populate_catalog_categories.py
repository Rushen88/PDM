# Generated manually - populate catalog categories and migrate data

from django.db import migrations


def create_catalog_categories(apps, schema_editor):
    """
    Создаёт начальные виды справочников и мигрирует существующие данные.
    """
    CatalogCategory = apps.get_model('persistence', 'CatalogCategory')
    NomenclatureItem = apps.get_model('persistence', 'NomenclatureItem')
    NomenclatureType = apps.get_model('persistence', 'NomenclatureType')
    
    # Определяем виды справочников
    categories_data = [
        # Закупаемые (is_purchased=True)
        {'code': 'material', 'name': 'Материалы', 'is_purchased': True, 'sort_order': 1},
        {'code': 'standard_product', 'name': 'Стандартные изделия', 'is_purchased': True, 'sort_order': 2},
        {'code': 'other_product', 'name': 'Прочие изделия', 'is_purchased': True, 'sort_order': 3},
        # Изготавливаемые (is_purchased=False)
        {'code': 'part', 'name': 'Детали', 'is_purchased': False, 'sort_order': 10},
        {'code': 'assembly_unit', 'name': 'Сборочные единицы', 'is_purchased': False, 'sort_order': 20},
        {'code': 'subsystem', 'name': 'Подсистемы', 'is_purchased': False, 'sort_order': 30},
        {'code': 'system', 'name': 'Системы', 'is_purchased': False, 'sort_order': 40},
        {'code': 'stand', 'name': 'Стенды', 'is_purchased': False, 'sort_order': 50},
    ]
    
    # Создаём категории и сохраняем их для дальнейшего использования
    categories = {}
    for cat_data in categories_data:
        cat, created = CatalogCategory.objects.get_or_create(
            code=cat_data['code'],
            defaults={
                'name': cat_data['name'],
                'is_purchased': cat_data['is_purchased'],
                'sort_order': cat_data['sort_order'],
            }
        )
        categories[cat_data['code']] = cat
    
    # Настраиваем допустимые дочерние виды после создания всех категорий
    # Стенд может содержать: системы, подсистемы, сборочные единицы, детали, и все закупаемые
    stand = categories['stand']
    stand.allowed_children.set([
        categories['system'],
        categories['subsystem'],
        categories['assembly_unit'],
        categories['part'],
        categories['material'],
        categories['standard_product'],
        categories['other_product'],
    ])
    
    # Система может содержать: подсистемы, сборочные единицы, детали, и все закупаемые
    system = categories['system']
    system.allowed_children.set([
        categories['subsystem'],
        categories['assembly_unit'],
        categories['part'],
        categories['material'],
        categories['standard_product'],
        categories['other_product'],
    ])
    
    # Подсистема может содержать: сборочные единицы, детали, и все закупаемые
    subsystem = categories['subsystem']
    subsystem.allowed_children.set([
        categories['assembly_unit'],
        categories['part'],
        categories['material'],
        categories['standard_product'],
        categories['other_product'],
    ])
    
    # Сборочная единица может содержать: другие сборочные единицы, детали, и все закупаемые
    assembly_unit = categories['assembly_unit']
    assembly_unit.allowed_children.set([
        categories['assembly_unit'],  # Вложенные сборочные единицы
        categories['part'],
        categories['material'],
        categories['standard_product'],
        categories['other_product'],
    ])
    
    # Деталь может содержать только материалы
    part = categories['part']
    part.allowed_children.set([
        categories['material'],
    ])
    
    # Закупаемые категории не могут иметь дочерние элементы
    # (allowed_children остаётся пустым)


def reverse_create_catalog_categories(apps, schema_editor):
    """
    Откат: удаляем все связи и категории.
    """
    CatalogCategory = apps.get_model('persistence', 'CatalogCategory')
    # Удаляем все категории (каскадно удалит связи)
    CatalogCategory.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0003_catalog_architecture_redesign'),
    ]

    operations = [
        migrations.RunPython(
            create_catalog_categories,
            reverse_create_catalog_categories,
        ),
    ]
