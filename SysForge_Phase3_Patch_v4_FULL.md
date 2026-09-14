# Патч-ТЗ v4 — сводный: остаток v2, весь v3, доработанные идеи, окно ожидания

## Сначала — честный отчёт по вопросу "старые баги ещё не исправлены?"

Перепроверил построчно по актуальному коду, а не предположил на всякий
случай, как в прошлый раз. Результат:

| Пункт из v2 | Статус |
|---|---|
| A.1 RCE в `open_system_app` | ✅ Исправлено — жёсткий whitelist есть |
| A.2 Бэкдор в `delete_file` | ✅ Исправлено — команда удалена целиком |
| A.3 `load_skill` в обход подтверждения | ✅ Исправлено — шаги идут через `executeTool()` |
| A.4 CSP блокирует LLM-запросы | ✅ Исправлено — `jarvis_llm_request` через Rust в Tauri-режиме, `fetch()` остался только как осознанный fallback для браузерного dev-режима |
| **A.5 Ключи провайдеров пишутся на диск** | ❌ **Не исправлено — и стало хуже** |
| B.1–B.5 (фронтенд) | ✅ Все исправлены |
| C.1–C.3 (обучение навыкам) | ✅ Реализовано (`discover_app`, `propose_new_skill`, `jarvis_find_app`) |
| D.1 Баг сборки (`external`) | ✅ Исправлено |
| D.2 WebView2 | ✅ Настроено |

Так что заново включать весь список не нужно — реально открыт только один
пункт, и его я включаю ниже как Часть A. Всё остальное в этом файле — это
Часть E–H из предыдущего патча (v3), которые вы попросили доработать плюс
две новые вещи (Часть I — ваши понравившиеся идеи, Часть J — окно ожидания
после команды).

---

## Часть A — Единственный оставшийся баг из v2: ключи провайдеров на диске

Сейчас в `settingsStore.ts`:
```typescript
partialize: (state) => state,
```
Это персистит **весь** стейт целиком, без каких-либо исключений — то есть
теперь на диск в `$APPDATA/sysforge/...` пишутся не только новые
`jarvis.cloud.apiKey`/`jarvis.cloudProviders[].apiKey`, но и старые
`apiKeys` (nvd/abuseipdb), которые раньше специально исключались. Это
регресс относительно даже исходного (до-Джарвисовского) состояния проекта.

```diff
-      partialize: (state) => state,
+      partialize: (state) => {
+        const { apiKeys, ...rest } = state;
+        return {
+          ...rest,
+          jarvis: {
+            ...rest.jarvis,
+            cloud: { ...rest.jarvis.cloud, apiKey: '' },
+            cloudProviders: (rest.jarvis.cloudProviders || []).map((p) => ({ ...p, apiKey: '' })),
+          },
+        };
+      },
```
И проверить `merge()` (он уже в файле правильно берёт часть полей из
`current`, а не из `saved`) — добавить туда аналогичную логику: если в
`current` (текущая сессия, введённые пользователем ключи) уже есть значение
`apiKey`, не затирать его пустой строкой из `saved`.

---

## Часть E — Баги распознавания команд (open/close, keyword-шум)

*(без изменений относительно v3 — не была применена, включаю снова)*

### E.1–E.2. Новый инструмент закрытия по имени процесса

Важное отличие от уже существующего `close_app` — тот закрывает **окно
мини-программы SysForge** (`windowStore.closeWindow`), а не реальный
Windows-процесс. Нужен отдельный, новый tool — назовём его `close_os_app`,
чтобы не путать с существующим:

