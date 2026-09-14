# Патч-ТЗ v5 — сводный: шифрование ключей, терминал, метрики, диск, дубли, автозагрузка, проводник

> Собрано всё, что накопилось за последние несколько обсуждений в одном
> месте. Части A, M, L — то, что уже обсуждали и решили делать; Части N, O,
> P — три понравившиеся идеи, доработанные до полноценных фич; Часть K —
> мощный проводник (MFT + Tantivy), написан отдельно в прошлом сообщении,
> включаю сюда же целиком, чтобы не держать пять разных файлов.

---

## Часть A — Шифрование API-ключей (лёгкий вариант, без Credential Manager)

Симметричное шифрование AES-256-GCM, ключ шифрования нигде не хранится — он
каждый раз заново вычисляется из Machine GUID конкретной Windows-машины
(уникальный ID, лежит в реестре) через SHA-256. Ключ переживает перезапуск
сам по себе, вводить заново ничего не нужно, но в файле на диске он лежит не
текстом, а нечитаемой base64-кашей.

`Cargo.toml`:
```toml
aes-gcm = "0.10"
sha2 = "0.10"
base64 = "0.22"
```

`src-tauri/src/lib.rs`:
```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use sha2::{Sha256, Digest};

fn derive_key() -> [u8; 32] {
    let machine_id = get_machine_guid().unwrap_or_else(|| "sysforge-fallback-salt".into());
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"sysforge-jarvis-v1");
    hasher.finalize().into()
}

fn get_machine_guid() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography").ok()?
        .get_value::<String, _>("MachineGuid").ok()
}

#[tauri::command]
fn encrypt_secret(plaintext: String) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derive_key()));
    let nonce_bytes: [u8; 12] = rand::random();
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(base64::encode(combined))
}

#[tauri::command]
fn decrypt_secret(ciphertext_b64: String) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derive_key()));
    let combined = base64::decode(&ciphertext_b64).map_err(|e| e.to_string())?;
    if combined.len() < 12 { return Err("Некорректные данные".into()); }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let plaintext = cipher.decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}
```
Регистрация обеих команд в `invoke_handler![...]`.

`src/lib/tauriStorage.ts` — шифрование прозрачно на уровне адаптера
хранилища, весь остальной код продолжает работать с обычным текстовым
`apiKey` в памяти:
```typescript
async setItem(key: string, value: string) {
  const parsed = JSON.parse(value);
  if (parsed.state?.jarvis?.cloud?.apiKey) {
    parsed.state.jarvis.cloud.apiKey = await invoke('encrypt_secret', {
      plaintext: parsed.state.jarvis.cloud.apiKey,
    });
  }
  if (parsed.state?.jarvis?.cloudProviders) {
    for (const p of parsed.state.jarvis.cloudProviders) {
      if (p.apiKey) p.apiKey = await invoke('encrypt_secret', { plaintext: p.apiKey });
    }
  }
  await store.set(key, parsed);
}

async getItem(key: string) {
  const value = await store.get(key);
  if (!value) return null;
  const parsed = value as any;
  if (parsed.state?.jarvis?.cloud?.apiKey) {
    parsed.state.jarvis.cloud.apiKey = await invoke('decrypt_secret', {
      ciphertext_b64: parsed.state.jarvis.cloud.apiKey,
    }).catch(() => '');
  }
  if (parsed.state?.jarvis?.cloudProviders) {
    for (const p of parsed.state.jarvis.cloudProviders) {
      if (p.apiKey) {
        p.apiKey = await invoke('decrypt_secret', { ciphertext_b64: p.apiKey }).catch(() => '');
      }
    }
  }
  return JSON.stringify(parsed);
}
```
После этого в `settingsStore.ts` можно вернуть простой
`partialize: (state) => state` как было — вычищать ключи вручную больше не
нужно, они шифруются автоматически ещё до записи на диск, а на выходе снова
превращаются в обычный текст в памяти.

---

