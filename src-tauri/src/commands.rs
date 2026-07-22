//! Tauri command surface — the RPC boundary exposed to the React frontend.
//!
//! Commands are thin: they validate input, delegate to a backend module, and
//! (best-effort) persist the result. Every network command returns the shared
//! [`NetworkTestResult`] schema.

use tauri::State;

use crate::db::store::HostRecord;
use crate::error::LinkSightError;
use crate::fs::local as local_fs;
use crate::fs::types::FileListing;
use crate::network::connectivity::{
    self, ConnectivityProgress, ConnectivityResult, ConnectivitySettings,
};
use crate::network::model::NetworkTestResult;
use crate::network::ping;
use crate::network::scan::{self, ScanResult};
use crate::network::speedtest::{self, SpeedtestProgress, SpeedtestResult};
use crate::network::traceroute::{self, TracerouteResult};
use crate::ssh::exec::SshTarget;
use crate::ssh::keys::{PrivateKeyValidation, PublicKeyValidation};
use crate::ssh::sftp;
use crate::ssh::verify::{self, VerifyResult};
use crate::system::docker::{self, DockerImage, DockerOverview};
use crate::system::interface::{list_interfaces, InterfaceInfo};
use crate::AppState;

/// Fetch the DB handle or fail with a clear message (host storage requires it).
fn require_db(state: &State<'_, AppState>) -> Result<crate::db::store::Db, LinkSightError> {
    state
        .db
        .as_ref()
        .cloned()
        .ok_or_else(|| LinkSightError::CommandFailed("local database unavailable".into()))
}

/// Reference end-to-end command: run an ICMP ping and return the result.
#[tauri::command]
pub async fn run_ping(
    host: String,
    count: u32,
    state: State<'_, AppState>,
) -> Result<NetworkTestResult, crate::error::LinkSightError> {
    let result = ping::ping(&host, count).await?;

    // Best-effort persistence: a storage failure must not fail the test.
    if let Some(db) = state.db.as_ref() {
        if let Err(e) = db.save_test(&result).await {
            tracing::warn!("failed to persist ping result: {e}");
        }
    }

    Ok(result)
}

/// LAN discovery (Basic Mode). Empty `cidr` triggers subnet auto-detection.
#[tauri::command]
pub async fn run_scan(
    cidr: String,
    state: State<'_, AppState>,
) -> Result<ScanResult, crate::error::LinkSightError> {
    let result = scan::scan(&cidr).await?;

    // Best-effort persistence of discovered devices.
    if let Some(db) = state.db.as_ref() {
        if let Err(e) = db.upsert_devices(&result.devices).await {
            tracing::warn!("failed to persist discovered devices: {e}");
        }
    }

    Ok(result)
}

/// Traceroute (Basic Mode). `max_hops` of 0 defaults to 30.
#[tauri::command]
pub async fn run_traceroute(
    host: String,
    max_hops: u32,
) -> Result<TracerouteResult, crate::error::LinkSightError> {
    traceroute::traceroute(&host, max_hops).await
}

/// Internet speed test (Basic Mode) — download / upload / latency.
///
/// Streams staged progress (latency → download → upload → done) to the
/// frontend via `on_progress`, then resolves with the final result.
#[tauri::command]
pub async fn run_speedtest(
    on_progress: tauri::ipc::Channel<SpeedtestProgress>,
) -> Result<SpeedtestResult, crate::error::LinkSightError> {
    speedtest::speedtest(on_progress).await
}

/// Cancel an in-flight network test (`speedtest` | `connectivity` | `scan` | `traceroute`).
#[tauri::command]
pub fn cancel_network_test(kind: String) -> Result<(), LinkSightError> {
    let Some(k) = crate::network::cancel::CancelKind::parse(&kind) else {
        return Err(LinkSightError::InvalidInput(format!(
            "unknown cancel kind: {kind}"
        )));
    };
    crate::network::cancel::request(k);
    Ok(())
}

/// Connectivity test (Advanced Mode) — comprehensive local ↔ remote-host
/// diagnostics (RTT, jitter, loss, path MTU, hops, iperf3 throughput, BDP).
///
/// Streams staged progress (handshake → ping → mtu → traceroute → uplink →
/// downlink → done) to the frontend, then resolves with the final result.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn run_connectivity_test(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    settings: Option<ConnectivitySettings>,
    on_progress: tauri::ipc::Channel<ConnectivityProgress>,
    state: State<'_, AppState>,
) -> Result<ConnectivityResult, crate::error::LinkSightError> {
    let settings = settings.unwrap_or_default();
    let result = connectivity::connectivity_test(
        &ip,
        port,
        &username,
        &auth_mode,
        password.as_deref(),
        ssh_private_key_path.as_deref(),
        &settings,
        on_progress,
    )
    .await?;

    // Best-effort persistence: reuse the shared test table via a normalized row.
    if let Some(db) = state.db.as_ref() {
        let mut normalized = NetworkTestResult::new(
            crate::network::model::TestKind::Iperf,
            crate::network::model::TestMode::Advanced,
            result.target.clone(),
        );
        normalized.id = result.id.clone();
        normalized.status = result.status;
        normalized.started_at = result.started_at.clone();
        normalized.duration_ms = result.duration_ms;
        normalized.summary = crate::network::model::TestSummary {
            rtt_min_ms: result.rtt_min_ms,
            rtt_avg_ms: result.rtt_avg_ms,
            rtt_max_ms: result.rtt_max_ms,
            jitter_ms: result.jitter_ms,
            packet_loss_pct: result.packet_loss_pct,
            bandwidth_mbps: result.downlink_mbps.or(result.uplink_mbps),
            hops: result.hops,
        };
        normalized.raw = result.raw.clone();
        normalized.error = result.error.clone();
        if let Err(e) = db.save_test(&normalized).await {
            tracing::warn!("failed to persist connectivity result: {e}");
        }
    }

    Ok(result)
}

