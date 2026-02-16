"""
Django management command для проверки API
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
import requests

User = get_user_model()


class Command(BaseCommand):
    help = 'Проверка работы API и наличия поля is_purchased'

    def handle(self, *args, **options):
        self.stdout.write("=" * 80)
        self.stdout.write(self.style.SUCCESS("ПРОВЕРКА РАБОТЫ API"))
        self.stdout.write("=" * 80)
        self.stdout.write("")
        
        # Получаем пользователя
        try:
            admin = User.objects.get(username='admin')
            self.stdout.write(self.style.SUCCESS(f"✓ Пользователь: {admin.username}"))
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR("✗ Пользователь admin не найден"))
            return
        
        # Получаем токен
        token, created = Token.objects.get_or_create(user=admin)
        self.stdout.write(self.style.SUCCESS(f"✓ Токен: {token.key}"))
        self.stdout.write("")
        
        # Проверяем API
        url = "http://localhost:8000/api/v1/projects/1/items/"
        headers = {"Authorization": f"Token {token.key}"}
        
        self.stdout.write(f"Запрос к: {url}")
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                self.stdout.write(self.style.SUCCESS(f"✓ API работает! Элементов: {data.get('count', 0)}"))
                self.stdout.write("")
                
                results = data.get('results', [])
                if results:
                    self.stdout.write("Проверка is_purchased в первых 5 элементах:")
                    self.stdout.write("-" * 80)
                    
                    for i, item in enumerate(results[:5], 1):
                        name = item.get('name', 'N/A')
                        is_purchased = item.get('is_purchased')
                        category = item.get('category', 'N/A')
                        
                        if is_purchased is None:
                            status = self.style.ERROR("✗ НЕТ")
                        else:
                            status = self.style.SUCCESS(f"✓ {is_purchased}")
                        
                        self.stdout.write(f"{i}. {name} | category: {category} | is_purchased: {status}")
                    
                    has_field = sum(1 for item in results if 'is_purchased' in item)
                    self.stdout.write("")
                    self.stdout.write(self.style.SUCCESS(f"✓ С полем is_purchased: {has_field}/{len(results)}"))
                    
                    if has_field == len(results):
                        self.stdout.write("")
                        self.stdout.write("=" * 80)
                        self.stdout.write(self.style.SUCCESS("✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ! Система готова!"))
                        self.stdout.write("=" * 80)
                        self.stdout.write("")
                        self.stdout.write("Frontend: http://localhost:3000")
                        self.stdout.write("Логин: admin / admin123")
                    else:
                        self.stdout.write(self.style.WARNING("⚠ Не все элементы имеют поле is_purchased"))
                else:
                    self.stdout.write(self.style.WARNING("⚠ Нет элементов в ответе"))
            else:
                self.stdout.write(self.style.ERROR(f"✗ Ошибка: {response.status_code}"))
        
        except requests.exceptions.ConnectionError:
            self.stdout.write(self.style.ERROR("✗ Не удалось подключиться к API"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Ошибка: {e}"))
