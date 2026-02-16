#!/usr/bin/env python
"""
ГЛУБОКИЙ АНАЛИЗ СТРУКТУРЫ ПРОЕКТА
Проверка ВСЕХ аспектов: БД, parent_id, дубликаты, связи
"""

import os
import sys
import django
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem

print("=" * 100)
print("ГЛУБОКИЙ АНАЛИЗ СТРУКТУРЫ ПРОЕКТА СТЕНД 001")
print("=" * 100)
print()

# Получаем проект
try:
    project = Project.objects.get(code="СТЕНД 001")
except Project.DoesNotExist:
    # Попробуем найти по имени
    project = Project.objects.filter(name__icontains="СТЕНД 001").first()
    if not project:
        # Берём первый проект
        project = Project.objects.first()

print(f"Проект: {project.name} (ID: {project.id}, Code: {project.code})")
print()

# Получаем ВСЕ элементы проекта
all_items = list(ProjectItem.objects.filter(project=project).select_related(
    'nomenclature_item', 
    'parent_item',
    'nomenclature_item__catalog_category'
))

print(f"Всего элементов в БД: {len(all_items)}")
print()

# === АНАЛИЗ 1: Проверка уникальности ID ===
print("=" * 100)
print("АНАЛИЗ 1: УНИКАЛЬНОСТЬ ID")
print("=" * 100)

ids = [item.id for item in all_items]
id_counts = defaultdict(int)
for item_id in ids:
    id_counts[item_id] += 1

duplicates = {k: v for k, v in id_counts.items() if v > 1}
if duplicates:
    print(f"❌ НАЙДЕНЫ ДУБЛИКАТЫ ID: {duplicates}")
else:
    print("✓ Все ID уникальны")
print()

# === АНАЛИЗ 2: Проверка parent_id связей ===
print("=" * 100)
print("АНАЛИЗ 2: PARENT_ID СВЯЗИ")
print("=" * 100)

# Корневые элементы (без родителя)
root_items = [item for item in all_items if item.parent_item_id is None]
print(f"Корневых элементов (parent_id=NULL): {len(root_items)}")
for item in root_items:
    print(f"  - {item.nomenclature_item.name if item.nomenclature_item else 'N/A'} (ID: {item.id})")
print()

# Проверка что все parent_id существуют
valid_ids = set(ids)
invalid_parents = []
for item in all_items:
    if item.parent_item_id and item.parent_item_id not in valid_ids:
        invalid_parents.append((item.id, item.parent_item_id))

if invalid_parents:
    print(f"❌ НАЙДЕНЫ НЕСУЩЕСТВУЮЩИЕ PARENT_ID:")
    for child_id, parent_id in invalid_parents:
        print(f"  - Элемент {child_id} ссылается на несуществующего родителя {parent_id}")
else:
    print("✓ Все parent_id корректны")
print()

# === АНАЛИЗ 3: Дерево детей ===
print("=" * 100)
print("АНАЛИЗ 3: ДЕРЕВО ДЕТЕЙ")
print("=" * 100)

# Строим карту детей
children_map = defaultdict(list)
for item in all_items:
    if item.parent_item_id:
        children_map[item.parent_item_id].append(item)

# Анализ корня
if len(root_items) == 1:
    root = root_items[0]
    root_name = root.nomenclature_item.name if root.nomenclature_item else 'N/A'
    direct_children = children_map[root.id]
    
    print(f"✓ Корень: {root_name} (ID: {root.id})")
    print(f"✓ Прямых детей у корня: {len(direct_children)}")
    print()
    print("Прямые дети корня:")
    print("-" * 100)
    
    for i, child in enumerate(direct_children, 1):
        child_name = child.nomenclature_item.name if child.nomenclature_item else 'N/A'
        grandchildren = children_map[child.id]
        print(f"{i}. {child_name} (ID: {child.id}, parent_id: {child.parent_item_id})")
        print(f"   Дочерних элементов: {len(grandchildren)}")
    
    print()
else:
    print(f"❌ ПРОБЛЕМА: Найдено {len(root_items)} корневых элементов вместо 1")
print()

