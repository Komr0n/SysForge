# Фаза 3 — Джарвис: Полное ТЗ (финальная версия)

> Объединяет базовую архитектуру и обновление v2 (гибридный NLU по мотивам
> разбора `Priler/jarvis`) в один документ. Ничего из кода `Priler/jarvis` не
> копируется — только архитектурные паттерны, реализованные с нуля под стек
> SysForge (React + Tauri/Rust), чтобы не наследовать их лицензию CC BY-NC-SA 4.0.

## Решения по исходным вопросам

✅ **Web Automation**: только `open_url()`, без Puppeteer/Playwright.
✅ **Skill Creation**: только пользователь, с визуальной редакцией перед сохранением.
✅ **Подтверждение действий**: только для деструктивных (kill_process, delete_file и т.п.).
✅ **Аудит-логирование**: все команды с побочным эффектом — в `$APPDATA/sysforge/jarvis-audit.log`.
✅ **AI Provider**: локальный (Ollama/LM Studio) как приоритет, облачный (OpenAI/Claude) как переключаемый вариант, отдельное окно настроек.
✅ **Fallback**: если приоритетный провайдер недоступен — явно спросить подтверждение на переключение (не молча).
✅ **Intent-распознавание**: гибрид — быстрый офлайн embedding-матчер для известных команд, LLM с function calling как fallback для всего нового/сложного.

---

## Архитектура (4 слоя)

```
┌─────────────────────────────────────────────────────────────┐
│                    4. UI/HUD Layer                          │
│    StatusBar (сфера Джарвиса, состояния) + HUD-лог         │
└────────────────┬────────────────────────────┬───────────────┘
                 │                            │
        ┌────────▼─────────┐      ┌──────────▼──────────┐
        │ Voice I/O Service│      │ Settings (AI Prov)  │
        │ (STT/TTS)        │      │ Dialog/Window       │
        └────────┬─────────┘      └─────────────────────┘
                 │
┌────────────────▼──────────────────────────────────────────┐
│      3. Intent Layer — ГИБРИДНЫЙ                          │
│                                                             │
│   Embedding Matcher (офлайн, быстро) ──confidence≥0.82──▶ │
│         │                                    прямой запуск │
│      confidence<0.82                                       │
│         ▼                                                  │
│   LLM Orchestrator (Ollama/Cloud) + Function Calling       │
└────────────────┬─────────────────────────────────────────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
┌───▼──────────────────┐  ┌────▼─────────────────┐
│  Tool Router          │  │ Skill Registry       │
│  • Sandbox-level gate │  │ • skill.toml файлы   │
│  • валидация args     │  │ • phrases/slots/steps│
│  • confirmation gate  │  │ • per-skill sandbox  │
└───┬──────────────────┘  └────┬─────────────────┘
    │                           │
┌───▼─────────────────────────────▼──────────────┐
│     2. Action Layer (Execution Engines)        │
│  • Zustand actions (windowStore, etc)          │
│  • Tauri commands (system, fs, network)        │
│  • Audit logging (matchedVia: embedding|llm)   │
└─────────────────────────────────────────────────┘
    │
┌───▼─────────────────────────────────────────────┐
│         1. OS & App State                       │
└───────────────────────────────────────────────────┘
```

---

## Слой 1: Голосовой конвейер (Voice I/O)

### 1.1 Структура
```
src-tauri/src/voice/
├── mod.rs
├── wake_word.rs              # keyword spotting (Porcupine/Vosk)
├── stt.rs                    # Speech-to-Text
├── tts.rs                    # Text-to-Speech
└── voice_event_loop.rs       # слушай → распознай → отправь
```
Связь Voice Service ↔ WebView — через локальный WebSocket (`ws://127.0.0.1:9999`,
только localhost, не экспортируется наружу).