## Часть M — Фикс расхождения CPU/RAM между разными местами приложения

### Причина (напоминание)
Один общий `sysinfo::System` в Rust (`state.system`), но минимум четыре
независимых фронтенд-таймера дёргают его `refresh()` каждый на своей частоте
(`StatusBar` — 5с, `SystemVitals` — 2с, `SystemOverview`/Диспетчер задач —
5с, `threshold-watcher` — 5с). `sysinfo` считает CPU% как дельту с прошлого
собственного refresh — при уплотнённых, несинхронных вызовах разных
наблюдателей каждый получает свой, отличающийся от других процент.

### Фикс — один источник обновления, все остальные только читают

```rust
struct SystemSnapshotState {
    latest: RwLock<SystemInfo>,
}

async fn background_system_refresh_loop(app: tauri::AppHandle) {
    let mut sys = sysinfo::System::new_all();
    loop {
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        sys.refresh_disks();
        let snapshot = build_system_info(&sys);
        let state: State<SystemSnapshotState> = app.state();
        *state.latest.write().unwrap() = snapshot;
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    }
}

#[tauri::command]
fn get_system_info(state: State<SystemSnapshotState>) -> SystemInfo {
    state.latest.read().unwrap().clone()
}
```
Запуск фонового цикла — один раз при старте (`tauri::async_runtime::spawn`
в `setup()`). Теперь все пять мест во фронтенде получают ровно один и тот же
снимок, посчитанный ровно один раз за интервал — расхождений быть не может в
принципе, а обновление гарантированно раз в секунду, а не как попало между
независимыми таймерами.

---

## Часть L — Настоящий терминал (PTY + xterm.js)

Заменяет `run_terminal_command` (whitelist, разовый вывод) на полноценный
интерактивный терминал — все команды Windows, интерактивные программы, `cd`
между вызовами, переменные окружения сохраняются между командами.
**Не доступен Джарвису как tool** — только для ручного ввода человеком,
отдельно от `tools-schema.ts`, чтобы не обходить всю защиту голосового пути.

`Cargo.toml`: `portable-pty = "0.8"`. `package.json`: `xterm`, `xterm-addon-fit`.

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;

struct PtySession { writer: Box<dyn Write + Send>, master: Box<dyn portable_pty::MasterPty + Send> }
struct TerminalState { sessions: Mutex<std::collections::HashMap<String, PtySession>> }

#[tauri::command]
fn create_terminal_session(app: tauri::AppHandle, state: State<TerminalState>, session_id: String) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.cwd(dirs::home_dir().unwrap_or_default());
    pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let sid = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => { let _ = app_clone.emit(&format!("terminal:output:{}", sid), String::from_utf8_lossy(&buf[..n]).to_string()); }
                Err(_) => break,
            }
        }
    });

    state.sessions.lock().unwrap().insert(session_id, PtySession { writer, master: pair.master });
    Ok(())
}

#[tauri::command]
fn write_to_terminal(state: State<TerminalState>, session_id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    sessions.get_mut(&session_id).ok_or("Сессия не найдена")?.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_terminal(state: State<TerminalState>, session_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    sessions.get(&session_id).ok_or("Сессия не найдена")?.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())
}
```

```tsx
// src/apps/developer/RealTerminal.tsx
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useEffect, useRef } from 'react';

