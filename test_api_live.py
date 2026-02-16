#!/usr/bin/env python3
"""
Живая проверка API через HTTP запрос.
"""

import urllib.request
import json

PROJECT_ID = "85775ffe-4a38-477b-a267-e416ae3e126d"
URL = f"http://localhost:8000/api/v1/project-items/?project={PROJECT_ID}&page_size=1000"

print(f"Запрос: {URL}")
print()

try:
    with urllib.request.urlopen(URL) as response:
        data = json.loads(response.read().decode())
        
        print(f"count: {data.get('count')}")
        print(f"results length: {len(data.get('results', []))}")
        print()
        
        results = data.get('results', [])
        
        # Найти корень
        roots = [r for r in results if r.get('parent_item') is None]
        print(f"Корневых элементов: {len(roots)}")
        
        if roots:
            root = roots[0]
            root_id = root['id']
            print(f"Корень: {root['name']}")
            print(f"Root ID: {root_id}")
            print(f"Root ID type: {type(root_id).__name__}")
            print()
            
            # Найти детей
            children = [r for r in results if r.get('parent_item') == root_id]
            print(f"Детей корня: {len(children)}")
            
            for c in children[:10]:
                print(f"  - {c['name']} (parent_item: {c['parent_item'][:8]}...)")
            
            # Если детей 0 - проверить почему
            if len(children) == 0:
                print("\n!!! ПРОБЛЕМА: детей не найдено!")
                print("Проверяем первые 10 элементов:")
                for r in results[:10]:
                    print(f"  {r['name']}: id={r['id'][:8]}, parent_item={r.get('parent_item')}")
                
                # Проверить сравнение
                print(f"\nПроверка сравнения:")
                first_with_parent = next((r for r in results if r.get('parent_item')), None)
                if first_with_parent:
                    pi = first_with_parent['parent_item']
                    print(f"  parent_item: {repr(pi)}")
                    print(f"  root_id: {repr(root_id)}")
                    print(f"  pi == root_id: {pi == root_id}")
                    print(f"  type(pi): {type(pi)}, type(root_id): {type(root_id)}")
        
        # Проверяем все типы
        print("\n=== Проверка типов ===")
        sample = results[0] if results else {}
        print(f"id type: {type(sample.get('id')).__name__}")
        print(f"parent_item type: {type(sample.get('parent_item')).__name__ if sample.get('parent_item') else 'None'}")
        
        # Сохраняем для анализа
        with open('api_live_response.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("\nОтвет сохранён в api_live_response.json")
            
except Exception as e:
    print(f"Ошибка: {e}")