`src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn close_os_app_by_name(state: State<AppState>, name: String) -> Result<String, String> {
    let query = name.trim().to_lowercase();
    if query.is_empty() { return Err("Имя приложения не указано".into()); }

    let mut sys = state.system.lock().unwrap();
    sys.refresh_processes();

    let matches: Vec<_> = sys.processes().iter()
        .filter(|(_, p)| p.name().to_lowercase().contains(&query))
        .collect();

    if matches.is_empty() {
        return Err(format!("Процесс '{}' не найден среди запущенных.", name));
    }

    let mut closed = Vec::new();
    for (pid, process) in &matches {
        if pid.as_u32() <= 4 { continue; }
        if process.kill_with(Signal::Kill).unwrap_or(false) || process.kill() {
            closed.push(process.name().to_string());
            println!("[AUDIT] Closed by name: {} (PID {})", process.name(), pid.as_u32());
        }
    }

    if closed.is_empty() {
        Err(format!("Не удалось закрыть '{}' — отказано в доступе.", name))
    } else {
        Ok(format!("Закрыто: {}", closed.join(", ")))
    }
}
```
`src/lib/jarvis/tools-schema.ts`:
```diff
+{
+  name: 'close_os_app',
+  description: 'Закрыть запущенное приложение Windows по имени процесса (chrome, telegram, calculator и т.д.) — в отличие от close_app, это закрывает саму программу в ОС, а не окно мини-программы SysForge',
+  safetyLevel: 'requires_confirmation',
+  requiresAudit: true,
+  parameters: {
+    type: 'object',
+    properties: { appName: { type: 'string' } },
+    required: ['appName'],
+  },
+},
```
`tool-executor.ts`:
```diff
+case 'close_os_app': {
+  const result = await invoke<string>('close_os_app_by_name', { name: args.appName as string });
+  return { success: true, message: result };
+}
```

### E.3. Программная генерация open/close-паттернов в `direct-commands.ts`

```typescript
interface AppDef {
  appId: string;
  displayName: string;
  aliases: string[];
  kind: 'system_app' | 'url';
  urlOrNothing?: string;
}

const APPS: AppDef[] = [
  { appId: 'calculator', displayName: 'Калькулятор', aliases: ['калькулятор', 'кальк', 'calculator', 'calc'], kind: 'system_app' },
  { appId: 'notepad', displayName: 'Блокнот', aliases: ['блокнот', 'notepad'], kind: 'system_app' },
  { appId: 'explorer', displayName: 'Проводник', aliases: ['проводник', 'explorer'], kind: 'system_app' },
  { appId: 'task_manager', displayName: 'Диспетчер задач', aliases: ['диспетчер задач', 'task manager', 'taskmgr'], kind: 'system_app' },
  { appId: 'paint', displayName: 'Paint', aliases: ['paint', 'паинт'], kind: 'system_app' },
  { appId: 'chrome', displayName: 'Chrome', aliases: ['хром', 'chrome'], kind: 'url', urlOrNothing: 'https://google.com' },
  { appId: 'telegram', displayName: 'Telegram', aliases: ['телеграм', 'телега', 'telegram'], kind: 'system_app' },
];

const OPEN_VERBS = 'открой|запусти|старт|включи|launch|open|start';
const CLOSE_VERBS = 'закрой|заверши|убей|останови|выключи|kill|close|stop|quit';

function buildAppCommands(): DirectCommandPattern[] {
  const result: DirectCommandPattern[] = [];
  for (const app of APPS) {
    const aliasGroup = app.aliases.join('|');
    result.push({
      patterns: [prog(`(${OPEN_VERBS})\\s+(${aliasGroup})`)],
      handler: () => ({
        toolName: app.kind === 'url' ? 'open_url' : 'open_system_app',
        args: app.kind === 'url' ? { url: app.urlOrNothing } : { appId: app.appId, displayName: app.displayName },
        displayText: `Открываю ${app.displayName.toLowerCase()}, сэр.`,
      }),
    });
    // Close-паттерн генерируется автоматически для каждого приложения —
    // структурно исключает повторение бага "забыли добавить закрытие".
    result.push({
      patterns: [prog(`(${CLOSE_VERBS})\\s+(${aliasGroup})`)],
      handler: () => ({
        toolName: 'close_os_app',
        args: { appName: app.aliases.find((a) => /^[a-z]+$/i.test(a)) ?? app.appId },
        displayText: `Закрываю ${app.displayName.toLowerCase()}, сэр.`,
      }),
    });
  }
  return result;
}

const DIRECT_COMMANDS: DirectCommandPattern[] = [
  ...buildAppCommands(),
  // остальные блоки (приветствия, темы, фон, пинг) — без изменений
];
```

