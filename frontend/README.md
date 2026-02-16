# PDM ERP Frontend

Профессиональный веб-интерфейс для системы управления проектным производством.

## Технологии

- **React 18** + **TypeScript 5**
- **Vite 5** — сборка
- **Ant Design 5** — UI библиотека
- **TanStack Query** — управление серверным состоянием
- **Zustand** — глобальное состояние
- **React Router 6** — маршрутизация
- **Tailwind CSS** — утилитарные стили

## Структура проекта

```
src/
├── app/                    # Настройка приложения
│   ├── App.tsx
│   └── providers/          # Context providers
├── pages/                  # Страницы (по роутам)
│   ├── auth/
│   ├── dashboard/
│   ├── projects/
│   ├── catalog/
│   ├── bom/
│   ├── procurement/
│   └── settings/
├── features/               # Feature-модули
│   ├── auth/
│   ├── projects/
│   └── catalog/
├── shared/                 # Общий код
│   ├── api/               # API клиент
│   ├── components/        # UI компоненты
│   ├── hooks/             # React hooks
│   ├── utils/             # Утилиты
│   └── types/             # TypeScript типы
└── styles/                # Стили и тема
```

## Запуск

### Установка зависимостей

```bash
npm install
```

### Режим разработки

```bash
npm run dev
```

Приложение будет доступно на http://localhost:3000

### Сборка

```bash
npm run build
```

### Линтинг

```bash
npm run lint
```

## API Прокси

В режиме разработки запросы к `/api` проксируются на `http://127.0.0.1:8000`.

Убедитесь, что Django backend запущен:

```bash
cd ../backend
python manage.py runserver 8000 --settings=config.settings.dev
```

## Архитектурные принципы

- **Feature-based structure** — код организован по функциональным модулям
- **Colocation** — связанные файлы находятся рядом
- **Single Responsibility** — каждый компонент отвечает за одну задачу
- **Type Safety** — строгая типизация TypeScript

## UX Принципы

- **Information First** — данные важнее декора
- **Цвет = Смысл** — минимум цветов, каждый несёт семантику
- **Предсказуемость** — консистентное поведение во всех модулях
- **Минимум кликов** — 3 клика до любой информации