### 1.2 Конфигурация провайдера (Zustand `settingsStore`)
```typescript
interface AIConfig {
  provider: 'local' | 'cloud';
  local: {
    ollamaUrl: string;          // http://localhost:11434/v1
    model: string;              // llama3.2, mistral, qwen2.5-coder
    whisperModel: 'tiny' | 'base' | 'small';
    piperVoice: string;         // ru_RU-irina-medium и т.д.
  };
  cloud: {
    ttsProvider: 'elevenlabs' | 'azure' | 'google';
    apiKey?: string;
    model?: string;             // gpt-4o, claude-3-5-sonnet
  };
  fallbackMode: 'auto' | 'manual';  // manual = всегда спрашивать
  wakeWord: 'hey-jarvis' | 'jarvis' | 'custom';
  micSensitivity: number;
  confidenceThreshold: number;  // порог embedding-матчера, дефолт 0.82
  temperature: number;
}
```

### 1.3 Fallback-логика при недоступности провайдера
```rust
#[tauri::command]
async fn init_voice_service(config: AIConfig) -> Result<(), String> {
    let local_available = check_local_ai_availability().await;
    
    if !local_available && config.provider == "local" {
        app_handle.emit("jarvis:provider-unavailable", json!({
            "current": "local",
            "fallback_available": true,
            "message": "Локальный ИИ недоступен. Использовать облачный API?"
        }))?;
        // ждём явного подтверждения с фронта — НЕ переключаемся молча
    }
    // симметрично для cloud → local, если приоритет стоит на облачном и он недоступен
    
    spawn_voice_service(config)?;
    Ok(())
}
```
На фронте — модальное окно с явным выбором "Переключиться" / "Отменить".
Автоматического молчаливого переключения нет ни в одну сторону.

### 1.4 Workflow голосовой команды
```
1. "Hey Jarvis" или клик по микрофону → StatusBar: 🔵 LISTENING
2. Voice Service слушает, распознаёт конец реплики (silence detection)
3. STT (локальный whisper.cpp ИЛИ облачный) → текст
4. Текст → Intent Layer (Слой 3, гибридный)
5. Результат → TTS → StatusBar: 🟡 SPEAKING → воспроизведение
6. StatusBar: ⚪ IDLE
```

---

## Слой 2: Tool Router и Action Layer

### 2.1 Список инструментов и их Sandbox-уровень

```typescript
// src/lib/jarvis/sandbox.ts
export enum SandboxLevel {
  Minimal = "minimal",   // UI SysForge: open_app, set_theme, set_background, open_url
  Standard = "standard", // + readonly-система: get_system_status, get_process_list, ping_host, traceroute_host
  Full = "full",         // + побочный эффект: kill_process, delete_file, lock_screen
}

export const TOOL_MIN_SANDBOX: Record<string, SandboxLevel> = {
  open_app: SandboxLevel.Minimal,
  close_app: SandboxLevel.Minimal,
  set_theme: SandboxLevel.Minimal,
  set_background: SandboxLevel.Minimal,
  open_url: SandboxLevel.Minimal,

  get_system_status: SandboxLevel.Standard,
  get_process_list: SandboxLevel.Standard,
  ping_host: SandboxLevel.Standard,
  traceroute_host: SandboxLevel.Standard,

  kill_process: SandboxLevel.Full,
  delete_file: SandboxLevel.Full,
  lock_screen: SandboxLevel.Full,

  load_skill: SandboxLevel.Minimal,       // сам скилл несёт свой уровень
  list_available_skills: SandboxLevel.Minimal,
};

function sandboxRank(l: SandboxLevel) { return { minimal: 0, standard: 1, full: 2 }[l]; }

export function validateSkillSandbox(skill: Skill): { valid: boolean; violatingTool?: string } {
  for (const step of skill.steps) {
    const required = TOOL_MIN_SANDBOX[step.tool];
    if (sandboxRank(required) > sandboxRank(skill.sandbox)) {
      return { valid: false, violatingTool: step.tool };
    }
  }
  return { valid: true };
}
```