### E.4. Keyword-фоллбэк — убрать шум от общих глаголов

`hybrid-router.ts`:
```diff
+const STOP_VERBS = new Set([
+  'открой', 'запусти', 'старт', 'включи', 'launch', 'open', 'start',
+  'закрой', 'заверши', 'убей', 'останови', 'выключи', 'kill', 'close', 'stop', 'quit',
+  'покажи', 'показать', 'сделай', 'do', 'show',
+]);
+const CLOSE_INTENT = /\b(закрой|заверши|убей|останови|выключи|kill|close|stop|quit)\b/i;
+const OPEN_INTENT  = /\b(открой|запусти|старт|включи|launch|open|start)\b/i;

 function keywordMatch(text: string): EmbeddingMatch | null {
   const lower = text.toLowerCase();
   const builtins = skillRegistry.getBuiltinSkills();
+  const userWantsClose = CLOSE_INTENT.test(lower);
+  const userWantsOpen = OPEN_INTENT.test(lower);
   let bestMatch: { skillId: string; score: number } | null = null;

   for (const skill of builtins) {
     const phrases = [...(skill.phrases.ru || []), ...(skill.phrases.en || [])];
     for (const phrase of phrases) {
       const phraseLower = phrase.toLowerCase();
+      if (userWantsClose && OPEN_INTENT.test(phraseLower) && !CLOSE_INTENT.test(phraseLower)) continue;
+      if (userWantsOpen && CLOSE_INTENT.test(phraseLower) && !OPEN_INTENT.test(phraseLower)) continue;

       const words = phraseLower.split(' ');
       let score = 0; let matches = 0;
       for (const word of words) {
-        if (word.length > 2 && lower.includes(word)) {
+        if (word.length > 2 && !STOP_VERBS.has(word) && lower.includes(word)) {
           matches++; score += word.length;
         }
       }
       if (matches > 0) {
         const confidence = score / (phraseLower.length + 1);
         if (!bestMatch || confidence > bestMatch.score) bestMatch = { skillId: skill.id, score: confidence };
       }
     }
   }
   if (bestMatch && bestMatch.score >= 0.15) {
     return { skill_id: bestMatch.skillId, confidence: bestMatch.score, extracted_slots: {} };
   }
   return null;
 }
```

---

## Часть F — Таймер автозакрытия приложений

Живёт в памяти процесса SysForge — переживает сворачивание в трей, но не
полное закрытие программы. Если нужно переживать и это — отдельная, более
тяжёлая архитектура (фоновая служба), не в этой итерации.

`src-tauri/src/lib.rs`:
```rust
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter;

struct SchedulerState { timers: Mutex<HashMap<String, tokio::task::JoinHandle<()>>> }

#[derive(Clone, serde::Serialize)]
struct ScheduledClose { id: String, app_name: String, fires_at_ms: u64 }

#[tauri::command]
async fn schedule_close_app(
    app_handle: tauri::AppHandle,
    scheduler: State<'_, SchedulerState>,
    app_name: String,
    delay_seconds: u64,
) -> Result<ScheduledClose, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let fires_at_ms = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64) + delay_seconds * 1000;
    let handle_id = id.clone();
    let name_clone = app_name.clone();
    let app_handle_clone = app_handle.clone();

    let handle = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(delay_seconds)).await;
        let state: State<AppState> = app_handle_clone.state();
        let mut sys = state.system.lock().unwrap();
        sys.refresh_processes();
        let query = name_clone.to_lowercase();
        for (pid, p) in sys.processes() {
            if pid.as_u32() > 4 && p.name().to_lowercase().contains(&query) {
                let _ = p.kill_with(Signal::Kill);
            }
        }
        let _ = app_handle_clone.emit("jarvis:timer-fired", &name_clone);
    });

    scheduler.timers.lock().unwrap().insert(handle_id, handle);
    Ok(ScheduledClose { id, app_name, fires_at_ms })
}

#[tauri::command]
fn cancel_scheduled_close(scheduler: State<SchedulerState>, id: String) -> Result<(), String> {
    if let Some(handle) = scheduler.timers.lock().unwrap().remove(&id) {
        handle.abort();
        Ok(())
    } else {
        Err("Таймер не найден".into())
    }
}
```
(`.manage(SchedulerState { timers: Mutex::new(HashMap::new()) })` при старте,
плюс зависимость `uuid = { version = "1", features = ["v4"] }`).

