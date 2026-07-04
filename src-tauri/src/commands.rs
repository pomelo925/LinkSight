//! Tauri command surface — the RPC boundary exposed to the React frontend.
//!
//! Commands are thin: they validate input, delegate to a backend module, and
//! (best-effort) persist the result. Every network command returns the shared
//! [`NetworkTestResult`] schema.

use tauri::State;

use crate::db::store::HostRecord;
use crate::error::LinkSightError;
use crate::network::model::NetworkTestResult;
use crate::network::ping;
use crate::network::scan::{self, ScanResult};
use crate::network::speedtest::{self, SpeedtestProgress, SpeedtestResult};
use crate::network::traceroute::{self, TracerouteResult};
use crate::ssh::verify::{self, VerifyResult};
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

/// List the host's network interfaces (system module).
#[tauri::command]
pub async fn list_network_interfaces(
) -> Result<Vec<InterfaceInfo>, crate::error::LinkSightError> {
    list_interfaces()
}

// ---- Saved hosts (Termius-style host manager) --------------------------------

#[tauri::command]
pub async fn list_hosts(
    state: State<'_, AppState>,
) -> Result<Vec<HostRecord>, LinkSightError> {
    require_db(&state)?.list_hosts().await
}

/// Create or update a saved host. Empty `id` creates a new record.
#[tauri::command]
pub async fn save_host(
    mut host: HostRecord,
    state: State<'_, AppState>,
) -> Result<HostRecord, LinkSightError> {
    if host.alias.trim().is_empty()
        || host.username.trim().is_empty()
        || host.ip.trim().is_empty()
    {
        return Err(LinkSightError::InvalidInput(
            "alias, username and ip are required".into(),
        ));
    }
    if host.port == 0 {
        host.port = 22;
    }

    let db = require_db(&state)?;
    if host.id.trim().is_empty() {
        host.id = uuid::Uuid::new_v4().to_string();
        db.insert_host(&host).await?;
    } else {
        db.update_host(&host).await?;
    }
    Ok(host)
}

#[tauri::command]
pub async fn delete_host(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), LinkSightError> {
    require_db(&state)?.delete_host(&id).await
}

/// Verify a host: TCP reachability, then SSH password authentication.
#[tauri::command]
pub async fn verify_host(
    ip: String,
    port: u16,
    username: String,
    password: String,
) -> Result<VerifyResult, LinkSightError> {
    verify::verify_host(&ip, port, &username, &password).await
}
