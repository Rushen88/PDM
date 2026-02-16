#!/usr/bin/env python
"""Проверка работы API в реальном времени (JWT)."""

import requests

BASE_URL = "http://localhost:8000/api/v1"

# Отключаем использование HTTP(S)_PROXY для localhost.
session = requests.Session()
session.trust_env = False


def login(username: str, password: str) -> str:
    r = session.post(
        f"{BASE_URL}/auth/login/",
        json={"username": username, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access"]

def check_api():
    print("=" * 80)
    print("ПРОВЕРКА РАБОТЫ API")
    print("=" * 80)
    print()
    
    # JWT login
    try:
        access = None
        for username, password in [("demo.admin", "demo123"), ("admin", "admin123")]:
            try:
                access = login(username, password)
                print(f"✓ Логин {username} успешен")
                break
            except Exception:
                continue

        if not access:
            raise RuntimeError("не удалось залогиниться demo.admin/demo123 или admin/admin123")
    except Exception as e:
        print(f"✗ Не удалось залогиниться: {e}")
        return

    headers = {"Authorization": f"Bearer {access}"}

    # Получаем любой проект
    try:
        projects = session.get(f"{BASE_URL}/projects/?page_size=5", headers=headers, timeout=10).json()
        results = projects.get('results') or []
        if not results:
            print("✗ Нет проектов. Запустите: manage.py setup_demo_data")
            return
        project_id = results[0]['id']
        print(f"✓ Проект: {results[0].get('name', 'N/A')}")
    except Exception as e:
        print(f"✗ Не удалось получить проекты: {e}")
        return

    # Проверяем API
    url = f"{BASE_URL}/project-items/?project={project_id}&page_size=50"
    
    print(f"Запрос к: {url}")
    print()
    
    try:
        response = session.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ API работает! Статус: {response.status_code}")
            print(f"✓ Всего элементов: {data.get('count', 0)}")
            print()
            
            # Проверяем наличие поля is_purchased
            results = data.get('results', [])
            if results:
                print("Проверка поля is_purchased в первых 5 элементах:")
                print("-" * 80)
                for i, item in enumerate(results[:5], 1):
                    name = item.get('name', 'N/A')
                    is_purchased = item.get('is_purchased')
                    category = item.get('category', 'N/A')
                    
                    if is_purchased is None:
                        status = "✗ ОТСУТСТВУЕТ"
                    else:
                        status = f"✓ {is_purchased}"
                    
                    print(f"{i}. {name}")
                    print(f"   - category: {category}")
                    print(f"   - is_purchased: {status}")
                    print()
                
                # Общая статистика
                has_is_purchased = sum(1 for item in results if 'is_purchased' in item)
                print(f"✓ Элементов с полем is_purchased: {has_is_purchased}/{len(results)}")
                
                if has_is_purchased == len(results):
                    print()
                    print("=" * 80)
                    print("✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!")
                    print("=" * 80)
                    print()
                    print("Система готова к работе:")
                    print("  - Backend: http://localhost:8000")
                    print("  - Frontend: http://localhost:3000")
                    print("  - Логин: demo.admin / demo123 (или admin / admin123)")
                else:
                    print()
                    print("⚠ Не все элементы имеют поле is_purchased")
            else:
                print("⚠ Нет элементов в ответе API")
        else:
            print(f"✗ Ошибка API: {response.status_code}")
            print(f"Ответ: {response.text[:500]}")
    
    except requests.exceptions.ConnectionError:
        print("✗ Не удалось подключиться к API")
        print("Убедитесь, что backend запущен на http://localhost:8000")
    except Exception as e:
        print(f"✗ Ошибка: {e}")

if __name__ == '__main__':
    check_api()