UI: `src/apps/system/AppScheduler.tsx` — список активных таймеров с
обратным отсчётом и кнопкой отмены, форма добавления (процесс из
`get_processes` + пресеты 15/30/60 мин или произвольно).

Голосовой tool:
```typescript
{
  name: 'schedule_close_app',
  description: 'Запланировать закрытие приложения через заданное время',
  safetyLevel: 'safe',
  requiresAudit: true,
  parameters: {
    type: 'object',
    properties: { appName: { type: 'string' }, delayMinutes: { type: 'number' } },
    required: ['appName', 'delayMinutes'],
  },
},
```
При срабатывании — системное уведомление через `tauri-plugin-notification`
(«SysForge закрыл Chrome по расписанию»), чтобы не выглядело как зависание.

---

## Часть G — Виджет сетевой активности по процессам

`sysinfo` не даёт байты сети в разрезе процесса на Windows — только по
интерфейсам целиком. Точные MB/s по процессу (как в Resource Monitor) —
через ETW (`Microsoft-Windows-Kernel-Network`), крейт [`ferrisetw`]. Это
может потребовать **прав администратора** для подписки на ETW-провайдер —
нужно проверить на реальной машине до проектирования всего виджета.

**Рекомендация: начать с упрощённого MVP** — не байты в реальном времени, а
список процессов с активными TCP/UDP-соединениями через
`GetExtendedTcpTable`/`GetExtendedUdpTable` (Windows IP Helper API):
«Chrome: 3 активных соединения» вместо «Chrome: 4.2 МБ/с». Не требует ETW и
admin-прав, реализуется заметно быстрее. Переходить к полной версии (ETW,
Часть G.2 ниже) — только если станет ясно, что точные MB/s действительно
нужны, а не просто «что сейчас активно».

Полная версия (когда/если понадобится):
1. Подписка на `Microsoft-Windows-Kernel-Network` через `ferrisetw`.
2. В обработчике TCP/UDP send/receive событий — агрегация байт по `pid` в
   скользящем окне (например, 2 сек) → MB/s делением на интервал.
3. Раз в секунду — снапшот `{ pid, name, bytes_per_sec_in, bytes_per_sec_out }`
   через `app_handle.emit("jarvis:network-usage", snapshot)`.
4. Фронтенд — `NetworkByProcess.tsx`, список процессов по убыванию трафика.

---

## Часть H — 3D-сфера Джарвиса (по образцу референса)

Два уровня, чтобы не сломать code-splitting: свёрнутый вид в `StatusBar` —
остаётся лёгкий 2D-canvas (можно добавить пару статичных полупрозрачных
колец вокруг для того же ощущения дёшево); развёрнутый вид — полноценная
3D wireframe-сфера, монтируется **только когда открыт `JarvisChat`**, через
`React.lazy()`.