Полная схема инструментов для LLM function calling (`src/lib/jarvis/tools-schema.ts`)
описывает `name`, `description`, JSON Schema параметров, `safetyLevel`
(соответствует `TOOL_MIN_SANDBOX`) и `requiresAudit` для каждого из 13
инструментов выше — используется как справочник и для LLM, и для валидации
Skill'ов.

### 2.2 Tool Executor

`src/lib/jarvis/tool-executor.ts` — единая точка выполнения для обоих путей
(embedding-матч и LLM):

```typescript
export async function executeTool(request: {
  toolName: string;
  args: any;
  userConfirmedDestructive?: boolean;
  matchedVia: 'embedding' | 'llm';   // для аудит-лога
}): Promise<any> {
  const toolDef = JARVIS_TOOLS.find(t => t.name === request.toolName);
  if (!toolDef) throw new Error(`Tool not found: ${request.toolName}`);

  if (toolDef.safetyLevel === 'requires_confirmation' && !request.userConfirmedDestructive) {
    throw new Error(`REQUIRES_CONFIRMATION: ${toolDef.description}`);
  }

  if (toolDef.requiresAudit) {
    auditLog.logCommand({ timestamp: new Date(), toolName: request.toolName,
      args: request.args, status: 'started', matchedVia: request.matchedVia });
  }

  try {
    const result = await dispatchToolCall(request.toolName, request.args); // switch по всем 13 инструментам
    if (toolDef.requiresAudit) {
      auditLog.logCommand({ timestamp: new Date(), toolName: request.toolName,
        args: request.args, status: 'completed', matchedVia: request.matchedVia,
        result: JSON.stringify(result).slice(0, 500) });
    }
    return result;
  } catch (error) {
    if (toolDef.requiresAudit) {
      auditLog.logCommand({ timestamp: new Date(), toolName: request.toolName,
        args: request.args, status: 'error', matchedVia: request.matchedVia,
        error: (error as Error).message });
    }
    throw error;
  }
}
```

`dispatchToolCall` реализует каждый из 13 инструментов: UI-инструменты идут
через `windowStore`/`settingsStore`, системные — через `invoke()` к
соответствующим Tauri-командам (`get_system_info`, `get_processes`,
`ping_command`, `traceroute_command`, `kill_process`, `delete_file`,
`lock_screen`, `open_url`).

---

## Слой 3: Гибридный Intent Layer

### 3.1 Embedding Intent Matcher (быстрый путь)

```
src-tauri/src/jarvis/intent/
├── mod.rs
├── embedding_classifier.rs   # косинусное сходство через ONNX-модель
├── phrase_registry.rs        # фразы-примеры из skill.toml, кешированные embeddings
└── slot_extractor.rs         # паттерн-based извлечение параметров
```

Модель: `all-MiniLM-L6-v2` (англ., ~90 MB) или мультиязычная
`paraphrase-multilingual-MiniLM-L12-v2` (~470 MB, нужна для русского) —
свободно распространяемые веса с HuggingFace (MIT/Apache), инференс через
`ort` (ONNX Runtime) или `candle`. Модель кладётся в `resources/models/` и
подключается как Tauri resource либо докачивается при первом запуске (выбор
зависит от приемлемого размера инсталлятора).

```rust
pub struct IntentMatch {
    pub skill_id: String,
    pub confidence: f32,
    pub extracted_slots: HashMap<String, String>,
}

pub fn match_intent(input: &str, registry: &PhraseRegistry) -> Option<IntentMatch> {
    let input_embedding = embed_text(input)?;
    let mut best: Option<(String, f32)> = None;

    for (skill_id, phrase_embeddings) in registry.iter() {
        for pe in phrase_embeddings {
            let sim = cosine_similarity(&input_embedding, &pe.vector);
            if best.is_none() || sim > best.as_ref().unwrap().1 {
                best = Some((skill_id.clone(), sim));
            }
        }
    }

    best.and_then(|(skill_id, confidence)| {
        (confidence >= CONFIDENCE_THRESHOLD).then(|| IntentMatch {
            extracted_slots: extract_slots(input, &registry.get_slot_schema(&skill_id)),
            skill_id, confidence,
        })
    })
}
```

