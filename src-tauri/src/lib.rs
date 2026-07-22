//! LinkSight backend core.
//!
//! Layered architecture:
//!   - `network`  — ping / traceroute / scan / bandwidth (shared result schema)
//!   - `ssh`      — session manager & remote executor (Advanced Mode)
//!   - `system`   — host interface / routing introspection
//!   - `db`       — SQLite result storage
//!   - `agent`    — future LinkSight Agent abstraction
//!   - `commands` — Tauri RPC surface exposed to the frontend

pub mod agent;
pub mod commands;
pub mod db;
pub mod error;
pub mod fs;
pub mod network;
pub mod ssh;
pub mod system;

use db::Db;
use tauri::{include_image, Manager};

/// High-resolution window icon for the Linux taskbar / dock.
const WINDOW_ICON: tauri::image::Image<'static> = include_image!("icons/128x128.png");

/// Shared application state injected into Tauri commands.
pub struct AppState {
    pub db: Option<Db>,
}

/// Resolve the on-disk location for the local SQLite database.
fn database_path() -> String {
    // Prefer a stable per-user data dir; fall back to the working directory.
    if let Some(dir) = dirs_data_dir() {
        let app_dir = dir.join("linksight");
        let _ = std::fs::create_dir_all(&app_dir);
        return app_dir.join("linksight.db").to_string_lossy().to_string();
    }
    "linksight.db".to_string()
}

/// Minimal XDG data-dir resolution without pulling an extra dependency.
fn dirs_data_dir() -> Option<std::path::PathBuf> {
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            return Some(std::path::PathBuf::from(xdg));
        }
    }
    std::env::var("HOME")
        .ok()
        .map(|home| std::path::PathBuf::from(home).join(".local/share"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(WINDOW_ICON.clone());
            }

            // Create the SQLite pool on Tauri's async runtime so it stays valid
            // for the lifetime of the app (pools are bound to their runtime).
            let db_path = database_path();
            tracing::info!("Using database at {db_path}");
            let db = tauri::async_runtime::block_on(async {
                match Db::connect(&db_path).await {
                    Ok(db) => Some(db),
                    Err(e) => {
                        tracing::warn!(
                            "SQLite storage unavailable ({e}); running without persistence"
                        );
                        None
                    }
                }
            });
            app.manage(AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_ping,
            commands::run_scan,
            commands::run_traceroute,
            commands::run_speedtest,
            commands::cancel_network_test,
            commands::run_connectivity_test,
            commands::local_list_dir,
            commands::local_mkdir,
            commands::local_rename,
            commands::local_remove,
            commands::local_set_permissions,
            commands::sftp_list_dir,
            commands::sftp_mkdir,
            commands::sftp_rename,
            commands::sftp_remove,
            commands::sftp_set_permissions,
            commands::sftp_upload,
            commands::sftp_download,
            commands::list_network_interfaces,
            commands::list_docker_images,
            commands::get_docker_overview,
            commands::docker_stop_container,
            commands::docker_restart_container,
            commands::docker_remove_container,
            commands::docker_rename_image,
            commands::docker_remove_image,
            commands::list_hosts,
            commands::save_host,
            commands::delete_host,
            commands::verify_host,
            commands::validate_ssh_public_key,
            commands::validate_ssh_private_key,
            commands::persist_ssh_key_file,
            commands::read_local_key_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LinkSight");
}
