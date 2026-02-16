# PDM - Шпаргалка

## 🚀 Быстрый старт

### Открыть проект
1. Запустите VS Code
2. `File → Open Folder → D:\B2B\PDM`
3. Подождите 10-15 секунд (серверы запустятся автоматически)
4. Откройте http://localhost:3000
5. Войдите:
   - **Логин**: `admin`
   - **Пароль**: `admin123`

**Готово!** 🎉

---

## ⌨️ Горячие клавиши

| Команда | Действие |
|---------|----------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+`` | Открыть/закрыть Terminal |
| `Ctrl+Shift+Y` | Панель Output |
| `Ctrl+Shift+E` | Explorer (файлы) |

---

## 🛠️ Управление серверами

### Через VS Code (рекомендуется)

**Остановка:**
```
Ctrl+Shift+P → Tasks: Run Task → Stop All Servers
```

**Перезапуск:**
```
Ctrl+Shift+P → Developer: Reload Window
```

**Ручной запуск:**
```
Ctrl+Shift+P → Tasks: Run Task → Start All Servers
```

### Через PowerShell (альтернатива)

```powershell
.\start_servers.ps1    # Запуск
.\check_servers.ps1    # Проверка
.\stop_servers.ps1     # Остановка
```

---

## 🌐 Адреса

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/api/docs/
- **Admin**: http://localhost:8000/admin/

---

## ❌ Если не работает

### ERR_CONNECTION_REFUSED

```powershell
# Проверить статус
.\check_servers.ps1

# Перезапустить
.\stop_servers.ps1
Ctrl+Shift+P → Developer: Reload Window
```

### Серверы не запустились автоматически

1. Проверьте панели Terminal в VS Code (внизу)
2. Перезагрузите: `Ctrl+Shift+P → Developer: Reload Window`
3. Ручной запуск: `Ctrl+Shift+P → Tasks: Run Task → Start All Servers`

### Backend падает

```bash
cd backend
python manage.py check  # Проверка на ошибки
```

### Frontend не компилируется

```bash
cd frontend
npm install  # Переустановка зависимостей
```

### "Неверный логин или пароль"

**Учетные данные по умолчанию:**
- Логин: `admin`
- Пароль: `admin123`

**Если не работает, сбросьте пароль:**
```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe setup_admin.py
```

Или создайте нового администратора:
```bash
cd backend
D:\B2B\PDM\.venv\Scripts\python.exe manage.py createsuperuser
```

**См. также:** [CREDENTIALS.md](CREDENTIALS.md)

---

## 📚 Документация

- [README.md](README.md) - Общая информация
- [AUTOSTART.md](AUTOSTART.md) - Автозапуск (подробно)
- [RUNNING.md](RUNNING.md) - Ручной запуск
- [docs/](docs/) - Техническая документация

---

## 💡 Полезные команды

### Проверка процессов
```powershell
Get-Process | Where-Object {$_.ProcessName -match "node|python"}
```

### Проверка портов
```powershell
Get-NetTCPConnection -LocalPort 8000,3000
```

### Логи Backend
Панель Terminal → "Start Backend"

### Логи Frontend  
Панель Terminal → "Start Frontend"

---

## 🎯 Типичный рабочий процесс

1. **Утро:**
   - Открыть VS Code
   - Подождать автозапуска
   - Открыть http://localhost:3000
   - Войти в систему

2. **В течение дня:**
   - Работать в системе
   - Мониторить логи в Terminal
   - Коммитить изменения

3. **Вечер:**
   - Закрыть VS Code (серверы остановятся автоматически)
   - Или: `Ctrl+Shift+P → Tasks: Run Task → Stop All Servers`

---

## 🔥 Экстренные случаи

### Полный сброс

```powershell
# Остановить все
.\stop_servers.ps1

# Убить процессы принудительно
Get-Process python,node -ErrorAction SilentlyContinue | Stop-Process -Force

# Перезапустить VS Code
Ctrl+Shift+P → Developer: Reload Window
```

### Очистка кэша

```bash
# Frontend
cd frontend
rm -rf node_modules .vite
npm install

# Backend
cd backend
python manage.py migrate
```

### Проверка БД

```bash
# Подключение к PostgreSQL
psql -U postgres -d PDM

# Миграции
cd backend
python manage.py migrate
python manage.py makemigrations
```

---

**Все работает? Начинайте работу!** 🚀

**Проблемы? Смотрите** [AUTOSTART.md](AUTOSTART.md)
