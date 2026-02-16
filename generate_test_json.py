#!/usr/bin/env python
"""
СИМУЛЯЦИЯ РАБОТЫ buildTree НА ФРОНТЕНДЕ
Сгенерирует JSON который можно вставить в браузер для тестирования
"""

import os
import sys
import django
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem
from presentation.api.v1.serializers.project import ProjectItemListSerializer
from rest_framework.renderers import JSONRenderer

# Получаем проект
project = Project.objects.filter(name__icontains="СТЕНД 001").first()

# Получаем элементы
items = ProjectItem.objects.filter(
    project=project,
    is_active=True
).select_related(
    'nomenclature_item',
    'nomenclature_item__catalog_category',
    'parent_item'
).order_by('position')

# Сериализуем
serializer = ProjectItemListSerializer(items, many=True)
# Используем DRF's JSONRenderer для правильной сериализации UUID
json_data = JSONRenderer().render(serializer.data).decode('utf-8')
data = json.loads(json_data)

# Сохраним JSON для тестирования
output = {
    "count": len(data),
    "next": None,
    "previous": None,
    "results": data
}

# Сохраняем в файл
with open('test_api_response.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"✓ Сохранено {len(data)} элементов в test_api_response.json")
print()

# Анализ для проверки
print("Анализ данных:")
print(f"- Всего элементов: {len(data)}")
print(f"- Корневых (parent_item=null): {sum(1 for item in data if item['parent_item'] is None)}")
print()

# Проверим типы
if len(data) > 0:
    sample = data[0]
    print("Типы полей в первом элементе:")
    print(f"- id: {type(sample['id']).__name__} = '{sample['id']}'")
    print(f"- parent_item: {type(sample['parent_item']).__name__} = '{sample['parent_item']}'")
    print()
    
    # Найдём элемент с родителем
    with_parent = next((item for item in data if item['parent_item']), None)
    if with_parent:
        print("Элемент с родителем:")
        print(f"- id: {type(with_parent['id']).__name__} = '{with_parent['id']}'")
        print(f"- parent_item: {type(with_parent['parent_item']).__name__} = '{with_parent['parent_item']}'")
        print()
        
        # КРИТИЧНО: Проверим можно ли найти родителя
        parent_id = with_parent['parent_item']
        parent_found = any(item['id'] == parent_id for item in data)
        print(f"Родитель найден по ID: {parent_found}")
        
        if not parent_found:
            print(f"✗ ПРОБЛЕМА: Родитель с ID '{parent_id}' НЕ НАЙДЕН!")
            print("  Возможные причины:")
            print("  - Типы данных не совпадают (string vs UUID)")
            print("  - Некорректная сериализация UUID")
        else:
            print("✓ Родитель успешно найден")

print()
print("Теперь можно:")
print("1. Открыть test_api_response.json")
print("2. Скопировать results в консоль браузера")
print("3. Протестировать buildTree вручную")