```tsx
// src/components/JarvisUI/JarvisOrb3D.tsx
import { lazy, Suspense } from 'react';
const JarvisOrb3DImpl = lazy(() => import('./JarvisOrb3DImpl'));

export function JarvisOrb3D(props: { state: JarvisState; size?: number }) {
  return (
    <Suspense fallback={<div style={{ width: props.size ?? 120, height: props.size ?? 120 }} />}>
      <JarvisOrb3DImpl {...props} />
    </Suspense>
  );
}
```
`JarvisOrb3DImpl.tsx` — писать императивно на чистом `three.js`, по образцу
уже существующего `GlobeWidget.tsx` (тот же паттерн `useEffect` + ref на
контейнер), а не заводить новую зависимость `@react-three/fiber` — в
проекте уже есть один устоявшийся способ работы с three.js, лучше не плодить
второй. Геометрия — `THREE.IcosahedronGeometry(1.6, 3)` с
`wireframe: true`, плюс 2–3 полупрозрачных `THREE.RingGeometry` вокруг,
медленно вращающихся в разные стороны, плюс `THREE.Points` с частицами по
сфере большего радиуса для эффекта пыли с референса.

Показывается в шапке `JarvisChat.tsx` вместо текущей иконки/заголовка.

---

## Часть I — Доработанные идеи (теперь как полноценные фичи)

### I.1. Пороговые голосовые предупреждения (CPU/RAM/диск)

Новый файл `src/lib/jarvis/threshold-watcher.ts` — раз в 5 сек опрашивает
`get_system_status`, сравнивает с порогами из настроек, при превышении (и не
чаще раза в 5 минут на один и тот же порог, чтобы не спамить) — озвучивает
через уже существующий `jarvis-tts.ts` и/или системное уведомление.

```typescript
interface ThresholdConfig {
  cpuPercent?: number;      // например, 90
  ramPercent?: number;      // например, 90
  diskPercent?: number;
  cooldownMs: number;       // 5 * 60 * 1000 по умолчанию
}

export class ThresholdWatcher {
  private lastFired: Record<string, number> = {};
  private timer: ReturnType<typeof setInterval> | null = null;

  start(config: ThresholdConfig) {
    this.timer = setInterval(async () => this.check(config), 5000);
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  private async check(config: ThresholdConfig) {
    const status = await invoke<SystemStatus>('get_system_info');
    const now = Date.now();
    const checks: [string, number | undefined, number, string][] = [
      ['cpu', config.cpuPercent, status.cpu_usage_percent, `Внимание, сэр. Загрузка процессора превысила ${config.cpuPercent}%.`],
      ['ram', config.ramPercent, status.memory_used_percent, `Внимание, сэр. Память заполнена более чем на ${config.ramPercent}%.`],
    ];
    for (const [key, threshold, value, message] of checks) {
      if (threshold == null) continue;
      if (value >= threshold && (now - (this.lastFired[key] ?? 0)) > config.cooldownMs) {
        this.lastFired[key] = now;
        speakText(message); // из jarvis-tts.ts
        notify('SysForge', message);
      }
    }
  }
}
```
Настройка — новая секция в `JarvisSettings.tsx`: чекбоксы вкл/выкл на CPU/RAM/
диск, ползунок порога (по умолчанию 90%), интервал "не чаще раза в N минут".

### I.2. Поиск по истории команд

`session-history.ts` уже хранит историю в памяти сессии — расширить до
персистентного лога (аналогично `jarvis-audit.log`, но для диалога, не для
инструментов) + добавить строку поиска в `JarvisLog.tsx`:
```typescript
// session-history.ts
async persistTurn(turn: { role: string; content: string; timestamp: string }) {
  await appendTextFile('$APPDATA/sysforge/jarvis-history.log', JSON.stringify(turn) + '\n');
}

export async function searchHistory(query: string, limit = 50): Promise<HistoryTurn[]> {
  const content = await readTextFile('$APPDATA/sysforge/jarvis-history.log');
  return content.split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((t) => t.content.toLowerCase().includes(query.toLowerCase()))
    .slice(-limit);
}
```
В `JarvisLog.tsx` — поле поиска сверху, фильтрует отображаемые записи на
лету (debounce 200мс), не требует отдельного запроса при каждом нажатии.

### I.3. Групповые навыки ("вечерний режим" одной кнопкой)

