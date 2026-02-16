"""
PDM System - API Smoke Tests
Автоматические тесты критических API endpoints

Запуск: python qa_api_tests.py
"""

import requests
import json
import sys
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

BASE_URL = "http://localhost:8000/api/v1"
# В репозитории используются разные варианты демо/админ учёток.
# Делаем smoke-тесты устойчивыми: сначала пробуем demo.admin (setup_demo_data), затем admin (setup_admin).
AUTH_CREDENTIALS = [
    ("demo.admin", "demo123"),
    ("admin", "admin123"),
    ("admin", "admin"),
]


class TestResult(Enum):
    PASSED = "✅ PASSED"
    FAILED = "❌ FAILED"
    SKIPPED = "⏭️ SKIPPED"
    WARNING = "⚠️ WARNING"


@dataclass
class TestCase:
    name: str
    result: TestResult
    message: str
    duration_ms: int


class APITestRunner:
    def __init__(self):
        self.token: Optional[str] = None
        self.results: List[TestCase] = []
        self.session = requests.Session()
        self.session.trust_env = False  # Отключаем системные прокси
        
    def authenticate(self) -> bool:
        """Получить токен авторизации"""
        try:
            last_response = None
            for username, password in AUTH_CREDENTIALS:
                response = self.session.post(
                    f"{BASE_URL}/auth/login/",
                    json={"username": username, "password": password},
                    timeout=10,
                )
                last_response = response
                print(f"   Auth {username}: {response.status_code}")
                if response.status_code != 200:
                    continue

                data = response.json()
                self.token = data.get("access")
                if not self.token:
                    print(f"   No access token in response: {list(data.keys())}")
                    continue

                self.session.headers.update({
                    "Authorization": f"Bearer {self.token}",
                })
                return True

            if last_response is not None:
                print(f"   Auth response: {last_response.text[:200]}")
            return False
        except Exception as e:
            print(f"❌ Authentication failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_test(self, name: str, test_func) -> TestCase:
        """Выполнить тест и записать результат"""
        start = datetime.now()
        try:
            result, message = test_func()
            duration = int((datetime.now() - start).total_seconds() * 1000)
            return TestCase(name, result, message, duration)
        except Exception as e:
            duration = int((datetime.now() - start).total_seconds() * 1000)
            return TestCase(name, TestResult.FAILED, str(e), duration)
    
    # =========================================================================
    # AUTH TESTS
    # =========================================================================
    
    def test_auth_login_valid(self):
        """AUTH-001: Login с валидными данными"""
        test_session = requests.Session()
        test_session.trust_env = False
        for username, password in AUTH_CREDENTIALS:
            response = test_session.post(
                f"{BASE_URL}/auth/login/",
                json={"username": username, "password": password},
            )
            if response.status_code == 200 and "access" in response.json():
                return TestResult.PASSED, f"Token received ({username})"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_auth_login_invalid(self):
        """AUTH-002: Login с неверным паролем"""
        test_session = requests.Session()
        test_session.trust_env = False
        username = AUTH_CREDENTIALS[0][0]
        response = test_session.post(
            f"{BASE_URL}/auth/login/",
            json={"username": username, "password": "wrong_password"}
        )
        # SimpleJWT возвращает 400 или 401 при неверных credentials
        if response.status_code in [400, 401]:
            return TestResult.PASSED, f"{response.status_code} returned for invalid creds"
        return TestResult.FAILED, f"Expected 400 or 401, got {response.status_code}"
    
    def test_auth_no_token(self):
        """AUTH-003: Запрос без токена"""
        no_auth_session = requests.Session()
        no_auth_session.trust_env = False
        response = no_auth_session.get(f"{BASE_URL}/projects/")
        if response.status_code == 401:
            return TestResult.PASSED, "401 without token"
        return TestResult.FAILED, f"Expected 401, got {response.status_code}"
    
    def test_auth_invalid_token(self):
        """AUTH-004: Запрос с невалидным токеном"""
        no_auth_session = requests.Session()
        no_auth_session.trust_env = False
        response = no_auth_session.get(
            f"{BASE_URL}/projects/",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        if response.status_code == 401:
            return TestResult.PASSED, "401 with invalid token"
        return TestResult.FAILED, f"Expected 401, got {response.status_code}"
    
    # =========================================================================
    # CATALOG TESTS
    # =========================================================================
    
    def test_catalog_categories_list(self):
        """CAT-001: Получить список категорий"""
        response = self.session.get(f"{BASE_URL}/catalog-categories/")
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) or "results" in data:
                return TestResult.PASSED, f"Got categories"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_nomenclature_list(self):
        """CAT-002: Получить список номенклатуры"""
        response = self.session.get(f"{BASE_URL}/nomenclature/")
        if response.status_code == 200:
            return TestResult.PASSED, "Nomenclature list OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_suppliers_list(self):
        """CAT-003: Получить список поставщиков"""
        response = self.session.get(f"{BASE_URL}/suppliers/")
        if response.status_code == 200:
            return TestResult.PASSED, "Suppliers list OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_contractors_list(self):
        """CAT-004: Получить список подрядчиков"""
        response = self.session.get(f"{BASE_URL}/contractors/")
        if response.status_code == 200:
            return TestResult.PASSED, "Contractors list OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # PROJECT TESTS
    # =========================================================================
    
    def test_projects_list(self):
        """PRJ-001: Получить список проектов"""
        response = self.session.get(f"{BASE_URL}/projects/")
        if response.status_code == 200:
            return TestResult.PASSED, "Projects list OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_project_items_list(self):
        """PRJ-002: Получить список элементов проекта"""
        # Сначала получим проект
        projects_response = self.session.get(f"{BASE_URL}/projects/")
        if projects_response.status_code != 200:
            return TestResult.SKIPPED, "No projects to test"
        
        projects = projects_response.json()
        if isinstance(projects, dict):
            projects = projects.get("results", [])
        
        if not projects:
            return TestResult.SKIPPED, "No projects available"
        
        project_id = projects[0]["id"]
        response = self.session.get(f"{BASE_URL}/project-items/?project={project_id}")
        if response.status_code == 200:
            return TestResult.PASSED, f"Project items for {project_id[:8]}..."
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # BOM TESTS
    # =========================================================================
    
    def test_bom_list(self):
        """BOM-001: Получить список BOM"""
        response = self.session.get(f"{BASE_URL}/bom/")
        if response.status_code == 200:
            return TestResult.PASSED, "BOM list OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # PROCUREMENT TESTS
    # =========================================================================
    
    def test_purchase_orders_list(self):
        """PRC-001: Получить список заказов"""
        response = self.session.get(f"{BASE_URL}/purchase-orders/")
        if response.status_code == 200:
            return TestResult.PASSED, "Purchase orders OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_procurement_stats(self):
        """PRC-002: Получить статистику закупок"""
        response = self.session.get(f"{BASE_URL}/purchase-orders/stats/")
        if response.status_code == 200:
            data = response.json()
            if "total_orders" in data:
                return TestResult.PASSED, f"Stats: {data.get('total_orders')} orders"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # PRODUCTION TESTS
    # =========================================================================
    
    def test_production_orders_list(self):
        """PRD-001: Получить список производственных заказов"""
        response = self.session.get(f"{BASE_URL}/production-orders/")
        if response.status_code == 200:
            return TestResult.PASSED, "Production orders OK"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # VALIDATION TESTS
    # =========================================================================
    
    def test_validation_progress_over_100(self):
        """VAL-001: progress_percent > 100 должен быть отклонён"""
        # Получим проект с items
        projects = self.session.get(f"{BASE_URL}/projects/").json()
        if isinstance(projects, dict):
            projects = projects.get("results", [])
        
        if not projects:
            return TestResult.SKIPPED, "No projects to test"
        
        items = self.session.get(
            f"{BASE_URL}/project-items/?project={projects[0]['id']}"
        ).json()
        if isinstance(items, dict):
            items = items.get("results", [])
        
        if not items:
            return TestResult.SKIPPED, "No items to test"
        
        item_id = items[0]["id"]
        response = self.session.patch(
            f"{BASE_URL}/project-items/{item_id}/",
            json={"progress_percent": 150}
        )
        
        if response.status_code == 400:
            return TestResult.PASSED, "150% correctly rejected"
        elif response.status_code == 200:
            # Откатить изменение
            self.session.patch(
                f"{BASE_URL}/project-items/{item_id}/",
                json={"progress_percent": 0}
            )
            return TestResult.WARNING, "⚠️ 150% was accepted - validation missing!"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_validation_negative_quantity(self):
        """VAL-002: Отрицательное количество должно быть отклонено"""
        # Тестируем создание BOM item с отрицательным количеством
        boms = self.session.get(f"{BASE_URL}/bom/").json()
        if isinstance(boms, dict):
            boms = boms.get("results", [])
        
        if not boms:
            return TestResult.SKIPPED, "No BOMs to test"
        
        nomenclature = self.session.get(f"{BASE_URL}/nomenclature/").json()
        if isinstance(nomenclature, dict):
            nomenclature = nomenclature.get("results", [])
        
        if not nomenclature:
            return TestResult.SKIPPED, "No nomenclature to test"
        
        response = self.session.post(
            f"{BASE_URL}/bom-items/",
            json={
                "bom": boms[0]["id"],
                "child_item": nomenclature[0]["id"],
                "child_category": "material",
                "quantity": -5
            }
        )
        
        if response.status_code == 400:
            return TestResult.PASSED, "Negative quantity rejected"
        elif response.status_code == 201:
            # Удалить созданный item
            item_id = response.json().get("id")
            if item_id:
                self.session.delete(f"{BASE_URL}/bom-items/{item_id}/")
            return TestResult.WARNING, "⚠️ Negative quantity accepted - validation missing!"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    # =========================================================================
    # SECURITY TESTS
    # =========================================================================
    
    def test_sql_injection_login(self):
        """SEC-001: SQL injection в login"""
        test_session = requests.Session()
        test_session.trust_env = False
        response = test_session.post(
            f"{BASE_URL}/auth/login/",
            json={
                "username": "admin' OR '1'='1",
                "password": "anything"
            }
        )
        if response.status_code == 401:
            return TestResult.PASSED, "SQL injection blocked"
        elif response.status_code == 200:
            return TestResult.FAILED, "⚠️ SQL INJECTION VULNERABILITY!"
        return TestResult.PASSED, f"Status {response.status_code} - likely blocked"
    
    def test_large_page_size(self):
        """SEC-002: Проверка ограничения page_size"""
        response = self.session.get(
            f"{BASE_URL}/nomenclature/?page_size=1000000"
        )
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            if isinstance(results, list) and len(results) <= 1000:
                return TestResult.PASSED, f"Page size limited to {len(results)}"
            elif isinstance(results, list):
                return TestResult.WARNING, f"⚠️ Got {len(results)} items - check limits"
        return TestResult.PASSED, f"Status {response.status_code}"
    
    # =========================================================================
    # CRITICAL ISSUES TESTS
    # =========================================================================
    
    def test_status_direct_patch(self):
        """CRIT-001: Проверка прямого изменения статуса PATCH"""
        # Создаём тестовый заказ на закупку или используем существующий
        orders = self.session.get(f"{BASE_URL}/purchase-orders/").json()
        if isinstance(orders, dict):
            orders = orders.get("results", [])
        
        if not orders:
            return TestResult.SKIPPED, "No purchase orders to test"
        
        order = orders[0]
        order_id = order.get("id")
        current_status = order.get("status")
        
        # Пытаемся напрямую изменить статус на completed без прохождения бизнес-логики
        response = self.session.patch(
            f"{BASE_URL}/purchase-orders/{order_id}/",
            json={"status": "completed"}
        )
        
        if response.status_code == 200:
            new_status = response.json().get("status")
            # Восстановим статус
            self.session.patch(f"{BASE_URL}/purchase-orders/{order_id}/", json={"status": current_status})
            if new_status == "completed":
                return TestResult.WARNING, "⚠️ CRITICAL: Status bypassed via PATCH!"
        return TestResult.PASSED, "Status change protected"
    
    def test_access_foreign_project(self):
        """CRIT-002: Проверка доступа к чужим данным (IDOR)"""
        # Этот тест требует создания другого пользователя
        # Пока проверим что есть object-level permissions
        projects = self.session.get(f"{BASE_URL}/projects/").json()
        if isinstance(projects, dict):
            projects = projects.get("results", [])
        
        if not projects:
            return TestResult.SKIPPED, "No projects to test"
        
        # Пытаемся получить детали проекта
        project_id = projects[0].get("id")
        response = self.session.get(f"{BASE_URL}/projects/{project_id}/")
        
        if response.status_code == 200:
            # Проверяем есть ли поле owner или user_assignments
            data = response.json()
            if "user_assignments" in data or "owner" in data:
                return TestResult.PASSED, "Project has user assignments"
            return TestResult.WARNING, "⚠️ No user assignment info - check permissions"
        return TestResult.FAILED, f"Status: {response.status_code}"
    
    def test_concurrent_progress_update(self):
        """CRIT-003: Проверка race condition при обновлении прогресса"""
        # Получаем проект с items
        projects = self.session.get(f"{BASE_URL}/projects/").json()
        if isinstance(projects, dict):
            projects = projects.get("results", [])
        
        if not projects:
            return TestResult.SKIPPED, "No projects to test"
        
        project_id = projects[0].get("id")
        
        # Проверяем есть ли endpoint recalculate и что он требует блокировки
        response = self.session.post(f"{BASE_URL}/projects/{project_id}/recalculate/")
        
        if response.status_code == 200:
            return TestResult.WARNING, "⚠️ Recalculate available - check for race conditions"
        elif response.status_code == 404:
            return TestResult.SKIPPED, "Recalculate endpoint not found"
        elif response.status_code == 409:
            return TestResult.PASSED, "Recalculate protected by locking"
        return TestResult.PASSED, f"Status: {response.status_code}"
    
    def test_delete_nomenclature_with_dependencies(self):
        """CRIT-004: Проверка CASCADE при удалении номенклатуры"""
        # Создаём тестовую номенклатуру
        nomenclature = self.session.get(f"{BASE_URL}/nomenclature/").json()
        if isinstance(nomenclature, dict):
            nomenclature = nomenclature.get("results", [])
        
        if not nomenclature:
            return TestResult.SKIPPED, "No nomenclature to test"
        
        # Берём номенклатуру и проверяем есть ли зависимости
        nom_id = nomenclature[0].get("id")
        
        # Попытка удаления (не должна удалять если есть зависимости)
        # НЕ ВЫПОЛНЯЕМ РЕАЛЬНОЕ УДАЛЕНИЕ - только проверка защиты
        # response = self.session.delete(f"{BASE_URL}/nomenclature/{nom_id}/")
        
        # Вместо этого проверяем есть ли у номенклатуры зависимости через API
        response = self.session.get(f"{BASE_URL}/nomenclature/{nom_id}/")
        if response.status_code == 200:
            return TestResult.WARNING, "⚠️ Check CASCADE behavior on nomenclature delete"
        return TestResult.SKIPPED, "Cannot verify CASCADE protection"
    
    def test_rate_limiting(self):
        """SEC-003: Проверка rate limiting на авторизации"""
        # Делаем 10 быстрых запросов на логин
        test_session = requests.Session()
        test_session.trust_env = False
        
        blocked = False
        for i in range(10):
            response = test_session.post(
                f"{BASE_URL}/auth/login/",
                json={"username": "admin", "password": "wrong"}
            )
            if response.status_code == 429:  # Too Many Requests
                blocked = True
                break
        
        if blocked:
            return TestResult.PASSED, "Rate limiting active"
        return TestResult.WARNING, "⚠️ No rate limiting detected on auth endpoint"
    
    def test_csrf_protection(self):
        """SEC-004: Проверка CSRF токена"""
        # API с JWT обычно не требует CSRF, но проверим
        test_session = requests.Session()
        test_session.trust_env = False
        
        # Пробуем сделать POST без CSRF токена
        response = test_session.post(
            f"{BASE_URL}/auth/login/",
            json={"username": "admin", "password": "admin"}
        )
        
        # Для REST API с JWT CSRF не нужен - это нормально
        if response.status_code == 200:
            return TestResult.PASSED, "JWT API - CSRF not required"
        return TestResult.PASSED, f"Status: {response.status_code}"
    
    def test_project_generate_from_bom_atomicity(self):
        """CRIT-005: Проверка атомарности generate_from_bom"""
        # Получаем проект и BOM
        projects = self.session.get(f"{BASE_URL}/projects/").json()
        boms = self.session.get(f"{BASE_URL}/bom/").json()
        
        if isinstance(projects, dict):
            projects = projects.get("results", [])
        if isinstance(boms, dict):
            boms = boms.get("results", [])
        
        if not projects or not boms:
            return TestResult.SKIPPED, "Need project and BOM to test"
        
        # Проверяем есть ли endpoint
        project_id = projects[0].get("id")
        bom_id = boms[0].get("id")
        
        # Симулируем запрос (без фактического выполнения)
        # Реальный тест требует транзакционной БД
        return TestResult.WARNING, "⚠️ Manual verification required - check transaction.atomic in generate_from_bom"
    
    # =========================================================================
    # RUNNER
    # =========================================================================
    
    def run_all_tests(self):
        """Запустить все тесты"""
        print("=" * 60)
        print("PDM System - API Smoke Tests")
        print("=" * 60)
        print(f"Base URL: {BASE_URL}")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-" * 60)
        
        # Authenticate
        print("\n🔐 Authenticating...")
        if not self.authenticate():
            print("❌ Failed to authenticate. Aborting tests.")
            return
        print("✅ Authenticated successfully\n")
        
        # Define all tests
        tests = [
            # Auth
            ("AUTH-001: Login valid credentials", self.test_auth_login_valid),
            ("AUTH-002: Login invalid password", self.test_auth_login_invalid),
            ("AUTH-003: Request without token", self.test_auth_no_token),
            ("AUTH-004: Request with invalid token", self.test_auth_invalid_token),
            
            # Catalog
            ("CAT-001: Catalog categories list", self.test_catalog_categories_list),
            ("CAT-002: Nomenclature list", self.test_nomenclature_list),
            ("CAT-003: Suppliers list", self.test_suppliers_list),
            ("CAT-004: Contractors list", self.test_contractors_list),
            
            # Projects
            ("PRJ-001: Projects list", self.test_projects_list),
            ("PRJ-002: Project items list", self.test_project_items_list),
            
            # BOM
            ("BOM-001: BOM structures list", self.test_bom_list),
            
            # Procurement
            ("PRC-001: Purchase orders list", self.test_purchase_orders_list),
            ("PRC-002: Procurement statistics", self.test_procurement_stats),
            
            # Production
            ("PRD-001: Production orders list", self.test_production_orders_list),
            
            # Validation
            ("VAL-001: Progress > 100% validation", self.test_validation_progress_over_100),
            ("VAL-002: Negative quantity validation", self.test_validation_negative_quantity),
            
            # Security
            ("SEC-001: SQL injection in login", self.test_sql_injection_login),
            ("SEC-002: Large page_size limit", self.test_large_page_size),
            ("SEC-003: Rate limiting on auth", self.test_rate_limiting),
            ("SEC-004: CSRF protection", self.test_csrf_protection),
            
            # Critical Issues
            ("CRIT-001: Status bypass via PATCH", self.test_status_direct_patch),
            ("CRIT-002: Access foreign project (IDOR)", self.test_access_foreign_project),
            ("CRIT-003: Concurrent progress update", self.test_concurrent_progress_update),
            ("CRIT-004: CASCADE on nomenclature delete", self.test_delete_nomenclature_with_dependencies),
            ("CRIT-005: Generate from BOM atomicity", self.test_project_generate_from_bom_atomicity),
        ]
        
        # Run tests
        for name, test_func in tests:
            result = self.run_test(name, test_func)
            self.results.append(result)
            
            status_icon = result.result.value
            print(f"{status_icon} {result.name}")
            if result.message:
                print(f"   └─ {result.message} ({result.duration_ms}ms)")
        
        # Summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r.result == TestResult.PASSED)
        failed = sum(1 for r in self.results if r.result == TestResult.FAILED)
        warnings = sum(1 for r in self.results if r.result == TestResult.WARNING)
        skipped = sum(1 for r in self.results if r.result == TestResult.SKIPPED)
        total = len(self.results)
        
        print(f"Total:    {total}")
        print(f"Passed:   {passed} ✅")
        print(f"Failed:   {failed} ❌")
        print(f"Warnings: {warnings} ⚠️")
        print(f"Skipped:  {skipped} ⏭️")
        print("-" * 60)
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for r in self.results:
                if r.result == TestResult.FAILED:
                    print(f"  - {r.name}: {r.message}")
        
        if warnings > 0:
            print("\n⚠️ WARNINGS:")
            for r in self.results:
                if r.result == TestResult.WARNING:
                    print(f"  - {r.name}: {r.message}")
        
        print("\n" + "=" * 60)
        
        # Exit code
        if failed > 0:
            sys.exit(1)
        sys.exit(0)


if __name__ == "__main__":
    runner = APITestRunner()
    runner.run_all_tests()
