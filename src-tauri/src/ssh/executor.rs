//! Remote command execution over an established SSH session.
//!
//! Skeleton. The real implementation will stream stdout/stderr back to the
//! xterm.js frontend via Tauri events and support the Advanced Mode remote
//! diagnostics (e.g. launching an `iperf3` server on the remote host).

use crate::error::{LinkSightError, Result};

pub async fn execute_remote(_command: &str) -> Result<String> {
    Err(LinkSightError::NotImplemented(
        "remote command execution is scaffolded (enable the `ssh` feature)".into(),
    ))
}
