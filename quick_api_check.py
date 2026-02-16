#!/usr/bin/env python
"""Быстрая проверка работы API (JWT)."""

import requests

print("=" * 80)
print("ПРОВЕРКА РАБОТЫ API")
print("=" * 80)
print()

BASE_URL = "http://localhost:8000/api/v1"

# В корпоративных окружениях requests может отправлять localhost через HTTP(S)_PROXY.
# Это приводит к 502 (ответ от прокси), при этом бекенд запрос даже не видит.
session = requests.Session()
session.trust_env = False

def login(username: str, password: str) -> str:
    r = session.post(
        f"{BASE_URL}/auth/login/",
        json={"username": username, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()
    return data["access"]


access = None
for username, password in [("demo.admin", "demo123"), ("admin", "admin123")]:
    try:
        access = login(username, password)
        print(f"✓ Логин {username} успешен")
        break
    except Exception:
        continue

if not access:
    raise SystemExit("✗ Не удалось залогиниться demo.admin/demo123 или admin/admin123")
headers = {"Authorization": f"Bearer {access}"}

# Получаем любой проект
projects = session.get(f"{BASE_URL}/projects/?page_size=5", headers=headers, timeout=10).json()
results = projects.get("results") or []
if not results:
    raise SystemExit("✗ Нет проектов. Запустите: manage.py setup_demo_data")

project_id = results[0]["id"]
print(f"✓ Проект найден: {results[0].get('name', 'N/A')} ({project_id})")

# Проверяем элементы проекта
url = f"{BASE_URL}/project-items/?project={project_id}&page_size=50"

print(f"Запрос к: {url}")
response = session.get(url, headers=headers, timeout=5)

if response.status_code == 200:
    data = response.json()
    print(f"✓ API работает! Элементов: {data.get('count', 0)}")
    print()
    
    results = data.get('results', [])
    if results:
        print("Проверка is_purchased в первых 5 элементах:")
        print("-" * 80)
        for i, item in enumerate(results[:5], 1):
            name = item.get('name', 'N/A')
            is_purchased = item.get('is_purchased')
            category = item.get('category', 'N/A')
            status = "✗ НЕТ" if is_purchased is None else f"✓ {is_purchased}"
            print(f"{i}. {name} | category: {category} | is_purchased: {status}")
        
        has_field = sum(1 for item in results if 'is_purchased' in item)
        print()
        print(f"✓ С полем is_purchased: {has_field}/{len(results)}")
        
        if has_field == len(results):
            print()
            print("=" * 80)
            print("✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ! Система готова!")
            print("=" * 80)
            print()
            print("Frontend: http://localhost:3000")
            print("Логин: demo.admin / demo123 (или admin / admin123)")
else:
    print(f"✗ Ошибка: {response.status_code}")
