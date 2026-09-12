# Патч-ТЗ (обновлено) — Фаза 3.1: безопасность, фронтенд, сборка, обучение навыкам

---

## Часть A — Критичные фиксы безопасности

### A.1. Убрать RCE в `jarvis_open_system_app`

`program: String` шёл без валидации в `cmd /c start ""` — на Windows `cmd.exe`
сам разбирает командную строку, значит `&`/`|`/`%VAR%` внутри строки дают
выполнение произвольной второй команды. Решение — жёсткий whitelist на
Rust-стороне, без прямого исполнения текста от LLM.

`src-tauri/src/lib.rs`:
```diff
-#[tauri::command]
-async fn jarvis_open_system_app(program: String) -> Result<String, String> {
-    if program.trim().is_empty() {
-        return Err("Program name cannot be empty".to_string());
-    }
-    #[cfg(target_os = "windows")]
-    {
-        let res = run_cmd_timeout("cmd", &["/c", "start", "", &program], 5).await;
-        res.map(|_| format!("Started {}", program))
-    }
-    ...
-}
+fn resolve_whitelisted_app(id: &str) -> Option<&'static str> {
+    match id.to_lowercase().as_str() {
+        "calculator" | "calc" => Some("calc.exe"),
+        "notepad" => Some("notepad.exe"),
+        "explorer" | "file_explorer" => Some("explorer.exe"),
+        "task_manager" | "taskmgr" => Some("taskmgr.exe"),
+        "paint" | "mspaint" => Some("mspaint.exe"),
+        "cmd" | "terminal" => Some("cmd.exe"),
+        _ => None,
+    }
+}
+
+#[tauri::command]
+async fn jarvis_open_system_app(app_id: String) -> Result<String, String> {
+    let resolved = resolve_whitelisted_app(&app_id).ok_or_else(|| format!(
+        "'{}' не в списке разрешённых программ.", app_id
+    ))?;
+    let task = tokio::task::spawn_blocking(move || {
+        std::process::Command::new(resolved)
+            .creation_flags_if_windows(0x08000000)
+            .spawn()
+    });
+    match task.await {
+        Ok(Ok(_)) => Ok(format!("Запущено: {}", resolved)),
+        _ => Err(format!("Не удалось запустить {}", resolved)),
+    }
+}
```
Прямой `Command::new(resolved).spawn()` — без `cmd.exe` посередине и без
реинтерпретации строки.

`src/lib/jarvis/tools-schema.ts`:
```diff
 {
   name: 'open_system_app',
-  safetyLevel: 'safe',
-  requiresAudit: false,
+  safetyLevel: 'safe',
+  requiresAudit: true,
   parameters: {
     properties: {
-      program: { type: 'string', description: '...' },
+      appId: {
+        type: 'string',
+        enum: ['calculator', 'notepad', 'explorer', 'task_manager', 'paint', 'cmd'],
+      },
       displayName: { type: 'string' },
     },
-    required: ['program'],
+    required: ['appId'],
   },
 },
```
Расширение списка сверх whitelist'а — см. Часть C (обучение навыкам).

### A.2. Удалить бэкдор — необрезанный `delete_file`

`src-tauri/src/lib.rs` содержит отдельную, зарегистрированную в
`invoke_handler`, ничем не ограниченную команду:
```rust
#[tauri::command]
fn delete_file(path: String) -> Result<String, String> {
    std::fs::remove_file(&path)...
}
```
Кастомные Tauri-команды не проходят через `fs:scope` из
`capabilities/default.json` (тот действует только на встроенные команды
`fs`-плагина) — значит эта команда полностью обходит ограничение
`$APPDATA/sysforge/**`, которое было закрыто в Фазе 0.

```diff
-#[tauri::command]
-fn delete_file(path: String) -> Result<String, String> {
-    if path.is_empty() { return Err("Path cannot be empty".to_string()); }
-    std::fs::remove_file(&path)
-        .map(|_| format!("File '{}' deleted successfully.", path))
-        .map_err(|e| format!("Failed to delete file '{}': {}", path, e))
-}
```
и убрать `delete_file` из `invoke_handler![...]`. Фронтенд и так использует
правильный, scoped вызов через `@tauri-apps/plugin-fs`'s `remove()`.

### A.3. `load_skill` — шаги должны идти через `executeTool()`, не в обход

