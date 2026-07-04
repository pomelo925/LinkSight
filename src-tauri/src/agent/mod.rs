//! LinkSight Agent (future extension).
//!
//! An optional lightweight daemon deployed on remote devices. It exposes a
//! metrics API and can run the server/client side of diagnostics (e.g. an
//! `iperf3` server) so Advanced Mode tests don't require interactive SSH.
//!
//! This module defines the *abstraction* only — the trait that both a direct
//! transport (SSH fallback) and a native agent connection will implement — so
//! the rest of the backend can target it today without a concrete impl.

use serde::{Deserialize, Serialize};

use crate::error::{LinkSightError, Result};
use crate::network::model::NetworkTestResult;

/// How the core reaches a remote target's capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AgentTransport {
    /// Native LinkSight Agent daemon (preferred).
    Native { endpoint: String },
    /// Fall back to SSH when no agent is installed.
    SshFallback { host: String, port: u16 },
}

/// Snapshot of remote system metrics reported by an agent.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMetrics {
    pub cpu_pct: Option<f64>,
    pub mem_pct: Option<f64>,
    pub rx_bytes: Option<u64>,
    pub tx_bytes: Option<u64>,
}

/// Contract for a remote diagnostics provider. Implemented later by the native
/// agent client and by an SSH-based fallback.
pub trait RemoteProvider: Send + Sync {
    fn metrics(&self) -> impl std::future::Future<Output = Result<RemoteMetrics>> + Send;

    /// Run a bandwidth test against this remote (spins up an iperf3 server-side).
    fn bandwidth(
        &self,
    ) -> impl std::future::Future<Output = Result<NetworkTestResult>> + Send;
}

/// Placeholder resolver — chooses a provider for a transport. Not yet wired.
pub fn resolve(_transport: AgentTransport) -> Result<()> {
    Err(LinkSightError::NotImplemented(
        "LinkSight Agent is designed but not implemented".into(),
    ))
}