Индекс строится один раз при старте приложения (`jarvis_build_intent_index`
Tauri-команда) и перестраивается точечно при сохранении/удалении Skill'а
(`jarvis_reindex_skill`).

### 3.2 LLM Orchestrator (fallback-путь)

`src/lib/jarvis/orchestrator.ts` — вызывается, когда embedding-матчер не дал
уверенного совпадения (`confidence < threshold`). Работает через function
calling (Anthropic/OpenAI-совместимый API или локальный Ollama через
OpenAI-совместимый эндпоинт), получает полный список из 13 инструментов plus
краткие описания всех зарегистрированных Skill'ов (чтобы мог просто вызвать
`load_skill`, а не изобретать план заново):

```typescript
export class JarvisOrchestrator {
  async processCommand(userText: string): Promise<{
    response: string;
    actions: Array<{ toolName: string; args: any }>;
  }> {
    const systemPrompt = `Ты — Джарвис, голосовой ИИ-помощник для SysForge.
Отвечай на русском кратко. Вызывай инструменты только когда нужно.
Для опасных действий (kill_process, delete_file, lock_screen) подтверди
понимание, но не выполняй — скажи, что нужно подтверждение пользователя.
Если есть подходящий сохранённый навык — вызови load_skill вместо ручного
планирования.`;

    const response = await this.client.messages.create({
      model: this.context.cloudModel || this.context.localModel,
      max_tokens: 1024,
      system: systemPrompt,
      tools: JARVIS_TOOLS.map(toAnthropicToolSchema),
      messages: [{ role: "user", content: userText }],
    });

    // разбор content: text-блоки → response, tool_use-блоки → actions
    return parseResponse(response);
  }
}
```

### 3.3 Роутинг между путями

```typescript
// src/lib/jarvis/hybrid-router.ts
export async function routeCommand(text: string): Promise<CommandResult> {
  const embeddingMatch = await invoke<IntentMatch | null>('jarvis_match_intent', { text });

  if (embeddingMatch && embeddingMatch.confidence >= getConfidenceThreshold()) {
    const skill = await skillRegistry.loadSkill(embeddingMatch.skill_id);
    return executeSkill(skill, embeddingMatch.extracted_slots, matchedVia: 'embedding');
  }

  const llmResult = await orchestrator.processCommand(text);
  for (const action of llmResult.actions) {
    await executeTool({ ...action, matchedVia: 'llm' });
  }
  return llmResult;
}
```

---

## Слой 3.5: Skill Registry (декларативный формат)

### 3.5.1 Формат skill.toml

Путь: `$APPDATA/sysforge/skills/<skill-id>/skill.toml`

```toml
[skill]
id = "ping-gateway"
display_name = "Пинг шлюза"
description = "Пингует локальный шлюз и озвучивает задержку"
category = "network"
created_by = "user"           # LLM никогда не создаёт Skill сам
created_at = "2026-08-05T10:00:00Z"
sandbox = "standard"          # уровень навыка целиком — проверяется при сохранении

[skill.phrases]
ru = ["пингани шлюз", "проверь пинг до роутера", "какой пинг до 192.168.1.1"]
en = ["ping the gateway", "check gateway latency"]

[skill.slots.host]
default = "192.168.1.1"
context_words = ["до", "to"]
pattern = "ip_or_hostname"

[[skill.steps]]
tool = "ping_host"
args = { host = "{host}" }
requires_confirmation = false

[[skill.steps]]
tool = "speak_result"
args = { template = "Пинг до {host}: {step_1.result.latency_ms} мс" }
requires_confirmation = false
```