`src/lib/jarvis/tool-executor.ts`, кейс `load_skill`:
```diff
       for (const step of skill.steps) {
         const slotArgs = { ...step.args };
         for (const [k, v] of Object.entries(slotArgs)) { /* подстановка слотов */ }
-        const stepResult = await dispatchToolCall(step.tool, slotArgs);
+        const stepResult = await executeTool({
+          toolName: step.tool,
+          args: slotArgs,
+          userConfirmedDestructive: step.requiresConfirmation
+            ? Boolean(args.userConfirmedDestructive)
+            : true,
+          matchedVia: 'skill',
+          skillName: skill.displayName,
+        });
+        if (stepResult.requiresConfirmation) {
+          return {
+            success: false,
+            requiresConfirmation: true,
+            message: `Навык "${skill.displayName}" требует подтверждения для шага "${step.tool}".`,
+          };
+        }
         if (stepResult.message) results.push(stepResult.message);
       }
```
Без этого исправления шаги `kill_process`/`delete_file` внутри сохранённого
навыка выполнялись без единого запроса на подтверждение и без записи в
аудит-лог — `validateSkillSandbox` защищает только на этапе *сохранения*, не
*выполнения*.

### A.4. CSP блокирует LLM-запросы — перенести на Rust-сторону

`orchestrator.ts` делает `fetch()` из фронтенда на `generativelanguage.googleapis.com`,
`localhost:11434` и т.д., но CSP в `tauri.conf.json` разрешает только
`services.nvd.nist.gov` и `api.abuseipdb.com` в `connect-src`. В собранном
приложении (CSP реально enforced) все запросы к ИИ будут заблокированы ещё до
сети.

Новая Rust-команда:
```rust
#[derive(serde::Deserialize)]
struct LlmChatRequest {
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: serde_json::Value,
}

#[tauri::command]
async fn jarvis_llm_request(req: LlmChatRequest) -> Result<serde_json::Value, String> {
    if !req.url.starts_with("https://")
        && !req.url.starts_with("http://localhost")
        && !req.url.starts_with("http://127.0.0.1")
    {
        return Err("Разрешены только https:// или локальный Ollama (localhost)".into());
    }
    let client = reqwest::Client::new();
    let mut builder = client.post(&req.url).json(&req.body);
    for (k, v) in &req.headers { builder = builder.header(k, v); }
    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("HTTP {}: {}", status, json)); }
    Ok(json)
}
```
(добавить `reqwest = { version = "0.12", features = ["json"] }` в `Cargo.toml`).

`orchestrator.ts`:
```diff
-const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ... });
-if (!response.ok) { ... }
-const data = await response.json();
+const { invoke } = await import('@tauri-apps/api/core');
+const data = await invoke('jarvis_llm_request', { req: { url, headers, body } });
```
Плюсы: CSP больше не блокирует произвольный `baseUrl`, ключ не виден в
devtools webview, можно централизованно логировать LLM-запросы.

### A.5. Ключи облачных провайдеров — исключить из диска

`src/store/settingsStore.ts`:
```diff
       partialize: (state) => {
-        const { apiKeys, ...rest } = state;
-        return rest;
+        const { apiKeys, ...rest } = state;
+        return {
+          ...rest,
+          jarvis: {
+            ...rest.jarvis,
+            cloud: { ...rest.jarvis.cloud, apiKey: '' },
+            cloudProviders: (rest.jarvis.cloudProviders || []).map((p) => ({ ...p, apiKey: '' })),
+          },
+        };
       },
```
Проверить `merge()` — чтобы восстановление из диска не затирало уже введённые
в текущей сессии ключи пустой строкой (брать `apiKey` из `current`, не из `saved`).

---

## Часть B — Фронтенд: найденные баги и фиксы

### B.1. «Сохранить как навык» — мёртвая кнопка
`canSaveAsSkill` считается в `handleCommand()`, но нигде в JSX не
отрисовывается, а `setSkillCreatorOpen(true)`/`setNewSkillDraft(...)` не
вызываются ни разу. `SkillCreator` физически недостижим из чата.

Реальный фикс приходит вместе с Частью C.3 (`propose_new_skill`) — там
появляется настоящий путь открытия `SkillCreator`. Отдельно на message-уровне:
```diff
                 {msg.matchedVia === 'llm' && ( <span>☁️ ...</span> )}
+                {msg.canSaveAsSkill && (
+                  <button onClick={() => handleSaveAsSkill(msg.id)}
+                    style={{ background: 'transparent', border: '1px solid var(--accent-primary)',
+                      borderRadius: 2, color: 'var(--accent-primary)', fontSize: 8.5,
+                      padding: '0 4px', cursor: 'pointer' }}
+                    title="Запомнить эту последовательность действий как навык"
+                  >💾 Запомнить</button>
+                )}
```

### B.2. `processingRef` не блокирует параллельные команды
```diff
   if (processingRef.current) {
     console.warn('[JarvisChat] Command already processing, ignoring');
+    return;
   }
   processingRef.current = true;
```

