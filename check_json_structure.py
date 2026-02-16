#!/usr/bin/env python3
"""Анализ JSON структуры для отладки."""
import json

data = json.load(open('D:/B2B/PDM/test_api_response.json'))
results = data['results']

print(f"Всего элементов: {len(results)}")

# Найти корень
roots_null = [r for r in results if r['parent_item'] is None]
print(f"Элементов с parent_item=null: {len(roots_null)}")

root = roots_null[0]
root_id = root['id']
print(f"Корень: {root['name']} (id: {root_id})")

# Найти прямых детей корня
children = [r for r in results if r['parent_item'] == root_id]
print(f"Прямых детей в JSON: {len(children)}")
for c in children:
    print(f"  - {c['name']}")

print()

# Теперь проверим buildTree логику
print("=== Симуляция buildTree ===")
item_map = {}
tree_roots = []

for item in results:
    item_map[item['id']] = {'item': item, 'children': []}

found_parent = 0
not_found_parent = 0

for item in results:
    item_id = item['id']
    parent_id = item['parent_item']
    
    if parent_id:
        if parent_id in item_map:
            item_map[parent_id]['children'].append(item)
            found_parent += 1
        else:
            print(f"ORPHAN: {item['name']} -> parent {parent_id} NOT FOUND!")
            tree_roots.append(item)
            not_found_parent += 1
    else:
        tree_roots.append(item)

print(f"Total items: {len(results)}")
print(f"Found parent: {found_parent}")
print(f"Not found parent (orphans): {not_found_parent}")
print(f"Roots: {len(tree_roots)}")

# Показать roots
print(f"\nRoots:")
for r in tree_roots[:10]:
    children_count = len(item_map[r['id']]['children'])
    print(f"  - {r['name']} (children: {children_count})")