Пример деструктивного навыка:
```toml
[skill]
id = "kill-app-by-name"
display_name = "Завершить приложение"
sandbox = "full"

[[skill.steps]]
tool = "kill_process"
args = { processName = "{app_name}" }
requires_confirmation = true
```

### 3.5.2 API реестра

```typescript
export interface Skill {
  id: string;
  displayName: string;
  description: string;
  category: string;
  createdBy: 'user' | 'system';
  sandbox: SandboxLevel;
  phrases: { ru: string[]; en: string[] };
  slots: Record<string, SlotDefinition>;
  steps: SkillStep[];
  executionCount: number;
  lastExecutedAt?: string;
}

export class SkillRegistry {
  async saveSkill(skill: Skill): Promise<void> {
    const validation = validateSkillSandbox(skill);
    if (!validation.valid) {
      throw new Error(`Навык "${skill.id}" требует sandbox выше указанного ` +
        `(инструмент "${validation.violatingTool}" превышает "${skill.sandbox}")`);
    }
    const dirPath = path.join(this.skillsDir, skill.id);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(path.join(dirPath, 'skill.toml'), skillToToml(skill));
    await invoke('jarvis_reindex_skill', { skillId: skill.id });
  }

  async loadSkill(id: string): Promise<Skill | null> { /* парсинг TOML */ }
  async listSkills(): Promise<Skill[]> { /* обход папок */ }
  async deleteSkill(id: string): Promise<void> { /* удаление + jarvis_reindex_skill */ }
}
```

### 3.5.3 SkillCreator — визуальная редакция перед сохранением

`src/components/JarvisUI/SkillCreator.tsx` — модальное окно, куда попадает
предложенная LLM-ом (или вручную собранная пользователем) цепочка шагов.
Пользователь может:
- просмотреть каждый шаг и его параметры,
- отредактировать/удалить/добавить шаги,
- увидеть итоговый Sandbox-уровень навыка одним индикатором
  (🟢 Minimal / 🟡 Standard / 🔴 Full), вычисляемым автоматически из шагов,
- ввести фразы-примеры для embedding-матчера (или принять предложенные LLM),
- назвать навык и сохранить — **только после этого шага** Skill попадает в
  Registry; LLM никогда не сохраняет Skill в обход этого экрана.

---

## Слой 4: UI/HUD

### 4.1 StatusBar с Джарвис-сферой

```typescript
export function StatusBar() {
  const [jarvisState, setJarvisState] =
    useState<'idle'|'listening'|'thinking'|'executing'|'speaking'|'error'>('idle');

  useEffect(() => {
    listen('jarvis:state-changed', (e) => setJarvisState(e.payload.state));
  }, []);

  const colors = { idle: '#4f46e5', listening: '#0ea5e9', thinking: '#a855f7',
    executing: '#10b981', speaking: '#f59e0b', error: '#ef4444' };

  return (
    <div className="status-bar">
      <div className="status-left">{/* часы, сеть */}</div>
      <div className="jarvis-hud">
        <JarvisOrb state={jarvisState} color={colors[jarvisState]}
          isListening={jarvisState === 'listening'} />
        <span>{jarvisStateLabel(jarvisState)}</span>
      </div>
      <div className="status-right">
        <button onClick={() => invoke('voice:toggle-listening')}>🎤</button>
        <button onClick={openJarvisSettings}>⚙️</button>
      </div>
    </div>
  );
}
```

`JarvisOrb.tsx` — canvas-анимация: пульсирующая сфера с волнами при
`listening`, пульсация яркости при `thinking`. `JarvisLog.tsx` — HUD-лог
последних 10 команд снизу экрана (транскрипт → ответ → статус действий).

### 4.2 Окно настроек ИИ

