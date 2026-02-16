# Архитектура mini-ERP системы PDM
## Project-based Manufacturing ERP

---

## 1. Обзор системы

### 1.1 Назначение
Система управления проектным производством технически сложных изделий (СТЕНДОВ).
Обеспечивает полный цикл: от справочников номенклатуры до аналитики выполнения.

### 1.2 Ключевые домены (Bounded Contexts)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PDM mini-ERP                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   CATALOG    │  │     BOM      │  │   PROJECT    │  │  PRODUCTION  │    │
│  │  Справочники │  │  Структура   │  │   Проекты    │  │ Производство │    │
│  │  номенклатуры│  │   изделий    │  │   (Стенды)   │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ PROCUREMENT  │  │  INVENTORY   │  │  PLANNING    │  │  ANALYTICS   │    │
│  │   Закупки    │  │    Склад     │  │ Планирование │  │  Аналитика   │    │
│  │              │  │              │  │              │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │    USERS     │  │    AUDIT     │                                         │
│  │ Пользователи │  │    Аудит     │                                         │
│  │   и роли     │  │   история    │                                         │
│  └──────────────┘  └──────────────┘                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Доменная модель

### 2.1 CATALOG (Справочники номенклатуры)

**Агрегаты:**
- `NomenclatureItem` — базовая сущность номенклатуры

**Сущности:**
- `Material` — материалы (закупаемые)
- `StandardProduct` — стандартные изделия (закупаемые)
- `OtherProduct` — прочие изделия (закупаемые)
- `Part` — детали (изготавливаемые из материалов)
- `AssemblyUnit` — сборочные единицы (изготавливаемые)
- `Subsystem` — подсистемы (изготавливаемые)
- `System` — системы (изготавливаемые)

**Value Objects:**
- `DrawingNumber` — номер чертежа
- `NomenclatureType` — тип номенклатуры
- `UnitOfMeasure` — единица измерения

**Справочники-словари:**
- `Supplier` — поставщики
- `Contractor` — подрядчики
- `DelayReason` — причины задержек
- `NomenclatureCategory` — категории номенклатуры

### 2.2 BOM (Bill of Materials — Структура изделий)

**Агрегаты:**
- `BOMStructure` — структура изделия (дерево компонентов)

**Сущности:**
- `BOMItem` — элемент структуры (связь parent-child)
- `BOMVersion` — версия структуры

**Value Objects:**
- `Quantity` — количество с единицей измерения
- `BOMLevel` — уровень вложенности

### 2.3 PROJECT (Проекты — Стенды)

**Агрегаты:**
- `Stand` — СТЕНД (корневой агрегат проекта)

**Сущности:**
- `ProjectSystem` — система в рамках проекта
- `ProjectSubsystem` — подсистема в рамках проекта
- `ProjectItem` — любой элемент проекта (производный от BOM)

**Value Objects:**
- `ProjectCode` — код проекта
- `ProjectStatus` — статус проекта

### 2.4 PRODUCTION (Производство)

**Агрегаты:**
- `ProductionOrder` — производственный заказ

**Сущности:**
- `ProductionTask` — задача на изготовление
- `ProductionProgress` — прогресс выполнения

**Value Objects:**
- `ManufacturingStatus` — статус изготовления
- `DateRange` — плановые/фактические даты
- `ManufacturerType` — кто изготавливает (свои/подрядчик)

**Статусы изготовления:**
```
NOT_STARTED      → Не начато
IN_PROGRESS      → В процессе изготовления
SUSPENDED        → Приостановлено
QUALITY_CHECK    → На контроле качества
COMPLETED        → Изготовлено
REJECTED         → Брак
```

### 2.5 PROCUREMENT (Закупки)

**Агрегаты:**
- `PurchaseOrder` — заказ на закупку

**Сущности:**
- `PurchaseOrderItem` — позиция заказа
- `SupplierOffer` — предложение поставщика

**Value Objects:**
- `PurchaseStatus` — статус закупки
- `DeliveryTerms` — условия поставки
- `Price` — цена с валютой

**Статусы закупки:**
```
NOT_REQUIRED     → Не требуется (на складе)
PENDING          → Ожидает заказа
ORDERED          → Заказано
IN_TRANSIT       → В пути
DELIVERED        → Доставлено
DELAYED          → Задержка поставки
CANCELLED        → Отменено
```

### 2.6 INVENTORY (Склад)

**Агрегаты:**
- `WarehouseStock` — складской запас

**Сущности:**
- `StockMovement` — движение по складу
- `Reservation` — резервирование под проект

**Value Objects:**
- `StockQuantity` — количество на складе
- `StorageLocation` — место хранения

### 2.7 PLANNING (Планирование)

**Агрегаты:**
- `ProductionPlan` — производственный план
- `ProcurementPlan` — план закупок

**Сущности:**
- `PlanItem` — элемент плана
- `Milestone` — контрольная точка

**Value Objects:**
- `PlanDates` — плановые даты
- `CriticalPath` — критический путь