Формат `skill.toml` уже поддерживает несколько шагов — не хватает только
**UI-конструктора** для сборки такого навыка без ручного диалога с Джарвисом.
Расширить `SkillCreator.tsx`: кнопка «Добавить ещё шаг» с выпадающим списком
доступных tools (из `tools-schema.ts`) — пользователь может собрать
последовательность («закрыть Chrome» → «закрыть Telegram» → «сменить тему на
dark» → «приглушить звук») кликами, без необходимости формулировать это
голосом целиком за один раз.

### I.4. Экспорт/импорт навыков

```typescript
// skill-registry.ts
async exportSkill(id: string): Promise<string> {
  const skill = await this.loadSkill(id);
  return skillToToml(skill); // уже есть сериализатор из Фазы 3
}

async importSkillFromToml(tomlContent: string): Promise<Skill> {
  const skill = parseTomlToSkill(tomlContent);
  const validation = validateSkillSandbox(skill);
  if (!validation.valid) throw new Error(`Импорт отклонён: навык требует sandbox выше заявленного (${validation.violatingTool})`);
  await this.saveSkill(skill);
  return skill;
}
```
UI: кнопка «Экспортировать» в списке навыков (сохраняет `.toml` файл через
диалог сохранения), «Импортировать» — открывает диалог выбора файла,
показывает предпросмотр шагов **перед** сохранением (тот же
`validateSkillSandbox`, что и везде — импортированный навык не может
обойти проверку уровня доступа).

### I.5. Индикатор "микрофон активен" в системном трее

Через `tauri-plugin-tray` (или встроенный `TrayIcon` API Tauri v2) — менять
иконку трея на отдельную (с красной точкой) когда `voiceService` в состоянии
`listening`, возвращать обычную — когда `idle`. Простая, но важная для
приватности деталь: пользователь должен видеть, что микрофон слушает, даже
когда окно SysForge свёрнуто и не видно `StatusBar`.

```typescript
// voice-service.ts, в setState()
private setState(newState: JarvisState) {
  this._state = newState;
  invoke('set_tray_icon', { active: newState === 'listening' }).catch(() => {});
  this.stateListeners.forEach((l) => l(newState));
}
```
```rust
#[tauri::command]
fn set_tray_icon(app: tauri::AppHandle, active: bool) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;
    let icon_path = if active { "icons/tray-listening.png" } else { "icons/tray-idle.png" };
    tray.set_icon(Some(tauri::image::Image::from_path(icon_path).map_err(|e| e.to_string())?))
        .map_err(|e| e.to_string())
}
```
(нужны две дополнительные иконки в `icons/`, обычная и с индикатором записи).

---

## Часть J — Окно ожидания 3–5 сек после команды (не звать заново каждый раз)

### J.1. Идея

Сейчас цикл такой: сказали "Джарвис, ..." → команда выполнена → чтобы дать
следующую, нужно снова произнести wake word. Нужно: после выполнения
голосовой команды держать микрофон "горячим" ещё несколько секунд — если
пользователь сразу говорит следующую команду, она распознаётся без "Джарвис"
в начале; если тишина — возврат к обычному режиму (снова нужен wake word).

### J.2. Реализация в `voice-service.ts`

Добавить новый метод, переиспользующий существующую инфраструктуру
`startListening()`/`stopListening()`, но с явным окном ожидания и
автоматическим откатом в wake-word режим по истечении:

