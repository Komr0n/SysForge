# Патч-ТЗ v6 — полный аудит и доведение до конечной формы

---

## Отчёт: что применено из прошлых патчей

| Часть | Статус |
|---|---|
| A — шифрование API-ключей | ✅ Применено. AES-256-GCM, префикс `enc:aes256:`, ключи шифруются перед записью, расшифровываются прозрачно. Покрыты и `jarvis.cloudProviders[]`, и legacy `apiKeys` (nvd/abuseipdb/virustotal) |
| M — фикс расхождения CPU/RAM | ✅ Применено. `SystemSnapshotState` + `background_system_refresh_loop`, все потребители читают один снапшот |
| L — настоящий терминал | ⚠️ Применено, но с утечкой сессий (см. баг #3) |
| N — анализатор диска | ⚠️ Применено, но блокирует async-рантайм (см. баг #2) |
| O — поиск дубликатов | ⚠️ Применено, но читает файлы целиком в память (см. баг #2) |
| P — менеджер автозагрузки | ✅ Применено корректно, через `StartupApproved\Run` с флагом 0x02/0x03 |
| E — фикс open/close | ✅ Применено, `close_os_app_by_name` + фильтрация по типу шага |
| K — проводник | ⚠️ Только fallback-версия: `walkdir` вместо MFT, поиск по содержимому перечитывает файлы каждый раз вместо индекса |
| Q — распознавание | ❌ Не применено. `embed_text()` по-прежнему хеширует n-граммы |

Отдельно стоит отметить: экстракторы текста сделаны шире, чем я закладывал —
`.docx`, `.xlsx`, `.pptx`, `.odt`/`.ods`/`.odp`, `.pdf`. Плюс исключение
`.git`/`node_modules`/`target` из обхода и лимит 25 МБ на документ — здравые
решения, которых в ТЗ не было.

---

## ЧАСТЬ 1 — Критичные баги (чинить первым делом)

### Баг #1 🔴 — `delete_file` вернулся как необрезанный бэкдор

`src-tauri/src/lib.rs:1854`:
```rust
#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}
```
Зарегистрирован в `invoke_handler` (строка 2493). Это ровно та команда,
которую удаляли в патче v2 (A.2) — она вернулась вместе с `DuplicateFinder`.

Почему это опасно именно сейчас: кастомные Tauri-команды **не проходят**
через `fs:scope` из `capabilities/default.json`. То есть всё сужение до
`$APPDATA/sysforge/**`, ради которого была проделана работа в Фазе 0, для
этого пути обходится полностью — `invoke('delete_file', { path: 'C:\\Windows\\System32\\...' })`
сработает. При этом Джарвис-tool `delete_file` в `tool-executor.ts`
использует **правильный**, scoped `plugin-fs`'s `remove()` — то есть в
приложении сосуществуют безопасный и небезопасный путь к одному действию.

**Фикс** — удалить Rust-команду и её регистрацию, а `DuplicateFinder`
перевести на тот же scoped API, что использует Джарвис:

```diff
-#[tauri::command]
-async fn delete_file(path: String) -> Result<(), String> {
-    std::fs::remove_file(&path).map_err(|e| e.to_string())
-}
```
```diff
// invoke_handler
-            delete_file,
```
`src/apps/system/DuplicateFinder.tsx`:
```diff
-        const { invoke } = await import('@tauri-apps/api/core');
         for (const path of selectedPaths) {
           try {
-            await invoke('delete_file', { path });
+            const { remove } = await import('@tauri-apps/plugin-fs');
+            await remove(path);
             count++;
```
Дубликаты обычно лежат вне `$APPDATA/sysforge/**`, поэтому одновременно
нужно расширить `fs:scope` — но **не** на весь диск, а по той же модели
согласия, что заложена в K.3: папку для сканирования пользователь выбирает
через `plugin-dialog`, и Tauri 2 умеет выдавать доступ к выбранному пути
динамически. В `capabilities/default.json` добавляется разрешение на
`fs:allow-remove` в рамках уже выбранных пользователем путей, а не
бланковый `$HOME/**`.

### Баг #2 🔴 — блокировка async-рантайма и чтение файлов целиком в память

Две функции объявлены `async`, но выполняют синхронный I/O **прямо в
async-контексте**, без `spawn_blocking` (в отличие от `search_files_by_name`
и `search_files_by_content`, где это сделано правильно):

- `find_duplicate_files` (1814) — полный обход `WalkDir` + чтение всех файлов
- `scan_directory_sizes` (1787) — `read_dir` + рекурсивная оценка размеров

Пока они работают, поток tokio-рантайма заблокирован — UI перестаёт получать
ответы на другие `invoke`, приложение «подвисает».

Вторая, более опасная часть — в `find_duplicate_files`:
```rust
if let Ok(bytes) = std::fs::read(&path) {          // ← весь файл в RAM
    let hash = blake3::hash(&bytes).to_hex().to_string();
```
Два видеофайла по 8 ГБ с одинаковым размером → попытка загрузить 8 ГБ в
память на каждый. На типичной машине это падение по нехватке памяти.

**Фикс** — потоковое хеширование + `spawn_blocking` + предварительный
частичный хеш (первые 8 КБ) как отсев до полного чтения:

```rust
#[tauri::command]
async fn find_duplicate_files(root: String) -> Result<Vec<DuplicateGroup>, String> {
    tokio::task::spawn_blocking(move || {
        use std::collections::HashMap;
        use std::io::Read;
        use walkdir::WalkDir;

        // Фаза 1 — группировка по размеру (метаданные, без чтения содержимого)
        let mut by_size: HashMap<u64, Vec<std::path::PathBuf>> = HashMap::new();
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() && meta.len() > 0 {
                    by_size.entry(meta.len()).or_default().push(entry.into_path());
                }
            }
        }

        let mut groups = Vec::new();
        for (size, paths) in by_size.into_iter().filter(|(_, p)| p.len() > 1) {
            // Фаза 2 — частичный хеш первых 8 КБ, отсекает большинство
            // ложных кандидатов без полного чтения
            let mut by_prefix: HashMap<String, Vec<std::path::PathBuf>> = HashMap::new();
            for path in paths {
                if let Some(h) = hash_prefix(&path, 8192) {
                    by_prefix.entry(h).or_default().push(path);
                }
            }

            // Фаза 3 — полный ПОТОКОВЫЙ хеш только для выживших
            for (_, candidates) in by_prefix.into_iter().filter(|(_, p)| p.len() > 1) {
                let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
                for path in candidates {
                    if let Some(h) = hash_file_streaming(&path) {
                        by_hash.entry(h).or_default().push(path.to_string_lossy().to_string());
                    }
                }
                for (hash, group_paths) in by_hash {
                    if group_paths.len() > 1 {
                        groups.push(DuplicateGroup { hash, size, paths: group_paths });
                    }
                }
            }
        }
        groups.sort_by(|a, b| (b.size * b.paths.len() as u64).cmp(&(a.size * a.paths.len() as u64)));
        Ok(groups)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Потоковое хеширование — постоянный расход памяти независимо от размера файла
fn hash_file_streaming(path: &std::path::Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().to_hex().to_string())
}

fn hash_prefix(path: &std::path::Path, bytes: usize) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; bytes];
    let n = file.read(&mut buf).ok()?;
    Some(blake3::hash(&buf[..n]).to_hex().to_string())
}
```
`scan_directory_sizes` — обернуть тело в `spawn_blocking` тем же приёмом.

### Баг #3 🔴 — утечка PTY-сессий (процессы PowerShell накапливаются)

`create_terminal_session` кладёт сессию в `TerminalState.sessions`, спавнит
`powershell.exe` и отдельный OS-поток на чтение вывода. Команды
`close_terminal_session` **не существует**, а `RealTerminal.tsx` в cleanup
делает только:
```typescript
return () => {
  window.removeEventListener('resize', handleResize);
  unlisten?.();
  term.dispose();      // ← убирает только фронтенд
};
```
Каждое открытие-закрытие окна терминала оставляет висеть `powershell.exe`,
поток-читатель и запись в `HashMap` — навсегда, до перезапуска SysForge.

**Фикс**:
```rust
#[tauri::command]
fn close_terminal_session(state: State<TerminalState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.remove(&session_id) {
        // Drop master/writer закрывает PTY — дочерний процесс получает EOF
        // и завершается, поток-читатель выходит из цикла по Ok(0)
        drop(session);
    }
    Ok(())
}
```
```diff
 return () => {
   window.removeEventListener('resize', handleResize);
   unlisten?.();
+  if (isTauri) {
+    import('@tauri-apps/api/core').then(({ invoke }) =>
+      invoke('close_terminal_session', { sessionId: sessionId.current }).catch(() => {})
+    );
+  }
   term.dispose();
 };
```
Дополнительно — в `PtySession` хранить `Box<dyn Child>` от `spawn_command`,
чтобы в `close_terminal_session` можно было вызвать `.kill()` явно, если
процесс не завершился по EOF (например, запущен вложенный `python`, который
игнорирует закрытие ввода).

---

## ЧАСТЬ 2 — Доведение проводника до спроектированной формы

Сейчас реализована только fallback-ветка из патча K: `walkdir` по дереву на
каждый запрос. Работает, но это именно тот компромисс, которого вы просили
избежать.

### 2.1. Индекс имён на основе MFT

`Cargo.toml`:
```toml
usn-journal-rs = "0.3"
```

Elevated-хелпер отдельным бинарником (`src-tauri/src/bin/mft_helper.rs`) —
права администратора нужны только ему, не всему SysForge:
```rust
fn main() {
    let drive: char = std::env::args().nth(1).unwrap().chars().next().unwrap();
    let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive).unwrap();
    let mft = usn_journal_rs::mft::Mft::new(&volume);
    let resolver = usn_journal_rs::path::PathResolver::new_with_cache(&volume);
    for entry in mft.iter() {
        let path = resolver.resolve_path(&entry);
        println!("{}", serde_json::to_string(&FileEntryLine {
            path,
            size: entry.size(),
            is_dir: entry.is_directory(),
        }).unwrap());
    }
}
```
Запуск через `ShellExecuteW` с verb `"runas"` — одно окно UAC под конкретно
эту функцию. Основной процесс читает stdout построчно (NDJSON) и наполняет:
```rust
struct FilenameIndexState {
    entries: RwLock<Vec<FileEntry>>,
    indexed_volumes: RwLock<Vec<char>>,
}
```
Поиск — линейная фильтрация по `name_lower.contains(&q)`; для сотен тысяч
записей это укладывается в единицы миллисекунд, специальные структуры не
нужны.

Живое обновление — чтение USN Journal, а не пересканирование:
```rust
async fn tail_usn_journal(app: tauri::AppHandle, drive: char) {
    let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive).unwrap();
    let journal = volume.journal();
    loop {
        if let Ok(iter) = journal.iter() {
            for entry in iter {
                let state: State<FilenameIndexState> = app.state();
                apply_usn_change(&state, entry); // create / delete / rename
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
}
```
Существующий `search_files_by_name` остаётся под именем
`search_files_by_name_fallback` и используется, когда UAC отклонён, том не
NTFS, или индекс ещё строится.

### 2.2. Полнотекстовый индекс содержимого (Tantivy)

`Cargo.toml`:
```toml
tantivy = "0.22"
notify = "6"
```

Схема и состояние:
```rust
fn build_schema() -> tantivy::schema::Schema {
    use tantivy::schema::*;
    let mut b = Schema::builder();
    b.add_text_field("path", STRING | STORED);
    b.add_text_field("filename", TEXT | STORED);
    b.add_text_field("content", TEXT);          // не STORED — экономит место
    b.add_text_field("extension", STRING | STORED);
    b.add_u64_field("modified_ms", STORED | FAST);
    b.build()
}

struct ContentIndexState {
    index: tantivy::Index,
    writer: Mutex<tantivy::IndexWriter>,
    reader: tantivy::IndexReader,
}
```
Индекс — в `$APPDATA/sysforge/search-index/`, переживает перезапуски.
Существующие экстракторы (`extract_text_from_docx/xlsx/pptx/opendocument/pdf`)
переиспользуются как есть — они уже написаны и покрывают больше форматов,
чем требовалось.

Построение с прогрессом:
```rust
#[tauri::command]
async fn index_folder_for_content(
    app: tauri::AppHandle,
    state: State<'_, ContentIndexState>,
    root: String,
) -> Result<(), String> {
    let files: Vec<_> = walkdir::WalkDir::new(&root)
        .into_iter().filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();
    let total = files.len();

    for (i, entry) in files.iter().enumerate() {
        if let Some(text) = extract_any_text(entry.path()) {
            let mut w = state.writer.lock().unwrap();
            w.add_document(tantivy::doc!(
                path_field      => entry.path().to_string_lossy().to_string(),
                filename_field  => entry.file_name().to_string_lossy().to_string(),
                content_field   => text,
                extension_field => ext_of(entry.path()),
            )).map_err(|e| e.to_string())?;
        }
        if i % 50 == 0 {
            let _ = app.emit("sysforge:index-progress", (i, total));
        }
    }
    state.writer.lock().unwrap().commit().map_err(|e| e.to_string())?;
    let _ = app.emit("sysforge:index-progress", (total, total));
    Ok(())
}
```

Поиск с ранжированием и сниппетами:
```rust
#[tauri::command]
fn search_indexed_content(
    state: State<ContentIndexState>,
    query: String,
    limit: usize,
) -> Result<Vec<ContentSearchMatch>, String> {
    let searcher = state.reader.searcher();
    let parser = tantivy::query::QueryParser::for_index(&state.index, vec![content_field]);
    let parsed = parser.parse_query(&query).map_err(|e| e.to_string())?;
    let top = searcher
        .search(&parsed, &tantivy::collector::TopDocs::with_limit(limit))
        .map_err(|e| e.to_string())?;

    let snippet_gen = tantivy::SnippetGenerator::create(&searcher, &parsed, content_field)
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for (score, addr) in top {
        let doc: tantivy::TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
        let snippet = snippet_gen.snippet_from_doc(&doc);
        out.push(ContentSearchMatch {
            path: get_str(&doc, path_field),
            filename: get_str(&doc, filename_field),
            score,
            snippet: snippet.fragment().to_string(),
            highlights: snippet.highlighted().iter().map(|r| (r.start, r.end)).collect(),
        });
    }
    Ok(out)
}
```

Инкрементальное обновление через `notify` — переиндексируется только
изменившийся файл (удалить старый документ по `path` через
`writer.delete_term`, добавить новый), а не вся папка.

Текущий `search_files_by_content` сохраняется как режим «поиск без индекса»
для папок, которые пользователь не добавлял в индекс — это осмысленный
сценарий (разовый поиск в чужой папке), а не костыль.

---

## ЧАСТЬ 3 — Настоящие эмбеддинги для Джарвиса

`embed_text()` по-прежнему хеширует символьные n-граммы в 256-мерный вектор.
Это измеряет сходство букв, а не смысла, поэтому «закрой калькулятор» и
«открой калькулятор» для него почти идентичны.

### 3.1. Модель и зависимость

```toml
fastembed = "4"
```
`fastembed` сам скачивает и кеширует ONNX-модель, сам делает токенизацию и
mean-pooling — не нужно писать это вручную поверх `ort` + `tokenizers`.

Модель — `multilingual-e5-small` (нужен русский). Честно про размер: это
~470 МБ, и это единственный по-настоящему увесистый элемент всего плана.
Три способа обойтись без раздувания инсталлятора, выбрать один:
- **Докачка при первом запуске Джарвиса** (рекомендую) — инсталлятор
  остаётся прежнего размера, модель тянется один раз в фоне с прогресс-баром,
  кешируется в `$APPDATA/sysforge/models/`. До завершения загрузки работает
  каскад из уровней 1–2 (прямые паттерны + нечёткий матчер), который сам по
  себе покрывает большинство команд.
- Бандлить в инсталлятор — +470 МБ к дистрибутиву, зато работает офлайн
  сразу после установки.
- Квантованный вариант модели (int8) — примерно втрое меньше при небольшой
  потере точности; `fastembed` поддерживает квантованные ревизии.

### 3.2. Переписанный классификатор

```rust
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

static MODEL: OnceCell<Mutex<TextEmbedding>> = OnceCell::new();
static INTENTS: OnceCell<Vec<IntentVector>> = OnceCell::new();

struct IntentVector { skill_id: String, vector: Vec<f32> }

pub fn init_model(cache_dir: std::path::PathBuf) -> Result<(), String> {
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::MultilingualE5Small)
            .with_cache_dir(cache_dir)
            .with_show_download_progress(true),
    ).map_err(|e| e.to_string())?;
    MODEL.set(Mutex::new(model)).map_err(|_| "already init")?;
    Ok(())
}

/// Один усреднённый вектор на навык из всех его фраз-примеров —
/// навык представлен «центром смысла» своих формулировок.
pub fn build_intent_vectors(skills: &[SkillDef]) -> Result<(), String> {
    let model = MODEL.get().ok_or("model not initialized")?;
    let mut intents = Vec::new();

    for skill in skills {
        let phrases = skill.phrases_all();
        if phrases.is_empty() { continue; }

        let embeddings = model.lock().unwrap()
            .embed(phrases.iter().map(|s| s.as_str()).collect(), None)
            .map_err(|e| e.to_string())?;

        let dim = embeddings[0].len();
        let mut avg = vec![0.0f32; dim];
        for emb in &embeddings {
            for (i, v) in emb.iter().enumerate() { avg[i] += v; }
        }
        let count = embeddings.len() as f32;
        for v in &mut avg { *v /= count; }

        // Нормализация обязательна — иначе косинусное сходство неверно
        let norm: f32 = avg.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 0.0 { for v in &mut avg { *v /= norm; } }

        intents.push(IntentVector { skill_id: skill.id.clone(), vector: avg });
    }
    INTENTS.set(intents).map_err(|_| "already built")?;
    Ok(())
}

#[tauri::command]
pub fn jarvis_match_intent(text: String) -> Option<EmbeddingMatch> {
    let model = MODEL.get()?;
    let intents = INTENTS.get()?;

    let embeddings = model.lock().unwrap().embed(vec![text.as_str()], None).ok()?;
    let mut q = embeddings.into_iter().next()?;
    let norm: f32 = q.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0.0 { for v in &mut q { *v /= norm; } }

    let (mut best_idx, mut best) = (0usize, -1.0f64);
    for (i, intent) in intents.iter().enumerate() {
        let score: f64 = q.iter().zip(intent.vector.iter())
            .map(|(a, b)| (*a as f64) * (*b as f64)).sum();
        if score > best { best = score; best_idx = i; }
    }
    Some(EmbeddingMatch {
        skill_id: intents[best_idx].skill_id.clone(),
        confidence: best,
        extracted_slots: Default::default(),
    })
}
```

### 3.3. Кеш векторов

Хеш набора навыков (id + все фразы, отсортированные) в
`$APPDATA/sysforge/embedding_hash.txt`, сами векторы —
`embedding_intents.json`. При старте: хеш совпал → грузим из кеша (мгновенно);
не совпал → пересчитываем и перезаписываем. Так первый запуск после
добавления навыка чуть дольше, все остальные — быстрые.

### 3.4. Нечёткий матчер (уровень 2 каскада)

Отдельно от эмбеддингов нужен уровень, устойчивый к ошибкам STT. Сейчас
`keywordMatch` использует `lower.includes(word)` — точное вхождение
подстроки. STT услышал «калькулятар» → ноль совпадений.

`src/lib/jarvis/fuzzy-matcher.ts`:
```typescript
function ratio(a: string, b: string): number {
  if (a === b) return 100;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return (1 - prev[n] / Math.max(m, n)) * 100;
}

// Для русской морфологии: «калькулятору» / «калькулятором» — сравниваем и основы
function stemRatio(a: string, b: string): number {
  const direct = ratio(a, b);
  if (a.length > 5 && b.length > 5) {
    return Math.max(direct, ratio(a.slice(0, 5), b.slice(0, 5)) * 0.95);
  }
  return direct;
}

function wordOverlapScore(inputWords: string[], cmdWords: string[]): number {
  if (!inputWords.length || !cmdWords.length) return 0;
  let matched = 0;
  for (const iw of inputWords) {
    const best = Math.max(...cmdWords.map((cw) => stemRatio(iw, cw)));
    if (best > 70) matched += best / 100;
  }
  return (matched / Math.max(inputWords.length, cmdWords.length)) * 100;
}

export function fuzzyMatch(text: string, skills: Skill[]): FuzzyMatch | null {
  const phrase = text.trim().toLowerCase();
  if (!phrase) return null;
  const phraseWords = phrase.split(/\s+/);
  const wantsClose = CLOSE_INTENT.test(phrase);
  const wantsOpen = OPEN_INTENT.test(phrase);

  let best: FuzzyMatch | null = null;
  let bestScore = 65; // CMD_RATIO_THRESHOLD

  for (const skill of skills) {
    // Предфильтр по противоположному намерению — сохраняем существующую
    // проверку, она надёжнее, чем полагаться на разницу в score
    if (wantsClose && skill.steps.some((s) => s.tool === 'open_system_app' || s.tool === 'open_url')) continue;
    if (wantsOpen && skill.steps.some((s) => s.tool === 'close_os_app')) continue;

    for (const cmdPhrase of [...(skill.phrases.ru || []), ...(skill.phrases.en || [])]) {
      const cp = cmdPhrase.trim().toLowerCase();
      const score = ratio(phrase, cp) * 0.6 + wordOverlapScore(phraseWords, cp.split(/\s+/)) * 0.4;
      if (score >= 99) return { skillId: skill.id, score, matchedPhrase: cmdPhrase };
      if (score > bestScore) { bestScore = score; best = { skillId: skill.id, score, matchedPhrase: cmdPhrase }; }
    }
  }
  return best;
}
```

### 3.5. Извлечение слотов

Сейчас `extracted_slots: {}` — параметры не извлекаются, поэтому навыки с
`{host}`, `{query}`, `{duration}` через быстрые пути не работают вовсе.
`slot_extractor.rs` уже существует как файл — наполнить его:
```rust
pub fn extract_slots(input: &str, schema: &SlotSchema) -> HashMap<String, String> {
    let mut slots = HashMap::new();
    for (name, def) in schema.iter() {
        let value = match def.pattern.as_str() {
            "ip_or_hostname" => by_regex(input, r"\b((?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,})\b"),
            "number"         => by_regex(input, r"\b(\d+)\b"),
            "duration"       => extract_duration(input),  // «через час» → 60
            "rest_of_phrase" => after_context(input, &def.context_words),
            _ => None,
        };
        if let Some(v) = value { slots.insert(name.clone(), v); }
        else if let Some(d) = &def.default { slots.insert(name.clone(), d.clone()); }
    }
    slots
}
```
`extract_duration` должен покрывать словесные формы («через час», «через
полчаса», «через полтора часа»), а не только цифры — это прямо нужно
таймеру автозакрытия из Части F.

### 3.6. Каскад и порог

```typescript
export async function routeCommand(text: string, opts = {}): Promise<CommandResult> {
  sessionHistory.addUser(text);

  const direct = directMatch(text);                      // 1. regex
  if (direct) return executeDirect(direct, 'direct');

  const skills = skillRegistry.getBuiltinSkills();

  const fuzzy = fuzzyMatch(text, skills);                // 2. нечёткий
  if (fuzzy && fuzzy.score >= 85) {
    return executeSkillById(fuzzy.skillId, extractSlotsFor(fuzzy.skillId, text), 'keyword');
  }

  const semantic = await onnxMatch(text, opts.confidenceThreshold ?? 0.70);  // 3. смысл
  if (semantic) return executeSkillById(semantic.skill_id, semantic.extracted_slots, 'embedding');

  if (fuzzy && fuzzy.score >= 70) {                      // 3b. средний fuzzy
    return executeSkillById(fuzzy.skillId, extractSlotsFor(fuzzy.skillId, text), 'keyword');
  }

  return routeToLLM(text, opts);                         // 4. LLM
}
```
**Порог сменить с 0.82 на 0.70.** Значение 0.82 подбиралось под хеш-векторы,
где сходство всегда завышено; на настоящих эмбеддингах оно отсечёт валидные
перефразы, и появится ощущение, что новая модель хуже прежней.

### 3.7. Фразы-примеров — по 4–6 на навык

Усреднённый вектор (3.2) тем представительнее, чем больше формулировок.
Пройтись по всем встроенным навыкам:
```toml
[skill.phrases]
ru = ["закрой калькулятор", "заверши калькулятор", "выключи калькулятор",
      "убери калькулятор", "выруби кальк"]
```
Это даёт больший прирост качества, чем любая подкрутка порогов.

### 3.8. Панель диагностики

В `JarvisSettings` — режим, показывающий на каждую команду, какой уровень
сработал и с каким score:
```
Ввод: "выруби-ка кальк"
  1. Direct     → нет
  2. Fuzzy      → close-calculator 78.3% (ниже 85, идём дальше)
  3. Embeddings → close-calculator 0.81 ✓ выполнено
```
Без этого настройка порогов — гадание.

---

## Порядок выполнения

Всё делается в рамках одного прохода, порядок — только чтобы не ломать
зависимости между частями:

1. **Баги #1, #2, #3** — первыми, они затрагивают уже работающий код.
2. **Часть 3.4–3.5, 3.7** (нечёткий матчер, слоты, фразы) — чистый код без
   новых тяжёлых зависимостей.
3. **Часть 3.8** (диагностика) — до включения эмбеддингов, чтобы настраивать
   пороги по фактическим цифрам.
4. **Часть 3.1–3.3, 3.6** (ONNX-модель, кеш векторов, каскад, порог 0.70).
5. **Часть 2.1** (MFT-индекс + elevated-хелпер).
6. **Часть 2.2** (Tantivy-индекс, `notify`, переиспользование существующих
   экстракторов).

Пункты 5 и 6 идут последними не по важности, а потому что требуют новых
системных механизмов (UAC-хелпер, отдельное хранилище индекса) — их проще
интегрировать в кодовую базу, где уже нет висящих багов из пункта 1.
