use serde::Serialize;
use sysinfo::{System, Disks, Networks};

#[derive(Serialize)]
pub struct SystemInfo {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub cpu_usage: f32,
    pub total_memory: u64,
    pub used_memory: u64,
    pub total_swap: u64,
    pub used_swap: u64,
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
    pub total: u64,
    pub used: u64,
}

#[derive(Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory: u64,
    pub status: String,
    pub user: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_info = sys.global_cpu_info();
    let disks = Disks::new_with_refreshed_list();
    let disk_info: Vec<DiskInfo> = disks.iter().map(|d| DiskInfo {
        name: d.name().to_string_lossy().to_string(),
        mount: d.mount_point().to_string_lossy().to_string(),
        total: d.total_space(),
        used: d.total_space() - d.available_space(),
    }).collect();

    let networks = Networks::new_with_refreshed_list();
    let net_interfaces: Vec<String> = networks.iter().map(|(name, _)| name.clone()).collect();

    SystemInfo {
        cpu_name: cpu_info.brand().to_string(),
        cpu_cores: sys.cpus().len(),
        cpu_usage: cpu_info.cpu_usage(),
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        total_swap: sys.total_swap(),
        used_swap: sys.used_swap(),
        os_name: System::name().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_default(),
        uptime: System::uptime(),
        disks: disk_info,
        network_interfaces: net_interfaces,
    }
}

#[tauri::command]
fn get_processes() -> Vec<ProcessInfo> {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.refresh_processes();

    sys.processes().iter().map(|(_, process)| {
        ProcessInfo {
            pid: process.pid().as_u32(),
            name: process.name().to_string(),
            cpu_usage: process.cpu_usage(),
            memory: process.memory(),
            status: format!("{:?}", process.status()),
            user: process.user_id().map(|uid| format!("{:?}", uid)).unwrap_or_default(),
        }
    }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_processes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}