//! Host verification: two-stage check used by the Hosts page.
//!
//! 1. TCP reachability (`ip:port` connect with timeout)
//! 2. SSH password authentication via `russh`
//!
//! Host keys are accepted blindly for now — verification is a connectivity
//! diagnostic, not a trust decision. Known-hosts pinning can come later.

use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::client::{self, AuthResult};
use serde::{Deserialize, Serialize};

use crate::error::{LinkSightError, Result};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    /// TCP connect to `ip:port` succeeded.
    pub reachable: bool,
    /// SSH password authentication succeeded.
    pub authenticated: bool,
    /// Time to establish + authenticate, when successful.
    pub latency_ms: Option<f64>,
    /// Human-readable failure detail (empty on success).
    pub message: Option<String>,
}

struct AcceptAllKeys;

impl client::Handler for AcceptAllKeys {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Verify a saved host end-to-end (TCP reachability, then SSH auth).
pub async fn verify_host(
    ip: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<VerifyResult> {
    if ip.trim().is_empty() || username.trim().is_empty() {
        return Err(LinkSightError::InvalidInput(
            "ip and username are required".into(),
        ));
    }

    let addr = format!("{}:{}", ip.trim(), port);
    let start = Instant::now();

    // Stage 1: TCP reachability.
    match tokio::time::timeout(CONNECT_TIMEOUT, tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(_stream)) => {}
        Ok(Err(e)) => {
            return Ok(VerifyResult {
                reachable: false,
                authenticated: false,
                latency_ms: None,
                message: Some(format!("TCP connect failed: {e}")),
            });
        }
        Err(_) => {
            return Ok(VerifyResult {
                reachable: false,
                authenticated: false,
                latency_ms: None,
                message: Some(format!("TCP connect timed out after {CONNECT_TIMEOUT:?}")),
            });
        }
    }

    // Stage 2: SSH password authentication.
    let config = Arc::new(client::Config::default());
    let auth = async {
        let mut session = client::connect(config, addr.as_str(), AcceptAllKeys).await?;
        session.authenticate_password(username, password).await
    };

    match tokio::time::timeout(AUTH_TIMEOUT, auth).await {
        Ok(Ok(AuthResult::Success)) => Ok(VerifyResult {
            reachable: true,
            authenticated: true,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            message: None,
        }),
        Ok(Ok(AuthResult::Failure { .. })) => Ok(VerifyResult {
            reachable: true,
            authenticated: false,
            latency_ms: None,
            message: Some("authentication rejected — check username / password".into()),
        }),
        Ok(Err(e)) => Ok(VerifyResult {
            reachable: true,
            authenticated: false,
            latency_ms: None,
            message: Some(format!("SSH handshake failed: {e}")),
        }),
        Err(_) => Ok(VerifyResult {
            reachable: true,
            authenticated: false,
            latency_ms: None,
            message: Some(format!("SSH auth timed out after {AUTH_TIMEOUT:?}")),
        }),
    }
}
