# Автоматический запуск серверов при открытии VS Code

Серверы настроены на автоматический запуск при открытии workspace в VS Code.

## Как это работает

### При открытии проекта в VS Code:

1. **Автоматически запускаются**:
   - Backend Django сервер (http://localhost:8000)
   - Frontend Vite сервер (http://localhost:3000)

2. **Серверы открываются в отдельных панелях Terminal**:
   - "Start Backend" - Django сервер
   - "Start Frontend" - Vite dev сервер

3. **Мониторинг**:
   - Можно следить за логами в реальном времени
   - Ошибки отображаются в панели Problems

## Управление через VS Code

### Остановка серверов:

**Вариант 1: Через Command Palette**
1. `Ctrl+Shift+P` (или `F1`)
2. Введите: `Tasks: Run Task`
3. Выберите: `Stop All Servers`

**Вариант 2: Через Terminal**
Закройте панели терминалов:
- Нажмите `Ctrl+C` в каждом терминале
- Или закройте терминалы через крестик

### Перезапуск серверов:

**Способ 1: Остановить и перезагрузить workspace**
1. `Ctrl+Shift+P` → `Tasks: Run Task` → `Stop All Servers`
2. `Ctrl+Shift+P` → `Developer: Reload Window`

**Способ 2: Через терминал**
1. Остановите текущие процессы (`Ctrl+C` в терминалах)
2. `Ctrl+Shift+P` → `Tasks: Run Task` → `Start All Servers`

### Ручной запуск (если автозапуск отключен):

1. `Ctrl+Shift+P` (или `F1`)
2. `Tasks: Run Task`
3. Выберите `Start All Servers`

## Настройки автозапуска

### Включить автозапуск:

В `.vscode/settings.json`:
```json
{
  "task.allowAutomaticTasks": "on"
}
```

### Отключить автозапуск:

В `.vscode/settings.json`:
```json
{
  "task.allowAutomaticTasks": "off"
}
```

Затем запускайте серверы вручную через Command Palette.

## Проверка статуса

### Быстрая проверка в терминале:

```powershell
# Backend
curl http://localhost:8000/api/v1/auth/me/
# Должен вернуть 401 (это нормально - требуется авторизация)

# Frontend
curl http://localhost:3000
# Должен вернуть 200
```

### Или используйте скрипт:

```powershell
.\check_servers.ps1
```

## Если что-то пошло не так

### Серверы не запустились автоматически:

1. Проверьте настройку в `.vscode/settings.json`:
   ```json
   "task.allowAutomaticTasks": "on"
   ```

2. Перезагрузите VS Code:
   - `Ctrl+Shift+P` → `Developer: Reload Window`

3. Проверьте вывод в терминалах на наличие ошибок

### ERR_CONNECTION_REFUSED:

1. Убедитесь, что серверы запущены:
   - Проверьте панели Terminal в VS Code
   - Выполните `.\check_servers.ps1`

2. Если серверы не работают:
   ```powershell
   # Остановить все
   .\stop_servers.ps1
   
   # Запустить через VS Code
   Ctrl+Shift+P → Tasks: Run Task → Start All Servers
   ```

3. Проверьте, что порты свободны:
   ```powershell
   Get-NetTCPConnection -LocalPort 8000,3000 -ErrorAction SilentlyContinue
   ```

### Backend падает сразу после запуска:

1. Проверьте логи в панели "Start Backend"
2. Убедитесь, что PostgreSQL запущен
3. Проверьте настройки в `backend/.env`
4. Проверьте синтаксис Python:
   ```powershell
   cd backend
   D:\B2B\PDM\.venv\Scripts\python.exe manage.py check
   ```

### Frontend не компилируется:

1. Проверьте логи в панели "Start Frontend"
2. Попробуйте очистить кэш:
   ```bash
   cd frontend
   rm -rf node_modules .vite
   npm install
   ```

## Альтернативные способы запуска

Если автозапуск VS Code не работает, используйте PowerShell скрипты:

```powershell
# Запуск
.\start_servers.ps1

# Проверка
.\check_servers.ps1

# Остановка
.\stop_servers.ps1
```

## Полезные команды VS Code

| Команда | Действие |
|---------|----------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+Shift+Y` | Открыть панель Output |
| `Ctrl+`` | Открыть/закрыть Terminal |
| `Ctrl+Shift+`` | Новый терминал |
| `F1` | Command Palette (альтернатива) |

## Мониторинг производительности

Проверка использования ресурсов:

```powershell
# Процессы
Get-Process | Where-Object {$_.ProcessName -match "node|python"} | 
  Format-Table ProcessName, Id, 
  @{Name='CPU(s)';Expression={$_.CPU}}, 
  @{Name='Memory(MB)';Expression={[math]::Round($_.WorkingSet/1MB,2)}}
```

## Логи

- **Backend**: Панель Terminal "Start Backend"
- **Frontend**: Панель Terminal "Start Frontend"  
- **Django логи**: `backend/logs/` (если настроено)
- **PostgreSQL логи**: Зависит от установки

---

**Рекомендация**: Оставляйте панели Terminal открытыми для мониторинга работы серверов в реальном времени.