### B.3. Чат — фиксированный размер, не адаптируется к окну
```diff
- width: 350,
- height: 480,
+ width: 'clamp(280px, 30vw, 380px)',
+ height: 'clamp(320px, 60vh, 520px)',
+ maxHeight: 'calc(100vh - 260px)',
```

### B.4. Значок «🧠 Навык» одинаковый для ONNX и keyword-fallback
`hybrid-router.ts` помечает `matchedVia: 'embedding'` и для настоящего ONNX
(точнее — n-gram хеш-матчера, см. примечание ниже) совпадения, и для
упрощённого `keywordMatch()`. Завести отдельное значение `matchedVia: 'keyword'`,
прокинуть через `CommandResult`, показать другой бейдж («🔤 по ключевым словам»).

### B.5. Нет закрытия модалок по Esc
```typescript
useEffect(() => {
  if (!isOpen) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [isOpen, onCancel]);
```
Добавить в `ConfirmationModal` и `ProviderFallbackModal`.

---

## Часть C — Обучение новым навыкам

### C.1. Обучение запуску программ (Photoshop и т.д.)

Discovery-команда (только чтение, ничего не исполняет):
```rust
#[derive(serde::Serialize)]
struct AppCandidate { display_name: String, exe_path: String }

#[tauri::command]
async fn jarvis_find_app(query: String) -> Result<Vec<AppCandidate>, String> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(app_paths) = hklm.open_subkey(
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
        ) {
            for name in app_paths.enum_keys().flatten() {
                if name.to_lowercase().contains(&query.to_lowercase()) {
                    if let Ok(sub) = app_paths.open_subkey(&name) {
                        if let Ok(path) = sub.get_value::<String, _>("") {
                            candidates.push(AppCandidate {
                                display_name: name.trim_end_matches(".exe").to_string(),
                                exe_path: path,
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(candidates)
}

#[tauri::command]
async fn jarvis_launch_registered_app(app_id: String) -> Result<String, String> {
    let registry = load_user_app_registry()?; // читает $APPDATA/sysforge/jarvis-apps.json
    let entry = registry.get(&app_id)
        .ok_or_else(|| format!("Приложение '{}' не зарегистрировано", app_id))?;
    std::process::Command::new(&entry.exe_path)
        .spawn()
        .map(|_| format!("Запускаю {}", entry.display_name))
        .map_err(|e| format!("Не удалось запустить: {}", e))
}
```

Workflow:
```
Пользователь: "Джарвис, научись открывать Photoshop"
  → LLM вызывает discover_app({ query: "photoshop" })
  → invoke('jarvis_find_app', { query }) — читает реестр, ничего не запускает
  → UI: "Нашёл Adobe Photoshop 2024 — C:\...\Photoshop.exe. Запомнить?"
     [Да] [Не то, укажу путь вручную] [Отмена]
  → путь дописывается в jarvis-apps.json (user-approved whitelist)
  → автоматически создаётся skill.toml со ссылкой на appId, не на голый путь
```
Если авто-поиск не находит — диалог выбора `.exe` через
`@tauri-apps/plugin-dialog` (`open({ filters: [{ extensions: ['exe'] }] })`) —
тоже explicit user action, не текстовый ввод пути.

### C.2. Обучение веб-действиям (YouTube, музыка, "последнее видео от X")

В рамках уже принятого решения (`open_url` без автоматизации кликов):
```toml
[skill]
id = "youtube-latest-mrbeast"
sandbox = "minimal"
[skill.phrases]
ru = ["включи последнее видео мистербиста"]
[[skill.steps]]
tool = "open_url"
args = { url = "https://www.youtube.com/@MrBeast/videos" }
```
Открывает вкладку videos канала по новизне — последний клик за пользователем.

Для музыки — `open_url` на YouTube Music с поисковым слотом:
```toml
[[skill.steps]]
tool = "open_url"
args = { url = "https://music.youtube.com/search?q={query}" }
```

Настоящий автозапуск конкретного видео без клика — отдельное расширение
скоупа (требует либо браузерную автоматизацию, либо официальный YouTube Data
API для получения ID последнего видео и прямого перехода на
`watch?v=<id>`, что безопаснее автоматизации страницы). В первую версию
обучения навыкам не включаю, можно вернуться к этому осознанно позже.

### C.3. Общий workflow "Джарвис не знает, как это сделать"

```typescript
{
  name: 'propose_new_skill',
  description: 'Вызывается, когда для запроса пользователя ещё нет навыка. Не выполняет действие — только предлагает создать новый навык.',
  safetyLevel: 'safe',
  requiresAudit: false,
  parameters: {
    type: 'object',
    properties: {
      requestedAction: { type: 'string' },
      suggestedSteps: {
        type: 'array',
        items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } } },
      },
    },
    required: ['requestedAction', 'suggestedSteps'],
  },
},
```
```typescript
// JarvisChat.tsx
if (action.toolName === 'propose_new_skill') {
  setNewSkillDraft(buildDraftSkillFromProposal(action.args));
  setSkillCreatorOpen(true);
  continue;
}
```
Это одновременно чинит B.1 (мёртвую кнопку) настоящим путём открытия
`SkillCreator`, инициированным диалогом, а не воображаемой кнопкой.

