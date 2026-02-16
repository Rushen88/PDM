# Учетные данные для входа в систему

## Администратор

**Логин:** `admin`  
**Пароль:** `admin123`

---

## Автоматическое создание пользователя

При запуске Backend через VS Code Tasks пользователь **admin** создается/обновляется автоматически.

Скрипт: `backend/setup_admin.py`

## Ручное создание/сброс пароля

Если нужно вручную сбросить пароль или создать администратора:

```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe setup_admin.py
```

Или через Django shell:

```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe manage.py shell
```

```python
from django.contrib.auth import get_user_model
User = get_user_model()

# Найти пользователя
user = User.objects.get(username='admin')

# Изменить пароль
user.set_password('новый_пароль')
user.save()

print(f'Пароль для {user.username} обновлен')
```

## Создание нового администратора

```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe manage.py createsuperuser
```

Или программно:

```python
from django.contrib.auth import get_user_model
User = get_user_model()

User.objects.create_superuser(
    username='новый_админ',
    email='admin@example.com',
    password='пароль123'
)
```

## Проверка пользователей

```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); [print(f'{u.username}: admin={u.is_superuser}') for u in User.objects.all()]"
```

---

## Важно!

⚠️ **Не забудьте изменить пароль в продакшене!**

Для production окружения:
1. Смените пароль администратора
2. Используйте сложные пароли
3. Включите двухфакторную аутентификацию (если реализовано)
4. Ограничьте доступ к admin панели по IP

---

## API Endpoints

### Вход
```
POST http://localhost:8000/api/v1/auth/login/
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Ответ:**
```json
{
  "access": "JWT_ACCESS_TOKEN",
  "refresh": "JWT_REFRESH_TOKEN",
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@pdm.local",
    ...
  }
}
```

### Текущий пользователь
```
GET http://localhost:8000/api/v1/auth/me/
Authorization: Bearer JWT_ACCESS_TOKEN
```

### Выход
```
POST http://localhost:8000/api/v1/auth/logout/
Authorization: Bearer JWT_ACCESS_TOKEN

{
  "refresh": "JWT_REFRESH_TOKEN"
}
```

### Обновление токена
```
POST http://localhost:8000/api/v1/auth/refresh/
Content-Type: application/json

{
  "refresh": "JWT_REFRESH_TOKEN"
}
```

---

**Автоматически создано:** 13 января 2026  
**Последнее обновление:** Автоматически при запуске
