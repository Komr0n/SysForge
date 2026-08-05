# SysForge — Sysadmin Toolkit OS

> Десктопная «ОС»-оболочка для системных администраторов и разработчиков: бут-экран, рабочий стол с окнами, сайдбар с мини-программами, фоновыми эффектами и виджетами. Построена на **React + TypeScript + Vite + Tauri**.

---

## Содержание

- [Обзор](#обзор)
- [Возможности](#возможности)
- [Технологии](#технологии)
- [Структура проекта](#структура-проекта)
- [Установка и запуск](#установка-и-запуск)
- [Скрипты](#скрипты)
- [Мини-программы](#мини-программы)
- [Виджеты и фон](#виджеты-и-фон)
- [Настройки](#настройки)
- [Архитектура](#архитектура)
- [Скриншоты концепта](#скриншоты-концепта)
- [Лицензия](#лицензия)

---

## Обзор

**SysForge** имитирует интерфейс киберпанк-операционной системы внутри одного веб-приложения (или десктоп-окна через Tauri). После анимированного бут-экрана пользователь попадает на рабочий стол:

- **Header** сверху — логотип, часы, кнопка Settings.
- **Sidebar** слева — категории (Network / Security / System / Developer) и список мини-программ.
- **Workspace** — рабочая область с перетаскиваемыми окнами, фоновыми эффектами и ambient-виджетами (часы, системные виталы, 3D-глобус).
- **Taskbar** снизу — список открытых и свёрнутых окон, системный трей с часами.

Каждая мини-программа открывается в собственном окне (`WindowFrame`), которое можно двигать, ресайзить, сворачивать, разворачивать и закрывать.

---

## Возможности

### Загрузка (Boot Screen)
- Длинный BIOS-стиль загрузки с typewriter-эффектом, логотипом с глитчем, радар-развёрткой и прогресс-баром.
- **Пробел** (или любая клавиша / клик) пропускает загрузку к стартовому гейту.
- В конце загрузки — **"SYSTEM READY — PRESS SPACE TO START"**: система ждёт нажатия клавиши, прежде чем начать работу (фича).

### Менеджер окон
- Перетаскиваемые и масштабируемые окна на базе `react-rnd`.
- Z-index управление (фокус по клику, «поверх всех»).
- Сворачивание / разворачивание / восстановление / закрытие.
- Анимации появления через `framer-motion`.
- Защита через `ErrorBoundary` — падение одного окна не роняет всю оболочку.

### Мини-программы (Apps)
- Категории: **Network**, **Security**, **System**, **Developer**.
- Реестр компонентов в `src/apps/registry.tsx`.
- Часть программ реализована полностью, остальные показывают заглушку «MODULE NOT YET IMPLEMENTED».

### Фоновые эффекты
- **Matrix Rain** (по умолчанию) — классический «матричный» дождь на Canvas 2D.
- **Cyber Grid** — анимированная сетка.
- **Gradient** — статичный радиальный градиент.
- **Star Field** — звёздное поле с эффектом гиперпрыжка (Canvas 2D, без WebGL).
- **None** — без эффекта.
- Scanline-оверлей для CRT-эффекта.

### Виджеты
- **ClockWidget** — большие часы, дата, часовой пояс.
- **SystemVitals** — SVG-кольца: CPU, RAM, DISK и **FPS** (реальное измерение через `requestAnimationFrame`).
- **GlobeWidget** — 3D-глобус с орбитальными точками (Three.js / WebGL, с защитой от краха).

### Настройки (Settings Panel)
- **Appearance**: выбор темы (Dark / Cyber Green / Light) и фона (5 вариантов).
- **Performance**: Globe Widget, Reduce Motion, Low Power Mode, FPS Cap (24/30/60/120).
- **Audio**: вкл/выкл звуковые эффекты.
- **API Keys**: поля для AbuseIPDB, VirusTotal, NVD (хранятся в памяти).

---

## Технологии

| Категория | Технология |
|-----------|------------|
| UI | React 18, TypeScript |
| Сборка | Vite 5 |
| Десктоп | Tauri 2 (Rust) |
| Состояние | Zustand |
| Окна | react-rnd |
| Анимации | framer-motion |
| 3D | three.js |
| Иконки | lucide-react |
| Стили | Tailwind CSS + кастомный CSS |
| Графики | recharts (зависимость) |

---

## Структура проекта

```
sysforge/
├── index.html              # HTML-точка входа
├── package.json            # Зависимости и скрипты
├── vite.config.ts          # Конфиг Vite (порт 1420 для Tauri)
├── tailwind.config.js      # Конфиг Tailwind (тема, анимации)
├── tsconfig.json           # Конфиг TypeScript
├── postcss.config.js       # PostCSS (Tailwind + autoprefixer)
├── .gitignore              # Игнорируемые файлы
├── README.md               # Этот файл
│
├── public/                 # Статические ассеты
│
├── src/                    # Исходники фронтенда
│   ├── main.tsx            # Точка входа React
│   ├── App.tsx             # Корневой компонент (boot → desktop)
│   ├── index.css           # Глобальные стили и CSS-переменные
│   ├── vite-env.d.ts       # Типы Vite
│   │
│   ├── apps/               # Мини-программы
│   │   ├── registry.tsx    # Реестр: id → компонент
│   │   ├── network/        # PingMonitor, PortScanner, DnsLookup
│   │   ├── security/       # HashTool, PasswordGenerator, SubnetCalc, JwtDecoder
│   │   ├── system/         # SystemOverview
│   │   └── developer/      # EncoderDecoder
│   │
│   ├── components/         # UI-компоненты оболочки
│   │   ├── BootScreen/     # Анимированный бут-экран
│   │   ├── Header/         # Верхняя панель + Settings
│   │   ├── Sidebar/        # Категории и список программ
│   │   ├── Taskbar/        # Нижняя панель задач
│   │   ├── WindowFrame/    # Рамка окна (drag/resize/min/max)
│   │   ├── ErrorBoundary/  # Перехват ошибок React
│   │   ├── Settings/       # Модальная панель настроек
│   │   ├── effects/        # BackgroundEffects, MatrixRain, StarField, ParticleNetwork
│   │   ├── widgets/        # ClockWidget, SystemVitals, GlobeWidget
│   │   └── ui/             # Переиспользуемые UI: Card, Button, Input, Select, Badge
│   │
│   ├── hooks/              # Хуки
│   │   ├── useTauri.ts     # Обёртка над invoke() с browser-fallback
│   │   └── useInterval.ts  # setInterval-хук
│   │
│   └── store/              # Zustand-сторы
│       ├── windowStore.ts  # Менеджер окон
│       ├── settingsStore.ts# Настройки (тема, фон, производительность, API-ключи)
│       └── historyStore.ts # История (HTTP, поиск)
│
└── src-tauri/              # Бэкенд Tauri (Rust)
    ├── Cargo.toml          # Зависимости Rust
    ├── tauri.conf.json     # Конфиг Tauri (окно, иконки, capabilities)
    ├── build.rs            # Скрипт сборки
    ├── src/                # main.rs, lib.rs
    ├── icons/              # Иконки приложения
    └── capabilities/       # Права Tauri
```

---

## Установка и запуск

### Требования
- **Node.js** 18+
- **npm** (или yarn/pnpm)
- Для десктоп-сборки: **Rust** + **Tauri CLI** (см. [tauri.app](https://tauri.app))

### Установка зависимостей

```bash
cd sysforge
npm install
```

### Запуск в браузере (web-режим)

```bash
npm run dev
```

Открой **http://localhost:1420** в браузере. В web-режиме Tauri-команды возвращают `undefined`, а мини-программы используют mock-данные.

### Запуск как десктоп-приложение (Tauri)

```bash
npm run tauri dev
```

Для production-сборки:

```bash
npm run tauri build
```

---

## Скрипты

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запуск Vite dev-сервера (порт 1420) |
| `npm run build` | `tsc && vite build` — проверка типов и production-сборка |
| `npm run preview` | Предпросмотр production-сборки |
| `npm run tauri` | Доступ к Tauri CLI (`tauri dev`, `tauri build`) |

---

## Мини-программы

### Network
| ID | Название | Статус |
|----|----------|--------|
| `ping` | Ping Monitor | ✅ Реализован (симуляция) |
| `traceroute` | Traceroute | ⏳ Заглушка |
| `port-scanner` | Port Scanner | ✅ Реализован (симуляция) |
| `bandwidth` | Bandwidth | ⏳ Заглушка |
| `dns` | DNS Lookup | ✅ Реализован (mock) |
| `ssh` | SSH Client | ⏳ Заглушка |
| `wol` | Wake-on-LAN | ⏳ Заглушка |

### Security
| ID | Название | Статус |
|----|----------|--------|
| `hash` | Hash Tool | ✅ Реализован (MD5/SHA/CRC32, Web Crypto) |
| `ssl` | SSL Inspector | ⏳ Заглушка |
| `password` | Password Generator | ✅ Реализован |
| `ip-intel` | IP Intelligence | ⏳ Заглушка |
| `subnet` | Subnet Calc | ✅ Реализован |
| `jwt` | JWT Decoder | ✅ Реализован |
| `cve` | CVE Search | ⏳ Заглушка |

### System
| ID | Название | Статус |
|----|----------|--------|
| `processes` | Process Manager | ⏳ Заглушка |
| `system-overview` | System Overview | ✅ Реализован (mock / Tauri) |
| `logs` | Log Analyzer | ⏳ Заглушка |
| `file-hash` | File Hash Check | ⏳ Заглушка |

### Developer
| ID | Название | Статус |
|----|----------|--------|
| `api-tester` | API Tester | ⏳ Заглушка |
| `formatter` | Data Formatter | ⏳ Заглушка |
| `encoder` | Encoder/Decoder | ✅ Реализован |
| `regex` | Regex Tester | ⏳ Заглушка |
| `snippets` | Snippet Manager | ⏳ Заглушка |
| `diff` | Diff Viewer | ⏳ Заглушка |

> ✅ = полностью реализован · ⏳ = заглушка «MODULE NOT YET IMPLEMENTED»

---

## Виджеты и фон

### SystemVitals
SVG-кольца в правом нижнем углу:
- **CPU** (красный) — загрузка процессора
- **RAM** (синий) — использование памяти
- **DISK** (зелёный) — занятость диска
- **FPS** (жёлтый) — реальный FPS рендера

### Фоны
Выбор через **Settings → Appearance → Background**:
- `matrix` — Matrix Rain (по умолчанию)
- `grid` — Cyber Grid
- `gradient` — Gradient
- `stars` — Star Field
- `none` — без эффекта

В **Low Power Mode** всегда используется статичный градиент.

---

## Настройки

Открываются кнопкой **Settings** в Header. Разделы:

### Appearance
- **Theme**: Dark / Cyber Green / Light
- **Background**: Matrix / Grid / Gradient / Stars / None

### Performance
- Globe Widget (вкл/выкл 3D-глобус)
- Reduce Motion
- Low Power Mode
- FPS Cap: 24 / 30 / 60 / 120

### Audio
- Audio Effects (вкл/выкл)

### API Keys
- AbuseIPDB, VirusTotal, NVD (хранятся в памяти, не персистятся)

---

## Архитектура

### Поток данных
```
App.tsx
  ├─ BootScreen (пока bootComplete === false)
  └─ Desktop
       ├─ BackgroundEffects ← settingsStore.background
       ├─ Header → SettingsPanel ← settingsStore
       ├─ Sidebar → windowStore.openWindow()
       ├─ Workspace
       │    ├─ ClockWidget
       │    ├─ SystemVitals (CPU/RAM/DISK/FPS)
       │    ├─ GlobeWidget ← settingsStore.performance.globeWidget
       │    └─ WindowFrame[] ← windowStore.windows
       │         └─ getAppComponent(id) ← apps/registry.tsx
       └─ Taskbar ← windowStore
```

### Сторы (Zustand)
- **`windowStore`** — `Map<id, WindowState>`, управление окнами (open/close/min/max/restore/focus/position/size).
- **`settingsStore`** — тема, фон, производительность, аудио, API-ключи.
- **`historyStore`** — история HTTP-запросов и поиска.

### Tauri-интеграция
- `useTauri()` — хук-обёртка: в браузере возвращает `undefined`, в Tauri вызывает Rust-команды через динамический `import('@tauri-apps/api/core')`.
- Мини-программы (например, `SystemOverview`) проверяют `isAvailable` и используют mock-данные в web-режиме.

### Защита от краха
- `ErrorBoundary` оборачивает `BackgroundEffects`, `GlobeWidget` и блок окон — падение одного компонента не роняет весь UI.
- WebGL-инициализация (`THREE.WebGLRenderer`) в `ParticleNetwork` и `GlobeWidget` обёрнута в `try/catch`.

---

## Скриншоты концепта

> _Добавь сюда скриншоты после запуска:_
> 1. Boot screen с радаром и логотипом
> 2. Рабочий стол с Matrix Rain и Sidebar
> 3. Открытое окно мини-программы
> 4. Панель настроек

---

## Лицензия

Уточни лицензию (например, MIT). По умолчанию — приватный проект.

---

## Roadmap (идеи)

- [ ] Персистентность настроек (localStorage / Tauri store)
- [ ] Реальные Tauri-команды для Ping/PortScanner/DNS
- [ ] SSH-клиент через `tauri-plugin-shell`
- [ ] Process Manager с реальными данными системы
- [ ] Drag-and-drop файлов для File Hash Check
- [ ] Темы: полноценная реализация Cyber Green / Light
- [ ] Звуковые эффекты UI
- [ ] Code-splitting и lazy-loading мини-программ