export default function RealTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    const term = new Terminal({ theme: { background: '#0a0e12', foreground: '#00ff9c' }, fontFamily: 'var(--font-mono)' });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    fit.fit();

    invoke('create_terminal_session', { sessionId: sessionId.current });
    const unlisten = listen<string>(`terminal:output:${sessionId.current}`, (e) => term.write(e.payload));
    term.onData((data) => invoke('write_to_terminal', { sessionId: sessionId.current, data }));

    const onResize = () => { fit.fit(); invoke('resize_terminal', { sessionId: sessionId.current, rows: term.rows, cols: term.cols }); };
    window.addEventListener('resize', onResize);
    return () => { unlisten.then((u) => u()); window.removeEventListener('resize', onResize); term.dispose(); };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```
Старый декоративный `MiniTerminal.tsx` остаётся как визуальный эффект на
BootScreen — `RealTerminal.tsx` регистрируется отдельной мини-программой в
категории Developer.

---

## Часть N — Анализатор занятого места на диске

Классический treemap (WinDirStat/TreeSize). Полный подсчёт всего диска сразу
может быть медленным — считаем лениво: первый уровень вложенности сразу,
глубже — по клику пользователя.

```rust
#[derive(serde::Serialize)]
struct DirNode { name: String, path: String, size: u64, is_dir: bool, children_scanned: bool }

#[tauri::command]
async fn scan_directory_sizes(path: String) -> Result<Vec<DirNode>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let size = if meta.is_dir() { dir_size_shallow_estimate(&entry.path()) } else { meta.len() };
        nodes.push(DirNode {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            size, is_dir: meta.is_dir(), children_scanned: false,
        });
    }
    nodes.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(nodes)
}
```
Фронтенд — `DiskAnalyzer.tsx`, squarified treemap (алгоритм с приятными
пропорциями прямоугольников, не длинные полоски) — своя SVG/canvas-отрисовка
в стиле проекта, а не внешняя chart-библиотека ради одного виджета. Клик по
прямоугольнику — разворачивает вложенную папку тем же `scan_directory_sizes`.

---

## Часть O — Поиск дубликатов файлов

Двухфазный подход: сначала группировка по **размеру** (дёшево, отсекает
большинство файлов сразу), затем полный хеш **BLAKE3** (заметно быстрее
SHA-256 для массовой попарной проверки) только внутри групп с совпадающим
размером.

```rust
#[derive(serde::Serialize)]
struct DuplicateGroup { hash: String, size: u64, paths: Vec<String> }

#[tauri::command]
async fn find_duplicate_files(root: String) -> Result<Vec<DuplicateGroup>, String> {
    use std::collections::HashMap;
    let mut by_size: HashMap<u64, Vec<std::path::PathBuf>> = HashMap::new();
    for entry in walkdir::WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() { by_size.entry(meta.len()).or_default().push(entry.into_path()); }
        }
    }
    let mut groups = Vec::new();
    for (size, paths) in by_size.into_iter().filter(|(_, p)| p.len() > 1) {
        let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
        for path in paths {
            if let Ok(bytes) = std::fs::read(&path) {
                let hash = blake3::hash(&bytes).to_hex().to_string();
                by_hash.entry(hash).or_default().push(path.to_string_lossy().to_string());
            }
        }
        for (hash, group_paths) in by_hash {
            if group_paths.len() > 1 { groups.push(DuplicateGroup { hash, size, paths: group_paths }); }
        }
    }
    groups.sort_by(|a, b| (b.size * b.paths.len() as u64).cmp(&(a.size * a.paths.len() as u64)));
    Ok(groups)
}
```
(`blake3 = "1"` в `Cargo.toml`). UI — список групп по убыванию освобождаемого
места, чекбоксы «оставить один экземпляр, остальные удалить», обязательное
подтверждение перед удалением (ручное действие, но необратимое).

---

## Часть P — Менеджер автозагрузки Windows

Источники — реестр (`Run`/`RunOnce` в `HKCU`/`HKLM`) и папка автозагрузки.
Отключение — не удаление записи, а тот же способ, что использует встроенный
Диспетчер задач: бинарный флаг в `StartupApproved\Run` (0x02 = включено,
0x03 = выключено), чтобы запись не терялась и её можно было включить обратно.

```rust
#[derive(serde::Serialize)]
struct StartupEntry { name: String, command: String, location: String, enabled: bool }

