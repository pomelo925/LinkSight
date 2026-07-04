//! Tauri command surface — the RPC boundary exposed to the React frontend.
//!
//! Commands are thin: they validate input, delegate to a backend module, and
//! (best-effort) persist the result. Every network command returns the shared
//! [`NetworkTestResult`] schema.

use tauri::State;

use crate::network::model::NetworkTestResult;
use crate::network::ping;
use crate::system::interface::{list_interfaces, InterfaceInfo};
use crate::AppState;

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

/// List the host's network interfaces (system module).
#[tauri::command]
pub async fn list_network_interfaces(
) -> Result<Vec<InterfaceInfo>, crate::error::LinkSightError> {
    list_interfaces()
}