### 2.8 ANALYTICS (Аналитика)

**Read Models (проекции):**
- `StandProgress` — прогресс по стенду
- `SystemProgress` — прогресс по системе
- `ProcurementSummary` — сводка по закупкам
- `ProductionSummary` — сводка по производству
- `DelayAnalysis` — анализ задержек

### 2.9 USERS (Пользователи и права)

**Агрегаты:**
- `User` — пользователь системы

**Сущности:**
- `Role` — роль
- `Permission` — разрешение
- `UserAssignment` — назначение на объект

**Value Objects:**
- `ContextualPermission` — контекстное право (роль + объект)

---

## 3. Архитектурные слои (Clean Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  REST API   │  │  WebSocket  │  │  Celery Tasks (entry)   │ │
│  │  (DRF)      │  │  (channels) │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Use Cases  │  │  Commands   │  │  Queries (CQRS)         │ │
│  │  Services   │  │  Handlers   │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐                              │
│  │    DTOs     │  │  Mappers    │                              │
│  └─────────────┘  └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DOMAIN LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Entities   │  │  Aggregates │  │  Value Objects          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Domain     │  │  Domain     │  │  Repository Interfaces  │ │
│  │  Services   │  │  Events     │  │  (ports)                │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Django ORM │  │  Celery     │  │  Redis Cache            │ │
│  │  Models     │  │  Workers    │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Repositories│  │  External   │  │  File Storage           │ │
│  │ (adapters)  │  │  Services   │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Структура каталогов проекта