#[tauri::command]
fn list_startup_entries() -> Result<Vec<StartupEntry>, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut entries = Vec::new();
    for (hive, hive_name) in [(HKEY_CURRENT_USER, "HKCU"), (HKEY_LOCAL_MACHINE, "HKLM")] {
        if let Ok(run_key) = RegKey::predef(hive).open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run") {
            for (val_name, val) in run_key.enum_values().flatten() {
                let enabled = is_startup_enabled(hive, &val_name);
                entries.push(StartupEntry { name: val_name, command: val.to_string(), location: hive_name.into(), enabled });
            }
        }
    }
    Ok(entries)
}

fn is_startup_enabled(hive: winreg::HKEY, name: &str) -> bool {
    use winreg::RegKey;
    RegKey::predef(hive)
        .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run")
        .and_then(|k| k.get_raw_value(name))
        .map(|v| v.bytes.first().copied().unwrap_or(2) != 3)
        .unwrap_or(true)
}

#[tauri::command]
fn toggle_startup_entry(hive_name: String, name: String, enable: bool) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::{RegKey, RegValue};
    let hive = if hive_name == "HKLM" { HKEY_LOCAL_MACHINE } else { HKEY_CURRENT_USER };
    let key = RegKey::predef(hive)
        .open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", KEY_SET_VALUE)
        .map_err(|e| e.to_string())?;
    let flag: u8 = if enable { 0x02 } else { 0x03 };
    let data = vec![flag, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    key.set_raw_value(&name, &RegValue { bytes: data, vtype: REG_BINARY }).map_err(|e| e.to_string())
}
```
UI — `StartupManager.tsx`, список с переключателем вкл/выкл, путь к
исполняемому файлу, источник (HKCU/HKLM/папка автозагрузки). Изменение записи
HKLM может требовать прав администратора (чтение — нет) — обработать так же
честно, как MFT в Части K: неактивный переключатель с подсказкой, не падать
молча.

---

## Часть K — Мощный проводник (MFT + Tantivy)

### K.0. Общая схема
```
Frontend: FileExplorer.tsx
  Таб "Имя и тип" (мгновенно)  │  Таб "Содержимое" (Tantivy)
        │                              │
invoke('search_by_name')      invoke('search_by_content')
        │                              │
FilenameIndexState              ContentIndexState
Vec<FileEntry> в памяти          tantivy::Index на диске
живой (USN Journal tailing)      ($APPDATA/sysforge/search-index/)
строится из MFT при старте       инкрементальный
        │                              │
  usn-journal-rs                notify (fs watcher)
  (чтение MFT/USN,               + tantivy IndexWriter
   нужны права)