```typescript
// voice-service.ts — новое поле в классе
private followUpTimer: ReturnType<typeof setTimeout> | null = null;
public isFollowUpWindow = false;

async startFollowUpListening(windowMs?: number) {
  if (!this.config.sttEnabled || !this.config.followUpListening) return;

  const duration = windowMs ?? this.config.followUpWindowMs ?? 4000;

  this.stopAllTimers();
  this.destroyRecognition();
  this.lastCapturedText = '';
  this.interimAccumulator = '';
  this.isWakeWordMode = false;
  this.isCommandMode = true;
  this.isFollowUpWindow = true;
  this.setState('listening');
  this.followUpListeners.forEach((l) => l(true)); // для UI-индикатора отдельного цвета

  this.followUpTimer = setTimeout(() => {
    // За окно ничего не сказали — тихо возвращаемся в обычный режим
    if (this.isCommandMode && !this.lastCapturedText && !this.interimAccumulator) {
      this.isFollowUpWindow = false;
      this.followUpListeners.forEach((l) => l(false));
      this.stopListening(); // корректно уйдёт в idle/wake-word, как обычно
    }
  }, duration);

  await this.audioRecorder.start({
    onVolume: (vol) => this.notifyVolume(vol),
    onSilence: () => {
      if (this.isCommandMode && (this.lastCapturedText || this.interimAccumulator)) {
        this.isFollowUpWindow = false;
        this.stopListening();
      }
    },
  });
  if (isSpeechRecognitionSupported) this.initRecognition(false);
}
```
Добавить `followUpTimer` в `stopAllTimers()`:
```diff
 private stopAllTimers() {
   if (this.commandWaitTimer) { clearTimeout(this.commandWaitTimer); this.commandWaitTimer = null; }
   if (this.speechEndTimer) { clearTimeout(this.speechEndTimer); this.speechEndTimer = null; }
+  if (this.followUpTimer) { clearTimeout(this.followUpTimer); this.followUpTimer = null; }
 }
```

### J.3. Настройки

`JarvisConfig` (в `settingsStore.ts` / `voice-service.ts` конфиг):
```diff
 interface AIConfig {
   ...
+  followUpListening: boolean;   // вкл/выкл фичу, по умолчанию true
+  followUpWindowMs: number;     // 3000–5000, по умолчанию 4000
 }
```
В `JarvisSettings.tsx` — переключатель «Слушать продолжение после команды» +
ползунок длительности (3–5 сек).

### J.4. Где вызывать

В `JarvisChat.tsx`, там, где сейчас после `routeCommand()` результат
отображается и (если включён голосовой вывод) озвучивается через TTS —
**после** того, как TTS закончил говорить (не раньше — иначе микрофон
захватит собственный голос Джарвиса как новую команду):

```typescript
// JarvisChat.tsx, после успешного выполнения голосовой команды
if (wasVoiceTriggered && result.matchedVia !== 'llm-error') {
  await speakText(result.response); // дожидаемся окончания TTS
  voiceService.startFollowUpListening();
}
```
Важно: `wasVoiceTriggered` — флаг, отличающий команду, пришедшую голосом, от
напечатанной текстом в чате. Follow-up-режим должен включаться только для
голосового взаимодействия — если пользователь печатает, никакого
автослушания включаться не должно.

### J.5. Визуальная разница в UI

`StatusBar.tsx` / `JarvisOrb.tsx` — во время `isFollowUpWindow === true`
показывать тот же цвет `listening`, но с отдельной подписью («Жду
продолжения…») и, если используете 3D-сферу из Части H — можно добавить
тающее кольцо-таймер (уменьшающийся по радиусу полупрозрачный круг),
наглядно показывающее, сколько времени осталось на команду без "Джарвис".

---

## Порядок применения

1. **Часть A** — единственный реально открытый баг безопасности, вперёд всех.
2. **Часть E** — базовая работоспособность голосового управления.
3. **Часть J** — логически идёт сразу за E (тот же voice-service.ts,
   удобнее делать одним заходом, не переключаясь между файлами дважды).
4. **Часть F, I.5** — самодостаточные, можно параллельно.
5. **Часть H** — визуальная, независима от остального.
6. **Часть I.1–I.4** — по одной, в любом порядке, не связаны друг с другом.
7. **Часть G** — самая долгая и рискованная (нужен реальный тест на Windows
   с ETW/правами администратора), делать последней и с запасом по времени;
   начать с упрощённого MVP (список соединений), не с полного ETW сразу.