```
PDM/
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── README.md
│
├── docs/                           # Документация
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── diagrams/
│
├── nginx/                          # Конфигурация Nginx
│   ├── nginx.conf
│   └── conf.d/
│
├── scripts/                        # Скрипты развёртывания
│   ├── init_db.sh
│   ├── backup.sh
│   └── restore.sh
│
├── backend/                        # Django Backend
│   ├── manage.py
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── dev.txt
│   │   └── prod.txt
│   │
│   ├── config/                     # Django Configuration
│   │   ├── __init__.py
│   │   ├── settings/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   ├── asgi.py
│   │   └── celery.py
│   │
│   ├── domain/                     # DOMAIN LAYER (чистая логика)
│   │   ├── __init__.py
│   │   │
│   │   ├── catalog/                # Домен: Справочники
│   │   │   ├── __init__.py
│   │   │   ├── entities.py         # Сущности
│   │   │   ├── value_objects.py    # Value Objects
│   │   │   ├── aggregates.py       # Агрегаты
│   │   │   ├── services.py         # Доменные сервисы
│   │   │   ├── events.py           # Доменные события
│   │   │   └── repositories.py     # Интерфейсы репозиториев
│   │   │
│   │   ├── bom/                    # Домен: Структура изделий
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── aggregates.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   ├── project/                # Домен: Проекты (Стенды)
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── aggregates.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   ├── production/             # Домен: Производство
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── aggregates.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   ├── procurement/            # Домен: Закупки
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── aggregates.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   ├── inventory/              # Домен: Склад
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── aggregates.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   ├── planning/               # Домен: Планирование
│   │   │   ├── __init__.py
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   ├── services.py
│   │   │   ├── events.py
│   │   │   └── repositories.py
│   │   │
│   │   └── shared/                 # Общие доменные компоненты
│   │       ├── __init__.py
│   │       ├── base_entity.py
│   │       ├── base_aggregate.py
│   │       ├── value_objects.py
│   │       ├── events.py
│   │       └── exceptions.py
│   │
│   ├── application/                # APPLICATION LAYER
│   │   ├── __init__.py
│   │   │
│   │   ├── catalog/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py         # Command handlers
│   │   │   ├── queries.py          # Query handlers
│   │   │   ├── dtos.py             # Data Transfer Objects
│   │   │   └── services.py         # Application services
│   │   │
│   │   ├── bom/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py
│   │   │   ├── queries.py
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   ├── project/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py
│   │   │   ├── queries.py
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   ├── production/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py
│   │   │   ├── queries.py
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   ├── procurement/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py
│   │   │   ├── queries.py
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   ├── inventory/
│   │   │   ├── __init__.py
│   │   │   ├── commands.py
│   │   │   ├── queries.py
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   ├── analytics/
│   │   │   ├── __init__.py
│   │   │   ├── queries.py          # Только чтение
│   │   │   ├── dtos.py
│   │   │   └── services.py
│   │   │
│   │   └── shared/
│   │       ├── __init__.py
│   │       ├── interfaces.py       # Абстрактные интерфейсы
│   │       ├── unit_of_work.py     # Unit of Work паттерн
│   │       └── event_bus.py        # Шина событий
│   │
│   ├── infrastructure/             # INFRASTRUCTURE LAYER
│   │   ├── __init__.py
│   │   │
│   │   ├── persistence/            # Работа с БД
│   │   │   ├── __init__.py
│   │   │   ├── models/             # Django ORM Models
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py         # Базовые миксины
│   │   │   │   ├── catalog.py
│   │   │   │   ├── bom.py
│   │   │   │   ├── project.py
│   │   │   │   ├── production.py
│   │   │   │   ├── procurement.py
│   │   │   │   ├── inventory.py
│   │   │   │   ├── planning.py
│   │   │   │   ├── users.py
│   │   │   │   └── audit.py
│   │   │   │
│   │   │   ├── repositories/       # Реализации репозиториев
│   │   │   │   ├── __init__.py
│   │   │   │   ├── catalog_repo.py
│   │   │   │   ├── bom_repo.py
│   │   │   │   ├── project_repo.py
│   │   │   │   ├── production_repo.py
│   │   │   │   ├── procurement_repo.py
│   │   │   │   └── inventory_repo.py
│   │   │   │
│   │   │   ├── migrations/         # Django migrations
│   │   │   └── unit_of_work.py     # UoW реализация
│   │   │
│   │   ├── cache/                  # Кэширование
│   │   │   ├── __init__.py
│   │   │   └── redis_cache.py
│   │   │
│   │   ├── messaging/              # Celery tasks
│   │   │   ├── __init__.py
│   │   │   ├── tasks/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── recalculation.py
│   │   │   │   ├── notifications.py
│   │   │   │   └── reports.py
│   │   │   └── event_handlers.py
│   │   │
│   │   ├── external/               # Внешние интеграции
│   │   │   ├── __init__.py
│   │   │   └── file_storage.py
│   │   │
│   │   └── security/               # Безопасность
│   │       ├── __init__.py
│   │       ├── permissions.py
│   │       └── authentication.py
│   │
│   ├── presentation/               # PRESENTATION LAYER
│   │   ├── __init__.py
│   │   │
│   │   ├── api/                    # REST API
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── urls.py
│   │   │   │   ├── catalog/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── views.py
│   │   │   │   │   ├── serializers.py
│   │   │   │   │   └── urls.py
│   │   │   │   ├── bom/
│   │   │   │   ├── project/
│   │   │   │   ├── production/
│   │   │   │   ├── procurement/
│   │   │   │   ├── inventory/
│   │   │   │   ├── analytics/
│   │   │   │   └── users/
│   │   │   └── permissions.py
│   │   │
│   │   └── websocket/              # WebSocket для live-обновлений
│   │       ├── __init__.py
│   │       ├── consumers.py
│   │       └── routing.py
│   │
│   └── tests/                      # Тесты
│       ├── __init__.py
│       ├── unit/
│       │   ├── domain/
│       │   └── application/
│       ├── integration/
│       └── e2e/
│
└── frontend/                       # React Frontend
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    │
    ├── public/
    │
    └── src/
        ├── main.tsx
        ├── App.tsx
        │
        ├── api/                    # API клиент
        │   ├── client.ts
        │   ├── endpoints/
        │   └── types/
        │
        ├── store/                  # State management
        │   ├── index.ts
        │   └── slices/
        │
        ├── features/               # Feature-based structure
        │   ├── catalog/
        │   ├── bom/
        │   ├── projects/
        │   ├── production/
        │   ├── procurement/
        │   ├── inventory/
        │   ├── analytics/
        │   └── users/
        │
        ├── components/             # Shared UI components
        │   ├── layout/
        │   ├── forms/
        │   ├── tables/
        │   ├── charts/
        │   └── gantt/
        │
        ├── hooks/
        ├── utils/
        ├── types/
        └── styles/
```

---

## 5. Ключевые архитектурные решения

### 5.1 Версионирование данных
- Каждый агрегат имеет `version` для optimistic locking
- История изменений через `*_history` таблицы
- Soft delete через `deleted_at` поле

### 5.2 Аудит
- Автоматическое логирование всех изменений
- Хранение: кто, когда, что изменил
- Возможность просмотра состояния на любую дату

### 5.3 Права доступа
- RBAC (Role-Based Access Control)
- Контекстные права (роль + объект)
- Наследование прав по иерархии

### 5.4 Асинхронные операции
- Пересчёт прогресса — через Celery
- Формирование отчётов — асинхронно
- Уведомления — через очередь

### 5.5 Расчёт прогресса
```python
# Прогресс системы = среднее арифметическое прогрессов всех дочерних элементов
# Элемент закупки со статусом "На складе" = 100%
# Элемент производства со статусом "Изготовлено" = 100%
```

---

## 6. Интеграции

### 6.1 Внутренние события
- `ItemStatusChanged` — изменение статуса элемента
- `BOMStructureUpdated` — обновление структуры BOM
- `ProgressRecalculationRequired` — триггер пересчёта

### 6.2 Внешние интеграции (будущее)
- Экспорт в Excel
- Интеграция с 1C (опционально)
- Email уведомления

---

## 7. Безопасность (on-premise)

- HTTPS через Nginx
- JWT токены для API
- CORS настройка для SPA
- Rate limiting
- Audit logging
- Backup & Recovery

