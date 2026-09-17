pub mod jarvis;
pub mod voice;

use jarvis::intent::{embed_text, match_intent, IntentMatch, PhraseRegistry, SlotSchema};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, Signal, System};
use tauri::{Emitter, Manager, State};
use tokio::time::timeout;
// Part A: AES-GCM encryption
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Data structures
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct SystemInfo {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub cpu_usage: f32,
    pub cpus_usage: Vec<f32>,
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub total_swap_bytes: u64,
    pub used_swap_bytes: u64,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub uptime: u64,
    pub disks: Vec<DiskInfo>,
    pub network_interfaces: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
}

#[derive(Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub status: String,
    pub user: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct NetworkStatItem {
    pub name: String,
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
    pub total_rx_bytes: u64,
    pub total_tx_bytes: u64,
}

#[derive(Serialize)]
pub struct NetworkStatsResponse {
    pub interfaces: Vec<NetworkStatItem>,
}

#[derive(Deserialize, Debug)]
pub struct SkillIndexInput {
    pub id: String,
    pub phrases: Vec<String>,
    pub slots: Option<HashMap<String, SlotSchema>>,
}

pub struct PrevNetworkSnapshot {
    pub timestamp: Instant,
    pub interfaces: HashMap<String, (u64, u64)>, // (rx_total, tx_total)
}

pub struct SchedulerState {
    pub timers: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
}

#[derive(Clone, Serialize)]
pub struct ScheduledClose {
    pub id: String,
    pub app_name: String,
    pub fires_at_ms: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProcessConnectionInfo {
    pub pid: u32,
    pub name: String,
    pub connection_count: usize,
    pub established_count: usize,
    pub remote_endpoints: Vec<String>,
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
    pub io_read_bytes_per_sec: u64,
    pub io_write_bytes_per_sec: u64,
}

pub struct PrevProcessNetwork {
    pub timestamp: Instant,
    pub entries: HashMap<u32, (u64, u64)>, // pid -> (bytes_in, bytes_out)
}

pub struct AppState {
    pub system: Mutex<System>,
    pub networks: Mutex<Networks>,
    pub prev_network: Mutex<PrevNetworkSnapshot>,
    pub jarvis_registry: Mutex<PhraseRegistry>,
    pub prev_process_network: Mutex<PrevProcessNetwork>,
}

// ─── Part M: Single-source system snapshot ────────────────────────────────────

pub struct SystemSnapshotState {
    pub latest: RwLock<SystemInfo>,
}

impl SystemSnapshotState {
    fn default_snapshot() -> SystemInfo {
        SystemInfo {
            cpu_name: String::new(),
            cpu_cores: 0,
            cpu_usage: 0.0,
            cpus_usage: vec![],
            total_memory_bytes: 0,
            used_memory_bytes: 0,
            total_swap_bytes: 0,
            used_swap_bytes: 0,
            os_name: String::new(),
            os_version: String::new(),
            hostname: String::new(),
            uptime: 0,
            disks: vec![],
            network_interfaces: vec![],
        }
    }
}

// ─── Part L: PTY Terminal state ───────────────────────────────────────────────

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct TerminalState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

// ─── Part A: Encryption helpers ───────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn get_machine_guid() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .ok()?
        .get_value::<String, _>("MachineGuid")
        .ok()
}

#[cfg(not(target_os = "windows"))]
fn get_machine_guid() -> Option<String> {
    None
}

fn derive_key() -> [u8; 32] {
    let machine_id = get_machine_guid().unwrap_or_else(|| "sysforge-fallback-salt".into());
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(b"sysforge-jarvis-v1");
    hasher.finalize().into()
}

// ─── Part N: Disk Analyzer structs ───────────────────────────────────────────

#[derive(Serialize)]
struct DirNode {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    children_scanned: bool,
}

// ─── Part O: Duplicate Finder structs ────────────────────────────────────────

#[derive(Serialize)]
struct DuplicateGroup {
    hash: String,
    size: u64,
    paths: Vec<String>,
}

// ─── Part P: Startup Manager structs ─────────────────────────────────────────

#[derive(Serialize)]
struct StartupEntry {
    name: String,
    command: String,
    location: String,
    enabled: bool,
}

// ─── Part K: File Explorer structs ───────────────────────────────────────────

#[derive(Serialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    extension: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: input sanitization
// ─────────────────────────────────────────────────────────────────────────────

fn validate_host(host: &str) -> Result<(), String> {
    let host = host.trim();
    if host.is_empty() || host.len() > 253 {
        return Err("Invalid host length".to_string());
    }
    if !host
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == ':')
    {
        return Err(
            "Host contains invalid characters (possible injection attempt)".to_string(),
        );
    }
    Ok(())
}

/// Run a subprocess async with a hard timeout.
/// Returns stdout text or a timeout/error message.
async fn run_cmd_timeout(
    program: &str,
    args: &[&str],
    timeout_secs: u64,
) -> Result<String, String> {
    let prog = program.to_string();
    let args_owned: Vec<String> = args.iter().map(|a| a.to_string()).collect();

    let task = tokio::task::spawn_blocking(move || {
        std::process::Command::new(&prog)
            .args(&args_owned)
            // Prevent console window popup on Windows
            .creation_flags_if_windows(0x08000000)
            .output()
            .map_err(|e| format!("Execution error: {}", e))
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout).to_string();
                let err = String::from_utf8_lossy(&o.stderr).to_string();
                if out.is_empty() && !err.is_empty() {
                    err
                } else {
                    out
                }
            })
    });

    match timeout(Duration::from_secs(timeout_secs), task).await {
        Ok(Ok(Ok(output))) => Ok(output),
        Ok(Ok(Err(e))) => Err(e),
        Ok(Err(join_err)) => Err(format!("Task error: {}", join_err)),
        Err(_) => Err(format!(
            "Command timed out after {}s. The target may be unreachable.",
            timeout_secs
        )),
    }
}

// Helper trait to set CREATE_NO_WINDOW on Windows only
trait CommandExt {
    fn creation_flags_if_windows(&mut self, flags: u32) -> &mut Self;
}

impl CommandExt for std::process::Command {
    #[cfg(target_os = "windows")]
    fn creation_flags_if_windows(&mut self, flags: u32) -> &mut Self {
        use std::os::windows::process::CommandExt;
        self.creation_flags(flags)
    }

    #[cfg(not(target_os = "windows"))]
    fn creation_flags_if_windows(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// System Commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_info(snapshot: State<SystemSnapshotState>) -> SystemInfo {
    snapshot.latest.read().unwrap().clone()
}

async fn background_system_refresh_loop(app: tauri::AppHandle) {
    let mut sys = System::new_all();
    loop {
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let disks = Disks::new_with_refreshed_list();
        let disk_info: Vec<DiskInfo> = disks
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount: d.mount_point().to_string_lossy().to_string(),
                total_bytes: d.total_space(),
                used_bytes: d.total_space().saturating_sub(d.available_space()),
            })
            .collect();
        let cpu_name = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "CPU".to_string());
        let net_interfaces: Vec<String> = Networks::new_with_refreshed_list()
            .iter()
            .map(|(n, _)| n.clone())
            .collect();
        let snapshot = SystemInfo {
            cpu_name,
            cpu_cores: sys.cpus().len(),
            cpu_usage: sys.global_cpu_info().cpu_usage(),
            cpus_usage: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
            total_memory_bytes: sys.total_memory(),
            used_memory_bytes: sys.used_memory(),
            total_swap_bytes: sys.total_swap(),
            used_swap_bytes: sys.used_swap(),
            os_name: System::name().unwrap_or_default(),
            os_version: System::os_version().unwrap_or_default(),
            hostname: System::host_name().unwrap_or_default(),
            uptime: System::uptime(),
            disks: disk_info,
            network_interfaces: net_interfaces,
        };
        if let Ok(state) = app.try_state::<SystemSnapshotState>().ok_or(()) {
            *state.latest.write().unwrap() = snapshot;
        }
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    }
}

