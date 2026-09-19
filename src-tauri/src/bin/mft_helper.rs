// src-tauri/src/bin/mft_helper.rs
// Elevated MFT scanner for Windows NTFS drives

use serde::Serialize;
use std::env;

#[derive(Serialize)]
struct FileEntryLine {
    path: String,
    size: u64,
    is_dir: bool,
}

fn main() {
    let drive: char = env::args()
        .nth(1)
        .and_then(|s| s.chars().next())
        .unwrap_or('C');

    #[cfg(target_os = "windows")]
    {
        use usn_journal_rs::volume::Volume;
        use usn_journal_rs::mft::Mft;
        use usn_journal_rs::path::PathResolver;

        let volume = match Volume::from_drive_letter(drive) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Error opening volume {}: {}", drive, e);
                return;
            }
        };

        let mft = Mft::new(&volume);
        let mut resolver = PathResolver::new_with_cache(&volume);

        for entry_res in mft.iter() {
            if let Ok(entry) = entry_res {
                if let Some(path_buf) = resolver.resolve_path(&entry) {
                    let path = path_buf.to_string_lossy().to_string();
                    let line = FileEntryLine {
                        path,
                        size: 0,
                        is_dir: entry.is_dir(),
                    };
                    if let Ok(json) = serde_json::to_string(&line) {
                        println!("{}", json);
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = drive;
        eprintln!("MFT is only supported on Windows");
    }
}
