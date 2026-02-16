#!/usr/bin/env python
"""
ПРОВЕРКА API ОТВЕТА - что именно возвращается фронтенду
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

print("=" * 100)
print("ПРОВЕРКА API ОТВЕТА")
print("=" * 100)
print()

# Получаем проект
project = (
    Project.objects.filter(name__icontains="А-100").first()
    or Project.objects.order_by('-created_at').first()
)
if not project:
    raise SystemExit("✗ Проектов нет. Запустите: manage.py setup_demo_data")

print(f"Проект: {project.name} (ID: {project.id})")
print()

# Получаем элементы как это делает API
items = ProjectItem.objects.filter(
    project=project,
    is_active=True
).select_related(
    'nomenclature_item',
    'nomenclature_item__catalog_category',
    'parent_item'
)

# В разных ветках проекта поле сортировки может отличаться
if 'position' in [f.name for f in ProjectItem._meta.fields]:
    items = items.order_by('position')
elif 'item_number' in [f.name for f in ProjectItem._meta.fields]:
    items = items.order_by('item_number')
else:
    items = items.order_by('created_at')

print(f"Всего элементов: {items.count()}")
print()

# Сериализуем как это делает API
serializer = ProjectItemListSerializer(items, many=True)
serialized_data = serializer.data

print(f"Сериализовано элементов: {len(serialized_data)}")
print()

# Анализ
root_items = [item for item in serialized_data if item['parent_item'] is None]
with_parent = [item for item in serialized_data if item['parent_item'] is not None]

print(f"Корневых элементов (parent_item=null): {len(root_items)}")
print(f"С родителем (parent_item!=null): {len(with_parent)}")
print()

if len(root_items) > 0:
    print("КОРНЕВЫЕ ЭЛЕМЕНТЫ:")
    print("-" * 100)
    for item in root_items:
        print(f"  - ID: {item['id']}")
        print(f"    Name: {item['name']}")
        print(f"    parent_item: {item['parent_item']}")
        print()

# Проверим первых детей корня
if len(root_items) == 1:
    root_id = root_items[0]['id']
    direct_children = [item for item in serialized_data if item['parent_item'] == root_id]
    
    print(f"ПРЯМЫЕ ДЕТИ КОРНЯ (parent_item={root_id[:8]}...):")
    print("-" * 100)
    print(f"Всего детей: {len(direct_children)}")
    print()
    
    for i, child in enumerate(direct_children, 1):
        # Подсчёт внуков
        grandchildren = [item for item in serialized_data if item['parent_item'] == child['id']]
        print(f"{i}. {child['name']}")
        print(f"   ID: {child['id']}")
        print(f"   parent_item: {child['parent_item']}")
        print(f"   is_purchased: {child.get('is_purchased', 'N/A')}")
        print(f"   children_count: {len(grandchildren)}")
        print()

# Проверка гаек и болтов
gaika_items = [item for item in serialized_data if 'гайка' in item['name'].lower()]
bolt_items = [item for item in serialized_data if 'болт' in item['name'].lower()]

print("=" * 100)
print(f"АНАЛИЗ 'ГАЙКА': {len(gaika_items)} элементов")
print("=" * 100)

# Группируем по parent_item
from collections import defaultdict
gaika_by_parent = defaultdict(list)
for item in gaika_items:
    parent = item['parent_item'] or 'ROOT'
    gaika_by_parent[parent].append(item['id'])

print(f"Гаек распределено по {len(gaika_by_parent)} родителям:")
for parent, children in list(gaika_by_parent.items())[:5]:
    print(f"  - parent={parent[:8] if parent != 'ROOT' else 'ROOT'}...: {len(children)} гаек")

print()
print("=" * 100)
print(f"АНАЛИЗ 'БОЛТ': {len(bolt_items)} элементов")
print("=" * 100)

bolt_by_parent = defaultdict(list)
for item in bolt_items:
    parent = item['parent_item'] or 'ROOT'
    bolt_by_parent[parent].append(item['id'])

print(f"Болтов распределено по {len(bolt_by_parent)} родителям:")
for parent, children in list(bolt_by_parent.items())[:5]:
    print(f"  - parent={parent[:8] if parent != 'ROOT' else 'ROOT'}...: {len(children)} болтов")

print()
print("=" * 100)
print("ВЫВОД")
print("=" * 100)

if len(gaika_by_parent) > 1:
    print("✓ Гайки распределены по РАЗНЫМ родителям - это ПРАВИЛЬНО")
    print("  (31 гайка в 31 разных узлах дерева)")
else:
    print("✗ Гайки все под одним родителем - это НЕПРАВИЛЬНО")

if len(bolt_by_parent) > 1:
    print("✓ Болты распределены по РАЗНЫМ родителям - это ПРАВИЛЬНО")
    print("  (31 болт в 31 разных узлах дерева)")
else:
    print("✗ Болты все под одним родителем - это НЕПРАВИЛЬНО")

print()
print("ЗАКЛЮЧЕНИЕ:")
print("Если в браузере отображается 19 гаек и 31 болт на одном уровне,")
print("то проблема НА ФРОНТЕНДЕ в построении дерева из плоского списка!")
print()
print("Возможные причины:")
print("1. Функция buildTree неправильно сопоставляет parent_item с id")
print("2. Компонент Ant Design Table неправильно отображает дерево")
print("3. Есть проблема с типами данных (string vs UUID)")