#[tauri::command]
fn get_network_stats(state: State<AppState>) -> NetworkStatsResponse {
    let mut networks = state.networks.lock().unwrap();
    networks.refresh();

    let mut prev_snap = state.prev_network.lock().unwrap();
    let now = Instant::now();
    let elapsed = now.duration_since(prev_snap.timestamp).as_secs_f64().max(0.1);

    let mut items = Vec::new();
    let mut new_snap_map = HashMap::new();

    for (name, data) in networks.iter() {
        let total_rx = data.total_received();
        let total_tx = data.total_transmitted();

        let (rx_rate, tx_rate) = if let Some(&(prev_rx, prev_tx)) = prev_snap.interfaces.get(name) {
            let diff_rx = total_rx.saturating_sub(prev_rx);
            let diff_tx = total_tx.saturating_sub(prev_tx);
            (
                (diff_rx as f64 / elapsed).round() as u64,
                (diff_tx as f64 / elapsed).round() as u64,
            )
        } else {
            (0, 0)
        };

        new_snap_map.insert(name.clone(), (total_rx, total_tx));

        items.push(NetworkStatItem {
            name: name.clone(),
            rx_bytes_per_sec: rx_rate,
            tx_bytes_per_sec: tx_rate,
            total_rx_bytes: total_rx,
            total_tx_bytes: total_tx,
        });
    }

    prev_snap.timestamp = now;
    prev_snap.interfaces = new_snap_map;

    NetworkStatsResponse { interfaces: items }
}

#[tauri::command]
fn get_processes(state: State<AppState>) -> Vec<ProcessInfo> {
    let mut sys = state.system.lock().unwrap();
    sys.refresh_processes();

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(_, process)| ProcessInfo {
            pid: process.pid().as_u32(),
            name: process.name().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_bytes: process.memory(),
            status: format!("{:?}", process.status()),
            user: process
                .user_id()
                .map(|uid| format!("{:?}", uid))
                .unwrap_or_default(),
        })
        .collect();

    processes.sort_by(|a, b| {
        b.cpu_usage
            .partial_cmp(&a.cpu_usage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes.truncate(200);
    processes
}

#[tauri::command]
fn kill_process(state: State<AppState>, pid: u32) -> Result<String, String> {
    if pid <= 4 {
        return Err("Cannot kill system critical process (PID <= 4)".to_string());
    }

    let mut sys = state.system.lock().unwrap();
    sys.refresh_processes();

    let sys_pid = sysinfo::Pid::from(pid as usize);
    if let Some(process) = sys.process(sys_pid) {
        let name = process.name().to_string();
        if process.kill_with(Signal::Kill).unwrap_or(false) || process.kill() {
            println!("[AUDIT] Process killed: PID {} ({})", pid, name);
            Ok(format!(
                "Process {} (PID {}) terminated successfully.",
                name, pid
            ))
        } else {
            Err(format!(
                "Failed to kill process PID {} ({}) - permission denied.",
                pid, name
            ))
        }
    } else {
        Err(format!("Process with PID {} not found.", pid))
    }
}

/// Traceroute with configurable max hops, no-fragment flag, and 60s timeout.
#[tauri::command]
async fn traceroute_host(
    host: String,
    max_hops: Option<u32>,
    no_fragment: Option<bool>,
) -> Result<String, String> {
    validate_host(&host)?;

    let hops = max_hops.unwrap_or(30).min(64).to_string();
    let nofrag = no_fragment.unwrap_or(false);

    #[cfg(target_os = "windows")]
    let (prog, args): (&str, Vec<String>) = {
        let mut a = vec!["-h".to_string(), hops, "-w".to_string(), "3000".to_string()];
        if nofrag {
            a.push("-d".to_string()); // -d = don't resolve hostnames
        }
        a.push(host.clone());
        ("tracert", a)
    };

    #[cfg(not(target_os = "windows"))]
    let (prog, args): (&str, Vec<String>) = {
        let mut a = vec!["-m".to_string(), hops, "-w".to_string(), "3".to_string()];
        if nofrag {
            a.push("-n".to_string()); // -n = numeric only, no DNS
        }
        a.push(host.clone());
        ("traceroute", a)
    };

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_cmd_timeout(prog, &arg_refs, 60).await
}

/// Ping with configurable count and timeout.
#[tauri::command]
async fn ping_host(host: String, count: Option<u32>) -> Result<String, String> {
    validate_host(&host)?;

    let n = count.unwrap_or(4).min(20).to_string();

    #[cfg(target_os = "windows")]
    let args = vec!["-n", &n, "-w", "3000", &host];
    #[cfg(not(target_os = "windows"))]
    let args = vec!["-c", &n, "-W", "3", &host];

    run_cmd_timeout("ping", &args, 30).await
}

/// DNS lookup with 10s timeout.
#[tauri::command]
async fn dns_lookup(host: String, query_type: Option<String>) -> Result<String, String> {
    validate_host(&host)?;

    let qtype = query_type
        .as_deref()
        .unwrap_or("A")
        .to_uppercase();

    let valid_qtypes = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "PTR", "SOA"];
    let qtype = if valid_qtypes.contains(&qtype.as_str()) {
        qtype
    } else {
        "A".to_string()
    };

    let args: Vec<&str> = vec![&host, &qtype];
    run_cmd_timeout("nslookup", &args, 10).await
}

/// Run whitelisted terminal commands — all async with timeout.
#[tauri::command]
async fn run_terminal_command(command: String) -> Result<String, String> {
    let parts: Vec<&str> = command.trim().split_whitespace().collect();
    if parts.is_empty() {
        return Ok(String::new());
    }

    let cmd_name = parts[0].to_lowercase();
    let args = &parts[1..];

    match cmd_name.as_str() {
        "help" => Ok(
            "Commands: ping [-n count] <host>  |  tracert [-d] [-h hops] <host>  |  nslookup [type] <host>  |  netstat  |  ipconfig  |  whoami  |  uptime  |  echo  |  cls  |  help"
                .to_string(),
        ),
        "echo" => Ok(args.join(" ")),
        "ping" => {
            let (count, host) = parse_ping_args(args);
            if let Some(h) = host {
                ping_host(h.to_string(), count).await
            } else {
                Err("Usage: ping [-n <count>] <host>".to_string())
            }
        }
        "tracert" | "traceroute" => {
            let (max_hops, no_dns, host) = parse_tracert_args(args);
            if let Some(h) = host {
                traceroute_host(h.to_string(), max_hops, Some(no_dns)).await
            } else {
                Err("Usage: tracert [-d] [-h <hops>] <host>".to_string())
            }
        }
        "nslookup" | "dig" => {
            if let Some(h) = args.first() {
                let qtype = args.get(1).map(|s| s.to_string());
                dns_lookup(h.to_string(), qtype).await
            } else {
                Err("Usage: nslookup <host> [A|MX|NS|TXT|AAAA]".to_string())
            }
        }
        "netstat" => {
            #[cfg(target_os = "windows")]
            return run_cmd_timeout("netstat", &["-ano"], 10).await;
            #[cfg(not(target_os = "windows"))]
            return run_cmd_timeout("netstat", &["-tuln"], 10).await;
        }
        "ipconfig" | "ifconfig" => {
            #[cfg(target_os = "windows")]
            return run_cmd_timeout("ipconfig", &[], 5).await;
            #[cfg(not(target_os = "windows"))]
            return run_cmd_timeout("ifconfig", &[], 5).await;
        }
        "whoami" => run_cmd_timeout("whoami", &[], 5).await,
        "uptime" => {
            let uptime = System::uptime();
            let days = uptime / 86400;
            let hours = (uptime % 86400) / 3600;
            let mins = (uptime % 3600) / 60;
            let secs = uptime % 60;
            Ok(format!(
                "System Uptime: {}d {}h {}m {}s",
                days, hours, mins, secs
            ))
        }
        _ => Err(format!(
            "'{}' is not recognized or not permitted. Type 'help'.",
            cmd_name
        )),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis Commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn jarvis_match_intent(
    state: State<AppState>,
    text: String,
) -> Option<IntentMatch> {
    let registry = state.jarvis_registry.lock().unwrap();
    match_intent(&text, &registry, 0.45)
}

#[tauri::command]
fn jarvis_reindex_skill(
    _state: State<AppState>,
    skill_id: String,
) -> Result<(), String> {
    println!("[JARVIS] Reindexing skill: {}", skill_id);
    Ok(())
}

#[tauri::command]
fn jarvis_build_intent_index(
    state: State<AppState>,
    skills: Vec<SkillIndexInput>,
) -> Result<(), String> {
    let mut registry = state.jarvis_registry.lock().unwrap();
    for skill in skills {
        for phrase in skill.phrases {
            let vec = embed_text(&phrase);
            registry.insert_phrase(&skill.id, phrase, vec);
        }
        if let Some(slots) = skill.slots {
            registry.register_slots(&skill.id, slots);
        }
    }
    Ok(())
}

#[tauri::command]
async fn jarvis_open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let res = run_cmd_timeout("cmd", &["/c", "start", "", &url], 5).await;
        res.map(|_| ())
    }
    #[cfg(target_os = "macos")]
    {
        let res = run_cmd_timeout("open", &[&url], 5).await;
        res.map(|_| ())
    }
    #[cfg(target_os = "linux")]
    {
        let res = run_cmd_timeout("xdg-open", &[&url], 5).await;
        res.map(|_| ())
    }
}

fn resolve_whitelisted_app(id: &str) -> Option<&'static str> {
    match id.to_lowercase().as_str() {
        "calculator" | "calc" | "calc.exe" => Some("calc.exe"),
        "notepad" | "notepad.exe" => Some("notepad.exe"),
        "explorer" | "file_explorer" | "explorer.exe" => Some("explorer.exe"),
        "task_manager" | "taskmgr" | "taskmgr.exe" => Some("taskmgr.exe"),
        "paint" | "mspaint" | "mspaint.exe" => Some("mspaint.exe"),
        "cmd" | "terminal" | "cmd.exe" => Some("cmd.exe"),
        "powershell" | "powershell.exe" => Some("powershell.exe"),
        _ => None,
    }
}

