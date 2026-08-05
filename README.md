# SysForge — Sysadmin & Developer Toolkit OS

> Десктопная eDEX-UI «ОС»-оболочка для системных администраторов, DevOps и разработчиков: хардкорный HUD-интерфейс, анимированный бут-экран, 24 полнофункциональные мини-программы, фоновые Canvas-эффекты, телеметрия в реальном времени и встроенный терминал. Построена на **React 18 + TypeScript + Vite 5 + Tauri 2 (Rust)**.

---

## 📋 Содержание

- [Обзор](#обзор)
- [Выполненные возможности (Фазы 0–2)](#выполненные-возможности-фазы-02)
- [Мини-программы (24/24)](#мини-программы-2424)
- [Архитектура и безопасность (Rust Async)](#архитектура-и-безопасность-rust-async)
- [Технологии](#технологии)
- [Установка и запуск](#установка-и-запуск)
- [🤖 Планируемый ИИ-помощник «Джарвис» (Фаза 3)](#-планируемый-ии-помощник-джарвис-фаза-3)
- [Лицензия](#лицензия)

---

## 🔍 Обзор

**SysForge** — это профессиональный десктопный HUD-инструментарий в стиле eDEX-UI. Интерфейс организует рабочее пространство системного администратора в единый экран:

- **StatusBar (Сверху)**: Логотип, живые виталы CPU/RAM, статус сети ONLINE, индикатор Джарвиса, полноэкранный режим (F11), часы и кнопка настроек.
- **Sidebar (Слева)**: 4 категории утилит (Network, Security, System, Developer) и 24 полноценные мини-программы.
- **SideRail (Справа)**: Панель приборов — `NetworkMonitor` (трафик eth0), `AudioVisualizer` (эквалайзер), `ActivityHistory` (активность по дням/месяцам).
- **TelemetryBar (Снизу)**: Телеметрическая панель — `CpuRamGraph` (график за 60с), `SystemVitals` (компактные кольца CPU/RAM/DISK/FPS) и интерактивный **MiniTerminal**.
- **Workspace (Центр)**: Рабочая область с перетаскиваемыми и масштабируемыми окнами утилит (`react-rnd`) и оверлейными виджетами (`ClockWidget`, 3D `GlobeWidget`).

---

## ⚡ Выполненные возможности (Фазы 0–2)

### 🛡️ Безопасность и Async Rust
- **Асинхронный бэкенд с таймаутами**: Все сетевые утилиты (`ping`, `tracert`, `nslookup`) переведены на `tokio::task::spawn_blocking` + `tokio::time::timeout`. Программа **никогда не зависает** даже при долгой трассировке или недоступности узла.
- **Скрытое выполнение на Windows**: Включён флаг `CREATE_NO_WINDOW (0x08000000)` — консольные окна не вылезают поверх GUI.
- **Защита от Command Injection**: Все IP/Host значения санитизируются перед передачей в системную консоль.
- **Точные байты памяти**: Форматирование RAM/Disk работает напрямую с байтами без завышения в 1024 раза.

### 🎨 Дизайн и темы (eDEX-UI)
- **3 Основные темы**: `Terminal Green` (дефолт), `Holo Cyan`, `Light Mode`.
- **8 Экспериментальных тем**: `Dark`, `Cyber`, `Crimson`, `Noir`, `Amber`, `Graphite`, `Emerald`, `Ice`.
- **9 Lazy-loaded Canvas фонов**: `Grid`, `Matrix`, `Particles`, `Stars`, `Nebula`, `Storm`, `Circuit`, `Hexagon`, `Aurora`, `Plasma`.
- **Звуковой движок (WebAudio SFX)**: Тактильные sci-fi звуки кликов, открытия/закрытия окон, ошибок и системных тревог.

### 💾 Сохранение настроек
- **Zustand Persistence + Tauri Store**: Настройки персистятся в `$APPDATA/sysforge/settings.json` (в Tauri) или `localStorage` (в браузере).
- **Безопасность API-ключей**: Ключи API (AbuseIPDB, VirusTotal, NVD) хранятся **только в оперативной памяти** сессии.

---

## 🧩 Мини-программы (24/24)

Все 24 утилиты полностью реализованы и готовы к работе:

### 🌐 Network (Сетевые утилиты)
1. **Ping Monitor** (`ping`): Мониторинг латентности нескольких узлов с графиком тренда.
2. **Traceroute** (`traceroute`): Трассировка маршрута с флагами **`-d` (без DNS)** и **`-h` (макс. хопов)**.
3. **Port Scanner** (`port-scanner`): Сканирование TCP-портов (21, 22, 80, 443, 3306 и др.).
4. **Bandwidth Monitor** (`bandwidth`): Скорость приёма/передачи (Mbps) и статистика ошибок интерфейса.
5. **DNS Lookup** (`dns`): Запросы A, AAAA, MX, NS, TXT, CNAME через `nslookup`.
6. **SSH Client** (`ssh`): Эмулятор терминала удаленного подключения с сессией.
7. **Wake-on-LAN** (`wol`): Отправка Magic Packet (102 байта) на MAC-адрес по UDP.

### 🛡️ Security (Безопасность)
8. **Hash Tool** (`hash`): Вычисление MD5, SHA-1, SHA-256, SHA-512 для текста.
9. **SSL Inspector** (`ssl`): Проверка сертификата домена, SAN и дней до истечения.
10. **Password Generator** (`password`): Генератор стойких паролей с настройкой символов.
11. **IP Intelligence** (`ip-intel`): Оценка угрозы IP (Abuse score), геолокация, ISP, Tor/Proxy.
12. **Subnet Calc** (`subnet`): Калькулятор IPv4-сетей, маски, wildcard, диапазона IP.
13. **JWT Decoder** (`jwt`): Декодер и валидатор JSON Web Token (Header / Payload / Signature).
14. **CVE Search** (`cve`): Поиск уязвимостей в базе NVD с фильтрами CVSS.

### 💻 System (Системные)
15. **Process Manager** (`processes`): Живой список процессов (PID, CPU%, Memory), сортировка, поиск и модальное окно завершения процесса (с защитой PID <= 4).
16. **System Overview** (`system-overview`): Обзор CPU, RAM, Swap, ОС, времени аптайма и дисков.
17. **Log Analyzer** (`log`): Drag & Drop просмотрщик лог-файлов с подсветкой ошибок и фильтрами.
18. **File Hash Check** (`file-hash`): Вычисление контрольных сумм файлов (MD5, SHA-1, SHA-256) и сверка.

### 🛠️ Developer (Разработчику)
19. **API Tester** (`api-tester`): REST-клиент (GET, POST, PUT, DELETE, Headers, Body, Response).
20. **Data Formatter** (`formatter`): Валидация, форматирование и минификация JSON.
21. **Encoder / Decoder** (`encoder`): Base64, URL, HTML Entity и Hex кодирование.
22. **Regex Tester** (`regex`): Проверка регулярных выражений в реальном времени с подсветкой групп.
23. **Snippet Manager** (`snippets`): Библиотека фрагментов кода с быстрым копированием.
24. **Diff Viewer** (`diff`): Построчное сравнение текстов с подсветкой изменений.

---

## 🏗️ Архитектура и безопасность (Rust Async)

```
SysForge Frontend (React 18 + Zustand)
       │
       ├─► IPC Invoke (Tauri 2)
       │       │
       │       ▼
       ├─► lib.rs (Rust Backend)
       │     ├─ validate_host() [Защита от инъекций]
       │     ├─ tokio::task::spawn_blocking
       │     └─ tokio::time::timeout (Таймауты 10s - 60s)
       │
       └─► Fallback (В обычном браузере используются безопасные моки)
```

---

## 🛠️ Технологии

- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS, Lucide Icons, Framer Motion, Recharts, Three.js (WebGL Globe).
- **Backend**: Tauri 2, Rust (`sysinfo 0.30`, `tokio 1.0`, `tauri-plugin-store`, `tauri-plugin-fs`, `tauri-plugin-shell`).

---

## 🚀 Установка и запуск

### Требования
- **Node.js** 18+
- **Rust** & **Tauri CLI** (для десктопного запуска)

### Запуск в дев-режиме (Web)
```bash
npm install
npm run dev
```
Откройте `http://localhost:1420`.

### Запуск в режиме Tauri Desktop
```bash
npm run tauri dev
```

### Сборка Production
```bash
npm run build
```

---

## 🤖 Планируемый ИИ-помощник «Джарвис» (Фаза 3)

В следующей фазе в SysForge будет интегрирован голосовой ИИ-ассистент **«Джарвис»**, предназначенный для автоматизации задач управления ОС и браузером:

### Ключевые возможности Джарвиса:
1. **Управление ОС и Браузером**:
   - Выполнение сложная автоматизации (например: *"Джарвис, открой YouTube и включи последнее видео MrBeast"*).
   - Управление окнами и настройками SysForge голосом и текстом.
2. **Обучение и Автономное Приобретение Навыков (Self-Learning & Skill Creation)**:
   - Джарвис сможет обучаться выполнению последовательностей действий по запросу пользователя и сохранять их как готовые скрипты/навыки.
3. **Гибкая Настройка ИИ-провайдеров**:
   - Поддержка **локальных ИИ-моделей** (`Ollama`, `LM Studio`, `LocalAI` через локальный REST API).
   - Поддержка **облачных API** (`OpenAI`, `Google Gemini`, `Anthropic Claude`, `Custom OpenAI-compatible API`).
4. **Интеллектуальные Ответы (QA & Sysadmin Knowledge)**:
   - Чёткие и точные ответы на вопросы по администрированию, программированию и безопасности.
5. **Голосовой и Визуальный HUD Интерфейс**:
   - Распознавание речи (STT) + синтез речи (TTS) с эффектом Sci-Fi голоса.
   - Живой индикатор состояния в `StatusBar` (`IDLE` ➔ `LISTENING` ➔ `THINKING` ➔ `EXECUTING` ➔ `SPEAKING`).

---

## 📄 Лицензия

Private / Proprietary Project — SysForge Team.