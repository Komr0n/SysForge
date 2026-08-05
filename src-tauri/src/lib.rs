use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
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

struct AppState {
    system: Mutex<System>,
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
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_info(state: State<AppState>) -> SystemInfo {
    let mut sys = state.system.lock().unwrap();
    sys.refresh_cpu();
    sys.refresh_memory();

    let cpu_info = sys.global_cpu_info();

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

    let networks = Networks::new_with_refreshed_list();
    let net_interfaces: Vec<String> = networks.iter().map(|(name, _)| name.clone()).collect();

    SystemInfo {
        cpu_name: cpu_info.brand().to_string(),
        cpu_cores: sys.cpus().len(),
        cpu_usage: cpu_info.cpu_usage(),
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
            a.push("-d".to_string()); // -d = don't resolve hostnames (speeds up + no-frag alike)
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

    // Validate query type
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
            // nslookup <host> [type]
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
// Argument parsers for terminal commands
// ─────────────────────────────────────────────────────────────────────────────

/// Parse: ping [-n count] <host>
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

/// Parse: tracert [-d] [-h hops] <host>
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState {
            system: Mutex::new(System::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_processes,
            kill_process,
            ping_host,
            dns_lookup,
            traceroute_host,
            run_terminal_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