#[tauri::command]
async fn jarvis_open_system_app(app_id: String) -> Result<String, String> {
    let resolved = resolve_whitelisted_app(&app_id).ok_or_else(|| {
        format!("'{}' не в списке разрешённых системных программ.", app_id)
    })?;

    let task = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(resolved);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn()
    });

    match task.await {
        Ok(Ok(_)) => Ok(format!("Запущено: {}", resolved)),
        Ok(Err(e)) => Err(format!("Не удалось запустить {}: {}", resolved, e)),
        Err(e) => Err(format!("Задача запуска завершилась с ошибкой: {}", e)),
    }
}

#[derive(serde::Deserialize)]
struct LlmChatRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    headers: std::collections::HashMap<String, String>,
    #[serde(default)]
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let is_get = req.method.as_deref().map(|m| m.eq_ignore_ascii_case("GET")).unwrap_or(false);
    let mut builder = if is_get {
        client.get(&req.url)
    } else {
        client.post(&req.url).json(&req.body)
    };
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or_else(|_| serde_json::json!({ "response": text }));
    Ok(json)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppCandidate {
    display_name: String,
    exe_path: String,
}

#[tauri::command]
async fn jarvis_find_app(query: String) -> Result<Vec<AppCandidate>, String> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(app_paths) = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths") {
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
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(app_paths) = hkcu.open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths") {
            for name in app_paths.enum_keys().flatten() {
                if name.to_lowercase().contains(&query.to_lowercase()) {
                    if let Ok(sub) = app_paths.open_subkey(&name) {
                        if let Ok(path) = sub.get_value::<String, _>("") {
                            if !candidates.iter().any(|c| c.exe_path == path) {
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
    }
    Ok(candidates)
}

#[tauri::command]
async fn jarvis_launch_registered_app(exe_path: String, display_name: String) -> Result<String, String> {
    if !std::path::Path::new(&exe_path).exists() {
        return Err(format!("Файл '{}' не существует на диске.", exe_path));
    }
    let task = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&exe_path);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn()
    });

    match task.await {
        Ok(Ok(_)) => Ok(format!("Запускаю {}", display_name)),
        Ok(Err(e)) => Err(format!("Не удалось запустить {}: {}", display_name, e)),
        Err(e) => Err(format!("Ошибка запуска: {}", e)),
    }
}

#[tauri::command]
async fn jarvis_lock_screen() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        run_cmd_timeout("rundll32.exe", &["user32.dll,LockWorkStation"], 5)
            .await
            .map(|_| ())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Lock screen not supported on this OS".to_string())
    }
}

#[derive(Serialize)]
pub struct PortScanResult {
    pub port: u16,
    pub open: bool,
}

#[tauri::command]
async fn scan_ports(
    host: String,
    ports: Vec<u16>,
    timeout_ms: Option<u64>,
) -> Result<Vec<PortScanResult>, String> {
    validate_host(&host)?;
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(1200).clamp(100, 5000));

    let mut set = tokio::task::JoinSet::new();
    for port in ports {
        let host_clone = host.clone();
        set.spawn(async move {
            let addr = format!("{}:{}", host_clone, port);
            let is_open = match timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
                Ok(Ok(_)) => true,
                _ => false,
            };
            PortScanResult { port, open: is_open }
        });
    }

    let mut results = Vec::new();
    while let Some(res) = set.join_next().await {
        if let Ok(item) = res {
            results.push(item);
        }
    }
    results.sort_by_key(|r| r.port);
    Ok(results)
}

#[tauri::command]
async fn send_wol_packet(
    mac: String,
    broadcast: Option<String>,
    port: Option<u16>,
) -> Result<String, String> {
    let cleaned_mac: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if cleaned_mac.len() != 12 {
        return Err("Invalid MAC address: must be 12 hex digits (e.g. 00:11:22:33:44:55)".to_string());
    }

    let mut mac_bytes = [0u8; 6];
    for i in 0..6 {
        mac_bytes[i] = u8::from_str_radix(&cleaned_mac[i * 2..i * 2 + 2], 16)
            .map_err(|e| format!("Invalid hex in MAC: {}", e))?;
    }

    let mut packet = [0u8; 102];
    packet[..6].fill(0xFF);
    for i in 0..16 {
        let offset = 6 + i * 6;
        packet[offset..offset + 6].copy_from_slice(&mac_bytes);
    }

    let target_ip = broadcast.unwrap_or_else(|| "255.255.255.255".to_string());
    let target_port = port.unwrap_or(9);
    let target_addr = format!("{}:{}", target_ip, target_port);

    let socket = std::net::UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| format!("Failed to bind UDP socket: {}", e))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("Failed to set UDP broadcast: {}", e))?;

    socket
        .send_to(&packet, &target_addr)
        .map_err(|e| format!("Failed to send WOL magic packet: {}", e))?;

    Ok(format!("Magic packet transmitted to {} ({})", target_addr, mac))
}

#[tauri::command]
async fn lookup_ip_intel(ip: String, api_key: String) -> Result<serde_json::Value, String> {
    validate_host(&ip)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.abuseipdb.com/api/v2/check")
        .query(&[
            ("ipAddress", ip.as_str()),
            ("maxAgeInDays", "90"),
            ("verbose", "true"),
        ])
        .header("Key", api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("AbuseIPDB request failed: {}", e))?;

    let status = resp.status();
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;
    if !status.is_success() {
        return Err(format!("AbuseIPDB HTTP {}: {}", status, json));
    }
    Ok(json)
}