# === АНАЛИЗ 4: Дубликаты имен ===
print("=" * 100)
print("АНАЛИЗ 4: ДУБЛИКАТЫ ИМЕН")
print("=" * 100)

name_counts = defaultdict(list)
for item in all_items:
    name = item.nomenclature_item.name if item.nomenclature_item else 'N/A'
    name_counts[name].append(item.id)

duplicated_names = {name: ids for name, ids in name_counts.items() if len(ids) > 1}
if duplicated_names:
    print(f"⚠ НАЙДЕНЫ ПОВТОРЯЮЩИЕСЯ ИМЕНА:")
    for name, item_ids in duplicated_names.items():
        print(f"  - '{name}': {len(item_ids)} элементов")
        print(f"    IDs: {item_ids}")
        # Показываем parent_id для каждого
        for item_id in item_ids:
            item = next(i for i in all_items if i.id == item_id)
            print(f"      ID {item_id}: parent_id={item.parent_item_id}")
else:
    print("✓ Нет дубликатов имен")
print()

# === АНАЛИЗ 5: Специальная проверка "гайка" и "болт" ===
print("=" * 100)
print("АНАЛИЗ 5: АНАЛИЗ 'ГАЙКА' И 'БОЛТ'")
print("=" * 100)

gaika_items = [item for item in all_items if item.nomenclature_item and 'гайка' in item.nomenclature_item.name.lower()]
bolt_items = [item for item in all_items if item.nomenclature_item and 'болт' in item.nomenclature_item.name.lower()]

print(f"Элементов с именем 'гайка': {len(gaika_items)}")
if gaika_items:
    print("Детали:")
    for item in gaika_items[:5]:  # Показываем первые 5
        print(f"  - ID: {item.id}, parent_id: {item.parent_item_id}, name: {item.nomenclature_item.name}")
print()

print(f"Элементов с именем 'болт': {len(bolt_items)}")
if bolt_items:
    print("Детали:")
    for item in bolt_items[:5]:  # Показываем первые 5
        print(f"  - ID: {item.id}, parent_id: {item.parent_item_id}, name: {item.nomenclature_item.name}")
print()

# === АНАЛИЗ 6: Граф связей (цикличность) ===
print("=" * 100)
print("АНАЛИЗ 6: ПРОВЕРКА НА ЦИКЛЫ В ГРАФЕ")
print("=" * 100)

def has_cycle(item_id, visited, rec_stack, parent_map):
    """Проверка на циклы в графе"""
    visited.add(item_id)
    rec_stack.add(item_id)
    
    if item_id in parent_map:
        parent_id = parent_map[item_id]
        if parent_id not in visited:
            if has_cycle(parent_id, visited, rec_stack, parent_map):
                return True
        elif parent_id in rec_stack:
            return True
    
    rec_stack.remove(item_id)
    return False

parent_map = {item.id: item.parent_item_id for item in all_items if item.parent_item_id}
visited = set()
cycles_found = False

for item in all_items:
    if item.id not in visited:
        if has_cycle(item.id, visited, set(), parent_map):
            cycles_found = True
            print(f"❌ НАЙДЕН ЦИКЛ для элемента ID: {item.id}")

if not cycles_found:
    print("✓ Циклов в графе не обнаружено")
print()

# === ЗАКЛЮЧЕНИЕ ===
print("=" * 100)
print("ЗАКЛЮЧЕНИЕ")
print("=" * 100)
print()
print(f"Всего элементов: {len(all_items)}")
print(f"Корневых элементов: {len(root_items)}")
print(f"Элементов 'гайка': {len(gaika_items)}")
print(f"Элементов 'болт': {len(bolt_items)}")
print(f"Уникальных имен: {len(name_counts)}")
print(f"Дубликатов имен: {len(duplicated_names)}")
print()

if len(root_items) == 1 and len(children_map[root_items[0].id]) == 8:
    print("✅ СТРУКТУРА В БД КОРРЕКТНА!")
    print("   Проблема скорее всего на фронтенде в построении дерева")
else:
    print("❌ ПРОБЛЕМА В СТРУКТУРЕ БД!")
    print("   Нужно исправить данные в базе")