---

## Часть D — Баг сборки: `.exe` не работает без dev-сервера (НОВОЕ)

### D.1. Корневая причина — найдена и подтверждена

`vite.config.ts`:
```diff
    rollupOptions: {
-     external: ["@tauri-apps/plugin-store"],
      output: { manualChunks: { ... } },
    },
```
`external` указывал Rollup не зашивать `@tauri-apps/plugin-store` в бандл, а
оставить `import "@tauri-apps/plugin-store"` как есть. В `npm run dev`/`tauri
dev` это работает — у Vite-dev-сервера есть резолвер, находящий пакет в
`node_modules` на лету. В собранном `.exe` файлы отдаются статически, резолвера
нет, WebView2 не умеет резолвить голый bare-specifier — падает с
`Failed to resolve module specifier "@tauri-apps/plugin-store"` прямо в главном
чанке (импорт тянется из `tauriStorage.ts` → `settingsStore.ts`, который
грузится сразу при старте). Отсюда и ощущение «работает только пока где-то
рядом крутится сервер».

```
npm run tauri build
```
(не `tauri dev` — тот всегда требует запущенный Vite-сервер, это нормальное
поведение dev-режима, а не баг; вам нужен именно `build`, который прогонит
`beforeBuildCommand` → `npm run build` → зашьёт готовый `dist/` прямо в `.exe`).

Готовый инсталлятор появится в `src-tauri/target/release/bundle/` (NSIS
`.exe`/MSI для Windows, в зависимости от `bundle.targets`).

### D.2. Автоустановка WebView2 при первом запуске

`src-tauri/tauri.conf.json`, добавить `windows` внутрь `bundle`:
```diff
   "bundle": {
     "active": true,
     "targets": "all",
     "icon": [ ... ],
+    "windows": {
+      "webviewInstallMode": {
+        "type": "downloadBootstrapper"
+      }
+    }
   }
```
`downloadBootstrapper` — небольшой загрузчик встраивается в сам инсталлятор;
если на машине пользователя WebView2 Runtime отсутствует, при установке
SysForge инсталлятор сам скачает и поставит его (нужен интернет в момент
установки, сам загрузчик — не полный рантайм, весит мало, инсталлятор почти
не растёт в размере).

Если нужна работа полностью офлайн (установка на машине без интернета
вообще) — вариант потяжелее:
```json
"webviewInstallMode": { "type": "offlineInstaller" }
```
Зашивает полный офлайн-инсталлятор WebView2 (~127 МБ) прямо в дистрибутив
SysForge — инсталлятор станет заметно тяжелее, зато ничего скачивать не
потребуется вообще, даже сам WebView2.

Третий вариант, если хочется вообще не зависеть от системного WebView2
(самый тяжёлый, но самый надёжный — версия рантайма фиксируется и живёт
рядом с приложением):
```json
"webviewInstallMode": { "type": "fixedRuntime", "path": "./WebView2Runtime" }
```
Требует отдельно скачать фиксированную версию WebView2 Runtime с сайта
Microsoft и положить рядом при сборке — усложняет процесс сборки, обычно
не нужен, если устраивает `downloadBootstrapper`.

**Рекомендация**: начать с `downloadBootstrapper` (дефолт для большинства
случаев, минимальный вес инсталлятора) и перейти на `offlineInstaller` только
если реально столкнётесь с раздачей на машины без интернета.

---

## Порядок применения патча

1. **D.1** — уже исправлено в вашем рабочем дереве, проверьте у себя `git diff`
   на `vite.config.ts` и пересоберите (`npm run tauri build`), прежде чем
   переходить к остальному — иначе тестировать всё остальное всё равно
   придётся через дырявую сборку.
2. **A.1 и A.2** — активные дыры безопасности, дальше ждать нельзя.
3. **A.3** — до появления первого реального навыка с деструктивным шагом.
4. **A.4** — до первого реального теста облачного/локального провайдера в
   собранном (не dev) режиме.
5. **A.5** — быстрый фикс, вместе с A.4.
6. **D.2** — перед первой раздачей инсталлятора кому-либо кроме себя.
7. **Часть B** — можно параллельно, не блокирует остальное.
8. **Часть C** — после A.1 (обучение новым программам использует тот же
   паттерн "discovery + подтверждение + whitelist").
9. **Проверить почему не работают команды** — Проверь почему команды не выполняются и исправь