#[tauri::command]
async fn inspect_ssl(host: String) -> Result<String, String> {
    validate_host(&host)?;

    #[cfg(target_os = "windows")]
    {
        let ps_cmd = format!(
            "$t = New-Object Net.Sockets.TcpClient('{}', 443); $s = New-Object Net.Security.SslStream($t.GetStream(), $false, ({{$true}} -as [Net.Security.RemoteCertificateValidationCallback])); $s.AuthenticateAsClient('{}'); $c = $s.RemoteCertificate; 'SUBJECT=' + $c.Subject; 'ISSUER=' + $c.Issuer; 'NOTAFTER=' + $c.GetExpirationDateString(); 'SERIAL=' + $c.GetSerialNumberString(); 'SIGALG=' + $c.GetKeyAlgorithm(); $t.Close()",
            host, host
        );
        run_cmd_timeout("powershell", &["-NoProfile", "-NonInteractive", "-Command", &ps_cmd], 15).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let target = format!("{}:443", host);
        let sh_cmd = format!(
            "openssl s_client -connect {} -servername {} </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates -serial",
            target, host
        );
        run_cmd_timeout("sh", &["-c", &sh_cmd], 15).await
    }
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn close_os_app_by_name(state: State<AppState>, name: String) -> Result<String, String> {
    let query = name.trim().to_lowercase();
    if query.is_empty() {
        return Err("Имя приложения не указано".into());
    }

    // Build alias list for common Windows applications (e.g. UWP Calculator)
    let mut search_terms = vec![query.clone()];
    if query.contains("calc") || query.contains("кальк") {
        search_terms.push("calculatorapp".to_string());
        search_terms.push("calculator".to_string());
        search_terms.push("calc.exe".to_string());
        search_terms.push("win32calc".to_string());
    } else if query.contains("notepad") || query.contains("блокнот") {
        search_terms.push("notepad.exe".to_string());
        search_terms.push("notepad".to_string());
    } else if query.contains("chrome") || query.contains("хром") {
        search_terms.push("chrome.exe".to_string());
    } else if query.contains("paint") || query.contains("паинт") {
        search_terms.push("mspaint.exe".to_string());
        search_terms.push("mspaint".to_string());
    } else if query.contains("taskmgr") || query.contains("диспетчер") {
        search_terms.push("taskmgr.exe".to_string());
    }

    let mut sys = state.system.lock().unwrap();
    sys.refresh_processes();

    let mut matches: Vec<(sysinfo::Pid, String)> = Vec::new();
    for (pid, p) in sys.processes() {
        let p_name_lower = p.name().to_lowercase();
        if search_terms.iter().any(|term| p_name_lower.contains(term)) {
            matches.push((*pid, p.name().to_string()));
        }
    }

    let mut closed = Vec::new();

    // 1. Terminate matching PIDs via sysinfo and taskkill
    for (pid, proc_name) in &matches {
        if pid.as_u32() <= 4 {
            continue;
        }
        let mut killed = false;
        if let Some(process) = sys.process(*pid) {
            killed = process.kill_with(Signal::Kill).unwrap_or(false) || process.kill();
        }

        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let status = Command::new("taskkill")
                .args(&["/F", "/PID", &pid.as_u32().to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            if let Ok(s) = status {
                if s.success() {
                    killed = true;
                }
            }
        }

        if killed {
            closed.push(proc_name.clone());
            println!("[AUDIT] Closed by name: {} (PID {})", proc_name, pid.as_u32());
        }
    }

    // 2. Fallback: on Windows, directly attempt taskkill /F /T /IM for each search term
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        for term in &search_terms {
            let im_name = if term.ends_with(".exe") {
                term.clone()
            } else {
                format!("{}.exe", term)
            };
            let status = Command::new("taskkill")
                .args(&["/F", "/T", "/IM", &im_name])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            if let Ok(s) = status {
                if s.success() && !closed.contains(&im_name) {
                    closed.push(im_name);
                }
            }
        }
    }

    if closed.is_empty() {
        if matches.is_empty() {
            Err(format!("Процесс '{}' не найден среди запущенных.", name))
        } else {
            Err(format!("Не удалось закрыть '{}' — отказано в доступе.", name))
        }
    } else {
        Ok(format!("Закрыто: {}", closed.join(", ")))
    }
}

#[tauri::command]
async fn schedule_close_app(
    app_handle: tauri::AppHandle,
    scheduler: State<'_, SchedulerState>,
    app_name: String,
    delay_seconds: u64,
) -> Result<ScheduledClose, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let fires_at_ms = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64)
        + delay_seconds * 1000;
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
    Ok(ScheduledClose {
        id,
        app_name,
        fires_at_ms,
    })
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

#[tauri::command]
fn set_tray_icon(app: tauri::AppHandle, active: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_path = if active {
            "icons/tray-listening.png"
        } else {
            "icons/tray-idle.png"
        };
        if let Ok(img) = tauri::image::Image::from_path(icon_path) {
            let _ = tray.set_icon(Some(img));
        }
    }
    let _ = active;
    Ok(())
}

#[cfg(target_os = "windows")]
mod win_net {
    use std::ffi::c_void;