```

### K.1. Поиск по имени/типу — MFT/USN (как Everything)

Права администратора нужны только для отдельного маленького
elevated-хелпер-процесса (`src-tauri/src/mft_helper/main.rs`), не для всего
SysForge — UAC спрашивается один раз под конкретно эту фичу:
```rust
fn main() {
    let drive: char = std::env::args().nth(1).unwrap().chars().next().unwrap();
    let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive).unwrap();
    let mft = usn_journal_rs::mft::Mft::new(&volume);
    let resolver = usn_journal_rs::path::PathResolver::new_with_cache(&volume);
    for entry in mft.iter() {
        let path = resolver.resolve_path(&entry);
        println!("{}", serde_json::to_string(&FileEntryLine {
            path, size: entry.size(), is_dir: entry.is_directory(), modified: entry.modified_time(),
        }).unwrap());
    }
}
```
Индекс — простой `Vec<FileEntry>` в памяти (даже "Everything" на полмиллиона
файлов держит индекс в 50–80 МБ и ищет линейным сравнением):
```rust
#[tauri::command]
fn search_by_name(state: State<FilenameIndexState>, query: String, extension_filter: Option<String>, limit: usize) -> Vec<FileEntry> {
    let q = query.to_lowercase();
    state.entries.read().unwrap().iter()
        .filter(|e| e.name_lower.contains(&q))
        .filter(|e| extension_filter.as_ref().map_or(true, |ext| &e.extension == ext))
        .take(limit).cloned().collect()
}
```
Живое обновление через USN Journal, не пересканирование:
```rust
async fn tail_usn_journal(app: tauri::AppHandle, drive: char) {
    let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive).unwrap();
    let journal = volume.journal();
    loop {
        if let Ok(iter) = journal.iter() {
            for entry in iter {
                let state: State<FilenameIndexState> = app.state();
                apply_usn_change(&state, entry);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
}
```
Честный fallback без прав/для не-NTFS:
```rust
#[tauri::command]
async fn search_by_name_fallback(query: String, root: String) -> Result<Vec<FileEntry>, String> {
    use walkdir::WalkDir;
    let q = query.to_lowercase();
    Ok(WalkDir::new(&root).into_iter().filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().to_lowercase().contains(&q))
        .map(|e| FileEntry::from(&e)).collect())
}
```

### K.2. Поиск по содержимому — персистентный Tantivy-индекс

```rust
fn build_schema() -> tantivy::schema::Schema {
    let mut builder = tantivy::schema::Schema::builder();
    builder.add_text_field("path", tantivy::schema::STRING | tantivy::schema::STORED);
    builder.add_text_field("filename", tantivy::schema::TEXT | tantivy::schema::STORED);
    builder.add_text_field("content", tantivy::schema::TEXT);
    builder.add_text_field("extension", tantivy::schema::STRING | tantivy::schema::STORED);
    builder.build()
}

fn extract_text(path: &Path) -> Option<String> {
    match path.extension()?.to_str()?.to_lowercase().as_str() {
        "txt" | "md" | "csv" | "log" | "json" => std::fs::read_to_string(path).ok(),
        "docx" => extract_docx_text(path),
        "pdf" => pdf_extract::extract_text(path).ok(),
        _ => None,
    }
}

fn extract_docx_text(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut xml = String::new();
    archive.by_name("word/document.xml").ok()?.read_to_string(&mut xml).ok()?;
    Some(strip_xml_tags(&xml))
}
```
Индекс строится с прогрессом (не блокируя UI, `app.emit("jarvis:index-progress", ...)`),
обновляется инкрементально через `notify` (следит за изменёнными файлами,
переиндексирует только их). Поиск — через `tantivy::query::QueryParser` с
ранжированием по релевантности и `SnippetGenerator` для подсветки совпадения.

### K.3. Модель согласия — без расширения `fs:scope` на весь диск

`capabilities/default.json` остаётся суженным (`$APPDATA/sysforge/**`) —
доступ к произвольным папкам только через явный выбор пользователя
(`@tauri-apps/plugin-dialog`, `open({ directory: true })`).

### K.4. UI

`FileExplorer.tsx` — два таба («Имя и тип» мгновенный, «Содержимое» с
debounce и сниппетами), раздел настроек «Индексируемые папки» с двумя
независимыми списками и прогресс-баром первичной индексации.

Зависимости: `usn-journal-rs = "0.3"`, `tantivy = "0.22"`, `notify = "6"`,
`zip = "2"`, `pdf-extract = "0.7"`, `walkdir = "2"`.

---

## Общий порядок применения всего патча v5

1. **Часть A** (шифрование ключей) — самое давно висящее, вперёд всех.
2. **Часть M** (фикс метрик) — небольшая, не зависит ни от чего остального.
3. **Часть P** (автозагрузка) — самостоятельная, простая, без тяжёлых зависимостей.
4. **Часть L** (терминал) — независима от остального, но помнить условие:
   НЕ регистрировать как tool для Джарвиса.
5. **Часть K** (проводник) и **Часть N** (анализатор диска) — логично идти
   вместе, обе используют `walkdir` и одну и ту же модель согласия на выбор
   папок (K.3) — переиспользовать её и для N, не делать вторую систему
   диалогов выбора папки.
6. **Часть O** (поиск дублей) — можно опереться на уже готовый обход папок
   из K/N, если они сделаны раньше — меньше дублирования кода обхода дерева
   файлов.
