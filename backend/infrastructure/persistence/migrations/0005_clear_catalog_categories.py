# Generated manually - clear initial catalog categories for manual setup

from django.db import migrations


def clear_catalog_categories(apps, schema_editor):
    """
    Очищает начальные виды справочников, чтобы пользователь мог создать их вручную.
    """
    CatalogCategory = apps.get_model('persistence', 'CatalogCategory')
    NomenclatureType = apps.get_model('persistence', 'NomenclatureType')
    
    # Удаляем типы номенклатуры
    NomenclatureType.objects.all().delete()
    
    # Удаляем категории
    CatalogCategory.objects.all().delete()


def reverse_clear(apps, schema_editor):
    """
    Откат: пусто, данные были удалены.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('persistence', '0004_populate_catalog_categories'),
    ]

    operations = [
        migrations.RunPython(
            clear_catalog_categories,
            reverse_clear,
        ),
    ]