    pub const AF_INET: u32 = 2;
    pub const AF_INET6: u32 = 23;
    pub const TCP_TABLE_OWNER_PID_ALL: i32 = 5;
    pub const MIB_TCP_STATE_ESTAB: u32 = 5;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MIB_TCPROW_OWNER_PID {
        pub dw_state: u32,
        pub dw_local_addr: u32,
        pub dw_local_port: u32,
        pub dw_remote_addr: u32,
        pub dw_remote_port: u32,
        pub dw_owning_pid: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MIB_TCP6ROW_OWNER_PID {
        pub uc_local_addr: [u8; 16],
        pub dw_local_scope_id: u32,
        pub dw_local_port: u32,
        pub uc_remote_addr: [u8; 16],
        pub dw_remote_scope_id: u32,
        pub dw_remote_port: u32,
        pub dw_state: u32,
        pub dw_owning_pid: u32,
    }

    #[repr(C)]
    pub struct TCP_ESTATS_DATA_RW_v0 {
        pub enable_collection: u8,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct TCP_ESTATS_DATA_ROD_v0 {
        pub data_bytes_out: u64,
        pub data_segs_out: u64,
        pub data_bytes_in: u64,
        pub data_segs_in: u64,
        pub segs_out: u64,
        pub segs_in: u64,
        pub soft_errors: u32,
        pub soft_error_reason: u32,
    }

    pub const UDP_TABLE_OWNER_PID: i32 = 1;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MIB_UDPROW_OWNER_PID {
        pub dw_local_addr: u32,
        pub dw_local_port: u32,
        pub dw_owning_pid: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    #[allow(dead_code)]
    pub struct MIB_UDP6ROW_OWNER_PID {
        pub uc_local_addr: [u8; 16],
        pub dw_local_scope_id: u32,
        pub dw_local_port: u32,
        pub dw_owning_pid: u32,
    }

    #[link(name = "iphlpapi")]
    extern "system" {
        pub fn GetExtendedTcpTable(
            p_tcp_table: *mut c_void,
            pdw_size: *mut u32,
            b_order: i32,
            ul_af: u32,
            table_class: i32,
            reserved: u32,
        ) -> u32;

        pub fn GetExtendedUdpTable(
            p_udp_table: *mut c_void,
            pdw_size: *mut u32,
            b_order: i32,
            ul_af: u32,
            table_class: i32,
            reserved: u32,
        ) -> u32;

        pub fn SetPerTcpConnectionEStats(
            row: *const c_void,
            estats_type: i32,
            rw: *const c_void,
            rw_version: u32,
            rw_size: u32,
            offset: u32,
        ) -> u32;

        pub fn GetPerTcpConnectionEStats(
            row: *const c_void,
            estats_type: i32,
            rw: *mut c_void,
            rw_version: u32,
            rw_size: u32,
            ros: *mut c_void,
            ros_version: u32,
            ros_size: u32,
            rod: *mut c_void,
            rod_version: u32,
            rod_size: u32,
        ) -> u32;
    }
}

#[tauri::command]
async fn get_network_connections_by_process(
    state: State<'_, AppState>,
) -> Result<Vec<ProcessConnectionInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut pid_map: HashMap<u32, (usize, usize, Vec<String>)> = HashMap::new();
        let mut pid_traffic: HashMap<u32, (u64, u64)> = HashMap::new();

        // 1. IPv4 TCP Connections
        let mut size_v4 = 0u32;
        unsafe {
            win_net::GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut size_v4,
                1,
                win_net::AF_INET,
                win_net::TCP_TABLE_OWNER_PID_ALL,
                0,
            );
        }
        if size_v4 > 0 {
            let mut buf_v4 = vec![0u8; size_v4 as usize];
            let ret = unsafe {
                win_net::GetExtendedTcpTable(
                    buf_v4.as_mut_ptr() as *mut std::ffi::c_void,
                    &mut size_v4,
                    1,
                    win_net::AF_INET,
                    win_net::TCP_TABLE_OWNER_PID_ALL,
                    0,
                )
            };
            if ret == 0 && buf_v4.len() >= std::mem::size_of::<u32>() {
                let num_entries = unsafe { *(buf_v4.as_ptr() as *const u32) };
                let row_size = std::mem::size_of::<win_net::MIB_TCPROW_OWNER_PID>();
                let rows_ptr = unsafe {
                    buf_v4
                        .as_ptr()
                        .add(std::mem::size_of::<u32>()) as *const win_net::MIB_TCPROW_OWNER_PID
                };
                for i in 0..num_entries as usize {
                    if (i + 1) * row_size + std::mem::size_of::<u32>() <= buf_v4.len() {
                        let row = unsafe { *rows_ptr.add(i) };
                        let pid = row.dw_owning_pid;
                        let entry = pid_map.entry(pid).or_insert((0, 0, Vec::new()));
                        entry.0 += 1;

                        if row.dw_state == win_net::MIB_TCP_STATE_ESTAB {
                            entry.1 += 1;

                            let rw = win_net::TCP_ESTATS_DATA_RW_v0 { enable_collection: 1 };
                            unsafe {
                                win_net::SetPerTcpConnectionEStats(
                                    &row as *const _ as *const std::ffi::c_void,
                                    0, // TcpConnectionEstatsData
                                    &rw as *const _ as *const std::ffi::c_void,
                                    0,
                                    std::mem::size_of::<win_net::TCP_ESTATS_DATA_RW_v0>() as u32,
                                    0,
                                );
                                let mut rod = win_net::TCP_ESTATS_DATA_ROD_v0::default();
                                let get_res = win_net::GetPerTcpConnectionEStats(
                                    &row as *const _ as *const std::ffi::c_void,
                                    0,
                                    std::ptr::null_mut(),
                                    0,
                                    0,
                                    std::ptr::null_mut(),
                                    0,
                                    0,
                                    &mut rod as *mut _ as *mut std::ffi::c_void,
                                    0,
                                    std::mem::size_of::<win_net::TCP_ESTATS_DATA_ROD_v0>() as u32,
                                );
                                if get_res == 0 {
                                    let t = pid_traffic.entry(pid).or_insert((0, 0));
                                    t.0 = t.0.saturating_add(rod.data_bytes_in);
                                    t.1 = t.1.saturating_add(rod.data_bytes_out);
                                }
                            }
                        }

                        if row.dw_remote_addr != 0 && entry.2.len() < 5 {
                            let remote_ip = std::net::Ipv4Addr::from(row.dw_remote_addr.to_ne_bytes());
                            let remote_port = u16::from_be((row.dw_remote_port & 0xffff) as u16);
                            let ep = format!("{}:{}", remote_ip, remote_port);
                            if !entry.2.contains(&ep) {
                                entry.2.push(ep);
                            }
                        }
                    }
                }
            }
        }

        // 2. IPv6 TCP Connections
        let mut size_v6 = 0u32;
        unsafe {
            win_net::GetExtendedTcpTable(
                std::ptr::null_mut(),
                &mut size_v6,
                1,
                win_net::AF_INET6,
                win_net::TCP_TABLE_OWNER_PID_ALL,
                0,
            );
        }
        if size_v6 > 0 {
            let mut buf_v6 = vec![0u8; size_v6 as usize];
            let ret = unsafe {
                win_net::GetExtendedTcpTable(
                    buf_v6.as_mut_ptr() as *mut std::ffi::c_void,
                    &mut size_v6,
                    1,
                    win_net::AF_INET6,
                    win_net::TCP_TABLE_OWNER_PID_ALL,
                    0,
                )
            };
            if ret == 0 && buf_v6.len() >= std::mem::size_of::<u32>() {
                let num_entries = unsafe { *(buf_v6.as_ptr() as *const u32) };
                let row_size = std::mem::size_of::<win_net::MIB_TCP6ROW_OWNER_PID>();
                let rows_ptr = unsafe {
                    buf_v6
                        .as_ptr()
                        .add(std::mem::size_of::<u32>()) as *const win_net::MIB_TCP6ROW_OWNER_PID
                };
                for i in 0..num_entries as usize {
                    if (i + 1) * row_size + std::mem::size_of::<u32>() <= buf_v6.len() {
                        let row = unsafe { *rows_ptr.add(i) };
                        let pid = row.dw_owning_pid;
                        let entry = pid_map.entry(pid).or_insert((0, 0, Vec::new()));
                        entry.0 += 1;

                        if row.dw_state == win_net::MIB_TCP_STATE_ESTAB {
                            entry.1 += 1;

                            let rw = win_net::TCP_ESTATS_DATA_RW_v0 { enable_collection: 1 };
                            unsafe {
                                win_net::SetPerTcpConnectionEStats(
                                    &row as *const _ as *const std::ffi::c_void,
                                    0,
                                    &rw as *const _ as *const std::ffi::c_void,
                                    0,
                                    std::mem::size_of::<win_net::TCP_ESTATS_DATA_RW_v0>() as u32,
                                    0,
                                );
                                let mut rod = win_net::TCP_ESTATS_DATA_ROD_v0::default();
                                let get_res = win_net::GetPerTcpConnectionEStats(
                                    &row as *const _ as *const std::ffi::c_void,
                                    0,
                                    std::ptr::null_mut(),
                                    0,
                                    0,
                                    std::ptr::null_mut(),
                                    0,
                                    0,
                                    &mut rod as *mut _ as *mut std::ffi::c_void,
                                    0,
                                    std::mem::size_of::<win_net::TCP_ESTATS_DATA_ROD_v0>() as u32,
                                );
                                if get_res == 0 {
                                    let t = pid_traffic.entry(pid).or_insert((0, 0));
                                    t.0 = t.0.saturating_add(rod.data_bytes_in);
                                    t.1 = t.1.saturating_add(rod.data_bytes_out);
                                }
                            }
                        }

                        let is_all_zero = row.uc_remote_addr.iter().all(|&b| b == 0);
                        if !is_all_zero && entry.2.len() < 5 {
                            let remote_ip = std::net::Ipv6Addr::from(row.uc_remote_addr);
                            let remote_port = u16::from_be((row.dw_remote_port & 0xffff) as u16);
                            let ep = format!("[{}]:{}", remote_ip, remote_port);
                            if !entry.2.contains(&ep) {
                                entry.2.push(ep);
                            }
                        }
                    }
                }
            }
        }

        // 3. IPv4 UDP Endpoints (captures QUIC / HTTP3 Chrome traffic)
        let mut size_udp4 = 0u32;
        unsafe {
            win_net::GetExtendedUdpTable(
                std::ptr::null_mut(),
                &mut size_udp4,
                1,
                win_net::AF_INET,
                win_net::UDP_TABLE_OWNER_PID,
                0,
            );
        }
        if size_udp4 > 0 {
            let mut buf_udp4 = vec![0u8; size_udp4 as usize];
            let ret = unsafe {
                win_net::GetExtendedUdpTable(
                    buf_udp4.as_mut_ptr() as *mut std::ffi::c_void,
                    &mut size_udp4,
                    1,
                    win_net::AF_INET,
                    win_net::UDP_TABLE_OWNER_PID,
                    0,
                )
            };
            if ret == 0 && buf_udp4.len() >= std::mem::size_of::<u32>() {
                let num_entries = unsafe { *(buf_udp4.as_ptr() as *const u32) };
                let row_size = std::mem::size_of::<win_net::MIB_UDPROW_OWNER_PID>();
                let rows_ptr = unsafe {
                    buf_udp4
                        .as_ptr()
                        .add(std::mem::size_of::<u32>()) as *const win_net::MIB_UDPROW_OWNER_PID
                };
                for i in 0..num_entries as usize {
                    if (i + 1) * row_size + std::mem::size_of::<u32>() <= buf_udp4.len() {
                        let row = unsafe { *rows_ptr.add(i) };
                        let pid = row.dw_owning_pid;
                        let entry = pid_map.entry(pid).or_insert((0, 0, Vec::new()));
                        entry.0 += 1;
                        if row.dw_local_port != 0 && entry.2.len() < 5 {
                            let port = u16::from_be((row.dw_local_port & 0xffff) as u16);
                            let ep = format!("UDP:{}", port);
                            if !entry.2.contains(&ep) {
                                entry.2.push(ep);
                            }
                        }
                    }
                }
            }
        }

        let mut sys = state.system.lock().unwrap();
        sys.refresh_processes_specifics(sysinfo::ProcessRefreshKind::everything());

        let mut prev_net = state.prev_process_network.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(prev_net.timestamp).as_secs_f64().max(0.5);
        let mut new_net_map: HashMap<u32, (u64, u64)> = HashMap::new();

        let mut result: Vec<ProcessConnectionInfo> = pid_map
            .into_iter()
            .map(|(pid, (total, established, remotes))| {
                let proc_handle = sys.process(sysinfo::Pid::from(pid as usize));
                let proc_name = proc_handle
                    .map(|p| p.name().to_string())
                    .unwrap_or_else(|| format!("PID {}", pid));

                let (current_in, current_out) = if let Some(&traffic) = pid_traffic.get(&pid) {
                    if traffic.0 > 0 || traffic.1 > 0 {
                        traffic
                    } else if let Some(p) = proc_handle {
                        let du = p.disk_usage();
                        (du.total_read_bytes, du.total_written_bytes)
                    } else {
                        (0, 0)
                    }
                } else if let Some(p) = proc_handle {
                    let du = p.disk_usage();
                    (du.total_read_bytes, du.total_written_bytes)
                } else {
                    (0, 0)
                };
                new_net_map.insert(pid, (current_in, current_out));

                let du_read = proc_handle.map(|p| p.disk_usage().read_bytes).unwrap_or(0);
                let du_write = proc_handle.map(|p| p.disk_usage().written_bytes).unwrap_or(0);

                let (mut rx_rate, mut tx_rate) = if let Some(&(prev_in, prev_out)) = prev_net.entries.get(&pid) {
                    let dr = current_in.saturating_sub(prev_in);
                    let dw = current_out.saturating_sub(prev_out);
                    (
                        (dr as f64 / elapsed).round() as u64,
                        (dw as f64 / elapsed).round() as u64,
                    )
                } else {
                    (0, 0)
                };

                if rx_rate == 0 && du_read > 0 {
                    rx_rate = (du_read as f64 / elapsed).round() as u64;
                }
                if tx_rate == 0 && du_write > 0 {
                    tx_rate = (du_write as f64 / elapsed).round() as u64;
                }

                ProcessConnectionInfo {
                    pid,
                    name: proc_name,
                    connection_count: total,
                    established_count: established,
                    remote_endpoints: remotes,
                    rx_bytes_per_sec: rx_rate,
                    tx_bytes_per_sec: tx_rate,
                    io_read_bytes_per_sec: rx_rate,
                    io_write_bytes_per_sec: tx_rate,
                }
            })
            .collect();

        prev_net.timestamp = now;
        prev_net.entries = new_net_map;

        result.sort_by(|a, b| {
            let a_total = a.rx_bytes_per_sec + a.tx_bytes_per_sec;
            let b_total = b.rx_bytes_per_sec + b.tx_bytes_per_sec;
            b_total.cmp(&a_total).then(b.connection_count.cmp(&a.connection_count))
        });
        Ok(result)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        Ok(vec![])
    }
}

