#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Скрипт для создания/сброса администратора с известными учетными данными
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

# Учетные данные по умолчанию
USERNAME = 'admin'
PASSWORD = 'admin123'
EMAIL = 'admin@pdm.local'

def setup_admin():
    """Создать или обновить администратора"""
    try:
        user = User.objects.get(username=USERNAME)
        user.set_password(PASSWORD)
        user.is_superuser = True
        user.is_staff = True
        user.is_active = True
        user.email = EMAIL
        user.save()
        print(f'[OK] Пользователь "{USERNAME}" обновлен')
        print(f'  Логин: {USERNAME}')
        print(f'  Пароль: {PASSWORD}')
    except User.DoesNotExist:
        user = User.objects.create_superuser(
            username=USERNAME,
            email=EMAIL,
            password=PASSWORD
        )
        print(f'[OK] Создан администратор "{USERNAME}"')
        print(f'  Логин: {USERNAME}')
        print(f'  Пароль: {PASSWORD}')
    
    return True

if __name__ == '__main__':
    try:
        setup_admin()
        sys.exit(0)
    except Exception as e:
        print(f'[ERROR] Ошибка: {e}')
        sys.exit(1)