// ---- Local + remote file browser ------------------------------------------------

fn ssh_target(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> SshTarget {
    SshTarget {
        addr: format!("{ip}:{}", port.unwrap_or(22)),
        username,
        auth_mode,
        password,
        private_key_path: ssh_private_key_path,
    }
}

/// Build an SSH target when `ip` is present; otherwise target the local host.
fn optional_ssh_target(
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Option<SshTarget> {
    let ip = ip?.trim().to_string();
    if ip.is_empty() {
        return None;
    }
    Some(ssh_target(
        ip,
        port,
        username.unwrap_or_default(),
        auth_mode.unwrap_or_else(|| "ssh".into()),
        password,
        ssh_private_key_path,
    ))
}

#[tauri::command]
pub fn local_list_dir(
    path: Option<String>,
    show_hidden: Option<bool>,
) -> Result<FileListing, LinkSightError> {
    local_fs::list_dir(path.as_deref(), show_hidden.unwrap_or(false))
}

#[tauri::command]
pub fn local_mkdir(path: String) -> Result<(), LinkSightError> {
    local_fs::mkdir(&path)
}

#[tauri::command]
pub fn local_rename(old_path: String, new_path: String) -> Result<(), LinkSightError> {
    local_fs::rename(&old_path, &new_path)
}

#[tauri::command]
pub fn local_remove(path: String, kind: String) -> Result<(), LinkSightError> {
    local_fs::remove(&path, &kind)
}

#[tauri::command]
pub fn local_set_permissions(path: String, mode: u32) -> Result<(), LinkSightError> {
    local_fs::set_permissions(&path, mode)
}

/// List a remote directory over SFTP.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_list_dir(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    path: Option<String>,
    show_hidden: Option<bool>,
) -> Result<FileListing, LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::list_dir(&target, path.as_deref(), show_hidden.unwrap_or(false)).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    path: String,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::mkdir(&target, &path).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_rename(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    old_path: String,
    new_path: String,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::rename(&target, &old_path, &new_path).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_remove(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    path: String,
    kind: String,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::remove(&target, &path, &kind).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_set_permissions(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    path: String,
    mode: u32,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::set_permissions(&target, &path, mode).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_upload(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    local_path: String,
    remote_dir: String,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::upload_file(&target, &local_path, &remote_dir).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_download(
    ip: String,
    port: Option<u16>,
    username: String,
    auth_mode: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    remote_path: String,
    local_dir: String,
) -> Result<(), LinkSightError> {
    let target = ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    sftp::download_file(&target, &remote_path, &local_dir).await
}

/// List the host's network interfaces (system module).
#[tauri::command]
pub async fn list_network_interfaces() -> Result<Vec<InterfaceInfo>, crate::error::LinkSightError> {
    list_interfaces()
}

/// List local Docker images via the `docker` CLI.
#[tauri::command]
pub async fn list_docker_images() -> Result<Vec<DockerImage>, crate::error::LinkSightError> {
    docker::list_images().await
}

/// Containers + images + `docker system df` for the Docker Stats page.
///
/// When `ip` is set, runs against that host over SSH; otherwise local Docker.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn get_docker_overview(
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<DockerOverview, crate::error::LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::overview_for(target.as_ref()).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn docker_stop_container(
    id: String,
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<(), LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::stop_container(&id, target.as_ref()).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn docker_restart_container(
    id: String,
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<(), LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::restart_container(&id, target.as_ref()).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn docker_remove_container(
    id: String,
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<(), LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::remove_container(&id, target.as_ref()).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn docker_rename_image(
    id: String,
    old_repository: String,
    old_tag: String,
    repository: String,
    tag: String,
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<(), LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::rename_image(
        &id,
        &old_repository,
        &old_tag,
        &repository,
        &tag,
        target.as_ref(),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn docker_remove_image(
    id_or_ref: String,
    ip: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    auth_mode: Option<String>,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
) -> Result<(), LinkSightError> {
    let target = optional_ssh_target(
        ip,
        port,
        username,
        auth_mode,
        password,
        ssh_private_key_path,
    );
    docker::remove_image(&id_or_ref, target.as_ref()).await
}

// ---- Saved hosts (Termius-style host manager) --------------------------------

#[tauri::command]
pub async fn list_hosts(state: State<'_, AppState>) -> Result<Vec<HostRecord>, LinkSightError> {
    require_db(&state)?.list_hosts().await
}

/// Create or update a saved host. Empty `id` creates a new record.
#[tauri::command]
pub async fn save_host(
    mut host: HostRecord,
    state: State<'_, AppState>,
) -> Result<HostRecord, LinkSightError> {
    if host.alias.trim().is_empty() || host.username.trim().is_empty() || host.ip.trim().is_empty()
    {
        return Err(LinkSightError::InvalidInput(
            "alias, username and ip are required".into(),
        ));
    }
    if host.port == Some(0) {
        host.port = None;
    }
    if host.auth_mode != "password" && host.auth_mode != "ssh" {
        host.auth_mode = "ssh".into();
    }
    if host.auth_mode == "ssh"
        && host
            .ssh_private_key_path
            .as_ref()
            .map_or(true, |p| p.trim().is_empty())
    {
        return Err(LinkSightError::InvalidInput(
            "private key path is required for SSH login mode".into(),
        ));
    }

    let db = require_db(&state)?;
    if host.id.trim().is_empty() {
        host.id = uuid::Uuid::new_v4().to_string();
        db.insert_host(&host).await?;
    } else if db.host_exists(&host.id).await? {
        db.update_host(&host).await?;
    } else {
        // Preserve caller-supplied id when updating a stale in-memory copy.
        db.insert_host(&host).await?;
    }
    Ok(host)
}

#[tauri::command]
pub async fn delete_host(id: String, state: State<'_, AppState>) -> Result<(), LinkSightError> {
    require_db(&state)?.delete_host(&id).await
}

/// Persist host card order on the Hosts page.
#[tauri::command]
pub async fn reorder_hosts(
    ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), LinkSightError> {
    require_db(&state)?.reorder_hosts(&ids).await
}

/// Validate a local private-key file (format + fingerprint). No network I/O.
#[tauri::command]
pub async fn validate_ssh_private_key(
    path: String,
) -> Result<PrivateKeyValidation, LinkSightError> {
    Ok(verify::validate_ssh_private_key(&path))
}

/// Validate an OpenSSH public key line (format + fingerprint). No network I/O.
#[tauri::command]
pub async fn validate_ssh_public_key(
    ssh_public_key: Option<String>,
) -> Result<PublicKeyValidation, LinkSightError> {
    Ok(verify::validate_ssh_public_key(ssh_public_key.as_deref()))
}

/// Write pasted private-key material to the app data dir (0600) and return its path.
#[tauri::command]
pub fn persist_ssh_key_file(content: String) -> Result<String, LinkSightError> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(LinkSightError::InvalidInput("key content is empty".into()));
    }

    let dir = app_data_dir()?.join("linksight").join("keys");
    std::fs::create_dir_all(&dir)
        .map_err(|e| LinkSightError::CommandFailed(format!("create keys dir: {e}")))?;

    let path = dir.join(format!("{}.key", uuid::Uuid::new_v4()));
    std::fs::write(&path, trimmed)
        .map_err(|e| LinkSightError::CommandFailed(format!("write key file: {e}")))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }

    let path_str = path.to_string_lossy().to_string();
    let check = verify::validate_ssh_private_key(&path_str);
    if !check.valid {
        let _ = std::fs::remove_file(&path);
        return Err(LinkSightError::InvalidInput(
            check
                .message
                .unwrap_or_else(|| "invalid private key".into()),
        ));
    }

    Ok(path_str)
}

/// Read a local key file (for re-opening the key editor on saved hosts).
#[tauri::command]
pub fn read_local_key_file(path: String) -> Result<String, LinkSightError> {
    let p = path.trim();
    if p.is_empty() {
        return Err(LinkSightError::InvalidInput("path is empty".into()));
    }
    std::fs::read_to_string(p)
        .map_err(|e| LinkSightError::CommandFailed(format!("read key file: {e}")))
}

fn app_data_dir() -> Result<std::path::PathBuf, LinkSightError> {
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            return Ok(std::path::PathBuf::from(xdg));
        }
    }
    std::env::var("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".local/share"))
        .map_err(|_| LinkSightError::CommandFailed("cannot resolve data directory".into()))
}

/// Verify a host: TCP reachability, then SSH password or public-key auth.
#[tauri::command]
pub async fn verify_host(
    auth_mode: String,
    ip: String,
    port: Option<u16>,
    username: String,
    password: Option<String>,
    ssh_private_key_path: Option<String>,
    ssh_public_key: Option<String>,
) -> Result<VerifyResult, LinkSightError> {
    verify::verify_host(
        &auth_mode,
        &ip,
        port,
        &username,
        password.as_deref(),
        ssh_private_key_path.as_deref(),
        ssh_public_key.as_deref(),
    )
    .await
}