// Argument parsers for terminal commands
// ─────────────────────────────────────────────────────────────────────────────

fn parse_ping_args<'a>(args: &'a [&'a str]) -> (Option<u32>, Option<&'a str>) {
    let mut count: Option<u32> = None;
    let mut host: Option<&str> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i] {
            "-n" | "-c" => {
                if let Some(v) = args.get(i + 1) {
                    count = v.parse().ok();
                    i += 2;
                    continue;
                }
            }
            _ => {
                if host.is_none() {
                    host = Some(args[i]);
                }
            }
        }
        i += 1;
    }
    (count, host)
}

fn parse_tracert_args<'a>(args: &'a [&'a str]) -> (Option<u32>, bool, Option<&'a str>) {
    let mut max_hops: Option<u32> = None;
    let mut no_dns = false;
    let mut host: Option<&str> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i] {
            "-d" | "-n" => {
                no_dns = true;
            }
            "-h" | "-m" => {
                if let Some(v) = args.get(i + 1) {
                    max_hops = v.parse().ok();
                    i += 2;
                    continue;
                }
            }
            _ => {
                if host.is_none() {
                    host = Some(args[i]);
                }
            }
        }
        i += 1;
    }
    (max_hops, no_dns, host)
}

// ─────────────────────────────────────────────────────────────────────────────
// Part A — API Key Encryption Commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn encrypt_secret(plaintext: String) -> Result<String, String> {
    use base64::Engine;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derive_key()));
    let nonce_bytes: [u8; 12] = rand::random();
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(combined))
}

#[tauri::command]
fn decrypt_secret(ciphertext_b64: Option<String>, ciphertext: Option<String>) -> Result<String, String> {
    use base64::Engine;
    let raw = ciphertext_b64
        .or(ciphertext)
        .ok_or_else(|| "Missing ciphertext".to_string())?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derive_key()));
    let combined = base64::engine::general_purpose::STANDARD
        .decode(&raw)
        .map_err(|e| e.to_string())?;
    if combined.len() < 12 {
        return Err("Invalid encrypted data".into());
    }
    let (nonce_bytes, ciphertext_slice) = combined.split_at(12);
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext_slice)
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Part L — PTY Terminal Commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn create_terminal_session(
    app: tauri::AppHandle,
    state: State<TerminalState>,
    session_id: String,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.cwd(dirs::home_dir().unwrap_or_default());
    pair.slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let sid = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = app_clone.emit(
                        &format!("terminal:output:{}", sid),
                        String::from_utf8_lossy(&buf[..n]).to_string(),
                    );
                }
                Err(_) => break,
            }
        }
    });

    state.sessions.lock().unwrap().insert(
        session_id,
        PtySession {
            writer,
            master: pair.master,
        },
    );
    Ok(())
}

