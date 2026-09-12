pub mod jarvis;
pub mod voice;

use jarvis::intent::{embed_text, match_intent, IntentMatch, PhraseRegistry, SlotSchema};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, Signal, System};
use tauri::State;
use tokio::time::timeout;

// ─────────────────────────────────────────────────────────────────────────────
// Data structures
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
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

#[derive(Serialize)]
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

pub struct AppState {
    pub system: Mutex<System>,
    pub networks: Mutex<Networks>,
    pub prev_network: Mutex<PrevNetworkSnapshot>,
    pub jarvis_registry: Mutex<PhraseRegistry>,
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
fn get_system_info(state: State<AppState>) -> SystemInfo {
    let mut sys = state.system.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "CPU".to_string());
    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let cpus_usage: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();

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

    let net = state.networks.lock().unwrap();
    let net_interfaces: Vec<String> = net.iter().map(|(name, _)| name.clone()).collect();

    SystemInfo {
        cpu_name,
        cpu_cores: sys.cpus().len(),
        cpu_usage,
        cpus_usage,
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = client.post(&req.url).json(&req.body);
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, json));
    }
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

// ─────────────────────────────────────────────────────────────────────────────
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
        .manage(AppState {
            system: Mutex::new(System::new()),
            networks: Mutex::new(net),
            prev_network: Mutex::new(PrevNetworkSnapshot {
                timestamp: Instant::now(),
                interfaces: HashMap::new(),
            }),
            jarvis_registry: Mutex::new(create_initial_registry()),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