`src/components/JarvisUI/JarvisSettings.tsx` — отдельная вкладка/диалог:
переключатель `local`/`cloud`, для локального — Base URL Ollama, выбор
модели, whisper-модели, TTS-голоса, кнопка "Проверить подключение"; для
облачного — провайдер, API-ключ, модель. Общие: temperature, чувствительность
микрофона, порог `confidenceThreshold` для embedding-матчера, режим fallback
(`auto`/`manual`).

---

## Аудит-логирование

```typescript
export interface AuditEntry {
  timestamp: Date;
  toolName: string;
  args: any;
  status: 'started' | 'completed' | 'error';
  matchedVia: 'embedding' | 'llm';   // видно, какой путь сработал
  result?: string;
  error?: string;
  skillName?: string;
}
```
Пишется построчным JSON в `$APPDATA/sysforge/jarvis-audit.log` через
`appendTextFile`. Доступен для просмотра в отдельном разделе настроек
(таблица с фильтром по статусу/инструменту).

---

## Порядок внедрения

1. **Базовый LLM-путь**: AI Provider настройки → 5 Minimal-инструментов →
   Tool Executor → текстовый чат.
2. **STT/TTS**: Voice Service, StatusBar + JarvisOrb, голосовой ввод/вывод.
3. **Skill Registry v2**: формат `skill.toml`, `validateSkillSandbox`,
   индикатор уровня в `SkillCreator`.
4. **Embedding Intent Matcher**: ONNX Runtime в `src-tauri`, модель,
   `embedding_classifier.rs`, построение индекса, roundtrip-тест на фразах
   всех встроенных Skill'ов.
5. **Standard-инструменты**: `get_system_status`, `get_process_list`,
   `ping_host`, `traceroute_host`.
6. **Full-инструменты с подтверждением**: `kill_process`, `delete_file`,
   `lock_screen`, UI подтверждения, аудит.
7. **Wake word** (опционально): keyword spotting, explicit opt-in.

---

## Definition of Done

- Простая команда выполняется без сетевого запроса к LLM (задержка < 200 мс,
  видно по логам/сетевому монитору).
- Нестандартная формулировка корректно уходит в LLM-fallback.
- Skill с шагом выше заявленного sandbox-уровня не сохраняется — ошибка на
  этапе сохранения, а не выполнения.
- Индикатор уровня доступа виден в списке навыков и в `SkillCreator`.
- Confidence threshold настраивается и применяется без перезапуска.
- Ни один Full-инструмент не выполняется без явного подтверждения.
- Аудит-лог фиксирует все команды с побочным эффектом, включая `matchedVia`.
- Fallback между локальным/облачным провайдером — только с явного согласия
  пользователя, ни в одну сторону не переключается молча.
- Микрофон не активируется без явного разрешения.

---

## Файлы для создания (итого)

```
src-tauri/src/voice/
├── mod.rs / wake_word.rs / stt.rs / tts.rs / voice_event_loop.rs

src-tauri/src/jarvis/intent/
├── mod.rs / embedding_classifier.rs / phrase_registry.rs / slot_extractor.rs

src/lib/jarvis/
├── tools-schema.ts / sandbox.ts / orchestrator.ts / hybrid-router.ts
├── tool-executor.ts / skill-registry.ts / audit-logger.ts

src/components/JarvisUI/
├── JarvisOrb.tsx / JarvisLog.tsx / JarvisSettings.tsx
├── SkillCreator.tsx / SkillStepEditor.tsx

Обновить:
src/App.tsx / src/components/Header/StatusBar.tsx / src/store/settingsStore.ts
```

---

## Связь с другими фазами

- **Фаза 0** (сужение Tauri capabilities, CSP) — обязательна до старта Фазы 3.
- **Фаза 1** (HUD-каркас) — нужен для размещения StatusBar с JarvisOrb.
- **Фаза 2** (System modules) — `get_system_info`, `get_processes`, ping/traceroute
  должны быть готовы до Standard-инструментов.