#[tauri::command]
fn write_to_terminal(
    state: State<TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    sessions
        .get_mut(&session_id)
        .ok_or("Session not found".to_string())?
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_terminal(
    state: State<TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    use portable_pty::PtySize;
    let sessions = state.sessions.lock().unwrap();
    sessions
        .get(&session_id)
        .ok_or("Session not found".to_string())?
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Part N — Disk Analyzer Commands
// ─────────────────────────────────────────────────────────────────────────────

fn dir_size_shallow_estimate(path: &std::path::Path) -> u64 {
    std::fs::read_dir(path)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| e.metadata().ok())
                .map(|m| if m.is_file() { m.len() } else { 4096 })
                .sum()
        })
        .unwrap_or(0)
}

#[tauri::command]
async fn scan_directory_sizes(path: String) -> Result<Vec<DirNode>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let size = if meta.is_dir() {
            dir_size_shallow_estimate(&entry.path())
        } else {
            meta.len()
        };
        nodes.push(DirNode {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            size,
            is_dir: meta.is_dir(),
            children_scanned: false,
        });
    }
    nodes.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(nodes)
}

// ─────────────────────────────────────────────────────────────────────────────
// Part O — Duplicate File Finder Commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn find_duplicate_files(root: String) -> Result<Vec<DuplicateGroup>, String> {
    use std::collections::HashMap;
    use walkdir::WalkDir;
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
        let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
        for path in paths {
            if let Ok(bytes) = std::fs::read(&path) {
                let hash = blake3::hash(&bytes).to_hex().to_string();
                by_hash
                    .entry(hash)
                    .or_default()
                    .push(path.to_string_lossy().to_string());
            }
        }
        for (hash, group_paths) in by_hash {
            if group_paths.len() > 1 {
                groups.push(DuplicateGroup {
                    hash,
                    size,
                    paths: group_paths,
                });
            }
        }
    }
    groups.sort_by(|a, b| {
        (b.size * b.paths.len() as u64).cmp(&(a.size * a.paths.len() as u64))
    });
    Ok(groups)
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Part P — Startup Manager Commands
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn is_startup_enabled(hive: winreg::HKEY, name: &str) -> bool {
    use winreg::RegKey;
    RegKey::predef(hive)
        .open_subkey(
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
        )
        .and_then(|k| k.get_raw_value(name))
        .map(|v| v.bytes.first().copied().unwrap_or(2) != 3)
        .unwrap_or(true)
}

#[tauri::command]
fn list_startup_entries() -> Result<Vec<StartupEntry>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let mut entries = Vec::new();
        for (hive, hive_name) in [(HKEY_CURRENT_USER, "HKCU"), (HKEY_LOCAL_MACHINE, "HKLM")] {
            if let Ok(run_key) = RegKey::predef(hive).open_subkey(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            ) {
                for (val_name, val) in run_key.enum_values().flatten() {
                    let enabled = is_startup_enabled(hive, &val_name);
                    entries.push(StartupEntry {
                        name: val_name,
                        command: val.to_string(),
                        location: hive_name.into(),
                        enabled,
                    });
                }
            }
        }
        Ok(entries)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
fn toggle_startup_entry(
    hive_name: String,
    name: String,
    enable: bool,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::{RegKey, RegValue};
        let hive = if hive_name == "HKLM" {
            HKEY_LOCAL_MACHINE
        } else {
            HKEY_CURRENT_USER
        };
        let key = RegKey::predef(hive)
            .open_subkey_with_flags(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
                KEY_SET_VALUE,
            )
            .map_err(|e| e.to_string())?;
        let flag: u8 = if enable { 0x02 } else { 0x03 };
        let data = vec![flag, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        key.set_raw_value(
            &name,
            &RegValue {
                bytes: data,
                vtype: REG_BINARY,
            },
        )
        .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hive_name, name, enable);
        Err("Startup manager is Windows-only".into())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Part K — File Name & Content Search (Поисковик)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ContentSearchMatch {
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub size: u64,
    pub line_number: usize,
    pub snippet: String,
}

#[tauri::command]
async fn search_files_by_name(
    query: String,
    root: String,
    extension_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        use walkdir::WalkDir;
        let q = query.to_lowercase();
        let max = limit.unwrap_or(250);
        let results: Vec<FileEntry> = WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_lowercase();
                name.contains(&q)
            })
            .filter(|e| {
                if let Some(ref ext_filter) = extension_filter {
                    e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .map(|x| x.eq_ignore_ascii_case(ext_filter))
                        .unwrap_or(false)
                } else {
                    true
                }
            })
            .take(max)
            .map(|e| {
                let meta = e.metadata();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                let extension = e
                    .path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                FileEntry {
                    name: e.file_name().to_string_lossy().to_string(),
                    path: e.path().to_string_lossy().to_string(),
                    size,
                    is_dir,
                    extension,
                }
            })
            .collect();
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Document & Office Text Extractors (PDF, DOCX, XLSX, PPTX, ODT) ──────────

fn strip_xml_to_text(xml: &str, paragraph_tag: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let mut in_tag = false;
    let mut current_tag = String::new();

    for c in xml.chars() {
        if c == '<' {
            in_tag = true;
            current_tag.clear();
        } else if c == '>' {
            in_tag = false;
            let tag_lower = current_tag.to_lowercase();
            if tag_lower.starts_with(paragraph_tag)
                || tag_lower.starts_with(&format!("/{}", paragraph_tag))
                || tag_lower.contains("br")
                || tag_lower.starts_with("w:tab")
            {
                out.push('\n');
            } else {
                out.push(' ');
            }
        } else if in_tag {
            current_tag.push(c);
        } else {
            out.push(c);
        }
    }

    out.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
}

fn extract_text_from_docx(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut full_text = String::new();

    if let Ok(mut item) = archive.by_name("word/document.xml") {
        let mut content = String::new();
        use std::io::Read;
        if item.read_to_string(&mut content).is_ok() {
            full_text.push_str(&strip_xml_to_text(&content, "w:p"));
        }
    }

    if let Ok(mut item) = archive.by_name("word/footnotes.xml") {
        let mut content = String::new();
        use std::io::Read;
        if item.read_to_string(&mut content).is_ok() {
            full_text.push('\n');
            full_text.push_str(&strip_xml_to_text(&content, "w:p"));
        }
    }

    if full_text.trim().is_empty() {
        None
    } else {
        Some(full_text)
    }
}

fn extract_text_from_xlsx(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut full_text = String::new();

    // Excel sharedStrings.xml holds text strings
    if let Ok(mut item) = archive.by_name("xl/sharedStrings.xml") {
        let mut content = String::new();
        use std::io::Read;
        if item.read_to_string(&mut content).is_ok() {
            full_text.push_str(&strip_xml_to_text(&content, "si"));
        }
    }

    // Worksheets
    let mut sheet_names = Vec::new();
    for i in 0..archive.len() {
        if let Ok(f) = archive.by_index(i) {
            let name = f.name().to_string();
            if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                sheet_names.push(name);
            }
        }
    }
    for sheet_name in sheet_names {
        if let Ok(mut sheet_file) = archive.by_name(&sheet_name) {
            let mut content = String::new();
            use std::io::Read;
            if sheet_file.read_to_string(&mut content).is_ok() {
                full_text.push('\n');
                full_text.push_str(&strip_xml_to_text(&content, "row"));
            }
        }
    }

    if full_text.trim().is_empty() {
        None
    } else {
        Some(full_text)
    }
}

fn extract_text_from_pptx(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut full_text = String::new();

    let mut slide_names = Vec::new();
    for i in 0..archive.len() {
        if let Ok(f) = archive.by_index(i) {
            let name = f.name().to_string();
            if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
                slide_names.push(name);
            }
        }
    }
    slide_names.sort();

    for slide_name in slide_names {
        if let Ok(mut slide_file) = archive.by_name(&slide_name) {
            let mut content = String::new();
            use std::io::Read;
            if slide_file.read_to_string(&mut content).is_ok() {
                full_text.push('\n');
                full_text.push_str(&strip_xml_to_text(&content, "a:p"));
            }
        }
    }

    if full_text.trim().is_empty() {
        None
    } else {
        Some(full_text)
    }
}

fn extract_text_from_opendocument(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    if let Ok(mut item) = archive.by_name("content.xml") {
        let mut content = String::new();
        use std::io::Read;
        if item.read_to_string(&mut content).is_ok() {
            let res = strip_xml_to_text(&content, "text:p");
            if !res.trim().is_empty() {
                return Some(res);
            }
        }
    }
    None
}

fn extract_text_from_pdf(path: &std::path::Path) -> Option<String> {
    pdf_extract::extract_text(path).ok()
}

#[tauri::command]
async fn search_files_by_content(
    query: String,
    root: String,
    extension_filter: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ContentSearchMatch>, String> {
    let q = query.to_lowercase();
    let max = limit.unwrap_or(120);

    tokio::task::spawn_blocking(move || {
        use std::fs::File;
        use std::io::{BufRead, BufReader};
        use walkdir::WalkDir;

        let mut matches = Vec::new();
        let text_extensions = [
            "txt", "md", "log", "json", "csv", "xml", "yaml", "yml", "ts", "tsx", "js", "jsx",
            "py", "rs", "html", "css", "scss", "sql", "sh", "bat", "ps1", "ini", "conf", "env",
            "toml", "c", "cpp", "h", "java", "cs",
        ];
        let doc_extensions = ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp"];

        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if matches.len() >= max {
                break;
            }

            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let path_str = path.to_string_lossy();
            if path_str.contains(".git")
                || path_str.contains("node_modules")
                || path_str.contains("target")
            {
                continue;
            }

            let ext = path
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_lowercase();

            let is_text = text_extensions.contains(&ext.as_str());
            let is_doc = doc_extensions.contains(&ext.as_str());

            if let Some(ref filter) = extension_filter {
                if !ext.eq_ignore_ascii_case(filter) {
                    continue;
                }
            } else if !is_text && !is_doc {
                continue;
            }

            if let Ok(meta) = entry.metadata() {
                let size = meta.len();
                if size == 0 {
                    continue;
                }

                // Office & PDF processing
                if is_doc {
                    if size > 25 * 1024 * 1024 {
                        continue;
                    }
                    let text_opt = match ext.as_str() {
                        "pdf" => extract_text_from_pdf(path),
                        "docx" => extract_text_from_docx(path),
                        "xlsx" => extract_text_from_xlsx(path),
                        "pptx" => extract_text_from_pptx(path),
                        "odt" | "ods" | "odp" => extract_text_from_opendocument(path),
                        _ => None,
                    };

                    if let Some(text) = text_opt {
                        for (idx, line) in text.lines().enumerate() {
                            if matches.len() >= max {
                                break;
                            }
                            if line.to_lowercase().contains(&q) {
                                let trimmed = line.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                let snippet = if trimmed.len() > 180 {
                                    format!("{}...", &trimmed[..180])
                                } else {
                                    trimmed.to_string()
                                };
                                matches.push(ContentSearchMatch {
                                    path: path_str.to_string(),
                                    filename: entry.file_name().to_string_lossy().to_string(),
                                    extension: ext.clone(),
                                    size,
                                    line_number: idx + 1,
                                    snippet,
                                });
                                break;
                            }
                        }
                    }
                } else if is_text {
                    // Plain text & source code files (up to 8 MB)
                    if size > 8 * 1024 * 1024 {
                        continue;
                    }

                    if let Ok(file) = File::open(path) {
                        let reader = BufReader::new(file);
                        for (idx, line_res) in reader.lines().enumerate() {
                            if matches.len() >= max {
                                break;
                            }
                            if let Ok(line) = line_res {
                                if line.to_lowercase().contains(&q) {
                                    let trimmed = line.trim();
                                    let snippet = if trimmed.len() > 180 {
                                        format!("{}...", &trimmed[..180])
                                    } else {
                                        trimmed.to_string()
                                    };
                                    matches.push(ContentSearchMatch {
                                        path: path_str.to_string(),
                                        filename: entry.file_name().to_string_lossy().to_string(),
                                        extension: ext.clone(),
                                        size,
                                        line_number: idx + 1,
                                        snippet,
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(matches)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_path_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
async fn open_file_externally(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .creation_flags(0x08000000)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// App entry point
// ─────────────────────────────────────────────────────────────────────────────

fn create_initial_registry() -> PhraseRegistry {
    let mut reg = PhraseRegistry::new();

    // Seed default skills
    let ping_phrases = vec![
        "пингани шлюз".to_string(),
        "проверь пинг до роутера".to_string(),
        "какой пинг".to_string(),
        "пинг".to_string(),
        "ping gateway".to_string(),
        "check latency".to_string(),
    ];
    for p in ping_phrases {
        let v = embed_text(&p);
        reg.insert_phrase("builtin-ping-gateway", p, v);
    }
    let mut ping_slots = HashMap::new();
    ping_slots.insert(
        "host".to_string(),
        SlotSchema {
            default: Some("192.168.1.1".to_string()),
            context_words: Some(vec!["до".to_string(), "to".to_string()]),
            pattern: Some("ip_or_hostname".to_string()),
        },
    );
    reg.register_slots("builtin-ping-gateway", ping_slots);

    let status_phrases = vec![
        "статус системы".to_string(),
        "как система".to_string(),
        "покажи состояние".to_string(),
        "что с железом".to_string(),
        "system status".to_string(),
        "show info".to_string(),
    ];
    for p in status_phrases {
        let v = embed_text(&p);
        reg.insert_phrase("builtin-system-status", p, v);
    }

    let proc_phrases = vec![
        "открой процессы".to_string(),
        "диспетчер задач".to_string(),
        "покажи процессы".to_string(),
        "запущенные программы".to_string(),
        "open processes".to_string(),
        "task manager".to_string(),
    ];
    for p in proc_phrases {
        let v = embed_text(&p);
        reg.insert_phrase("builtin-open-processes", p, v);
    }

    reg
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let net = Networks::new_with_refreshed_list();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            system: Mutex::new(System::new()),
            networks: Mutex::new(net),
            prev_network: Mutex::new(PrevNetworkSnapshot {
                timestamp: Instant::now(),
                interfaces: HashMap::new(),
            }),
            jarvis_registry: Mutex::new(create_initial_registry()),
            prev_process_network: Mutex::new(PrevProcessNetwork {
                timestamp: Instant::now(),
                entries: HashMap::new(),
            }),
        })
        .manage(SystemSnapshotState {
            latest: RwLock::new(SystemSnapshotState::default_snapshot()),
        })
        .manage(SchedulerState {
            timers: Mutex::new(HashMap::new()),
        })
        .manage(TerminalState {
            sessions: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                background_system_refresh_loop(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_network_stats,
            get_processes,
            kill_process,
            ping_host,
            dns_lookup,
            traceroute_host,
            run_terminal_command,
            jarvis_match_intent,
            jarvis_build_intent_index,
            jarvis_reindex_skill,
            jarvis_open_url,
            jarvis_open_system_app,
            jarvis_lock_screen,
            jarvis_llm_request,
            jarvis_find_app,
            jarvis_launch_registered_app,
            scan_ports,
            send_wol_packet,
            lookup_ip_intel,
            inspect_ssl,
            close_os_app_by_name,
            schedule_close_app,
            cancel_scheduled_close,
            set_tray_icon,
            get_network_connections_by_process,
            // Part A: Encryption
            encrypt_secret,
            decrypt_secret,
            // Part L: PTY Terminal
            create_terminal_session,
            write_to_terminal,
            resize_terminal,
            // Part N: Disk Analyzer
            scan_directory_sizes,
            // Part O: Duplicate Finder
            find_duplicate_files,
            delete_file,
            // Part P: Startup Manager
            list_startup_entries,
            toggle_startup_entry,
            // Part K: File Explorer / Search Engine
            search_files_by_name,
            search_files_by_content,
            open_path_in_explorer,
            open_file_externally,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
