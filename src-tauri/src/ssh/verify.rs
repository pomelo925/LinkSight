//! Host verification: TCP reachability + SSH authentication.
//!
//! **Password mode** — password auth only.
//! **SSH mode** — public-key auth with the local private key; on failure, if a
//! password and (optional) public key are supplied, deploys the key to
//! `authorized_keys` (ssh-copy-id) and retries.

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::client::{self, AuthResult};
use serde::{Deserialize, Serialize};

use super::deploy::deploy_public_key;
use super::exec::{run_remote_command, SshTarget};
use super::keys::{
    self, private_key_with_hash, resolve_public_key_line, validate_private_key,
    validate_public_key_text,
};
use crate::error::{LinkSightError, Result};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_SSH_PORT: u16 = 22;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub reachable: bool,
    pub authenticated: bool,
    pub latency_ms: Option<f64>,
    pub message: Option<String>,
    pub public_key_valid: Option<bool>,
    pub public_key_fingerprint: Option<String>,
    pub auth_method: Option<String>,
    /// True when a public key was deployed to the server during this verify run.
    pub key_deployed: Option<bool>,
    /// Primary NIC MAC on the remote host (best-effort after successful auth).
    #[serde(default)]
    pub mac: Option<String>,
}

pub(crate) struct AcceptAllKeys;

impl client::Handler for AcceptAllKeys {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }
}

fn effective_port(port: Option<u16>) -> u16 {
    port.filter(|&p| p > 0).unwrap_or(DEFAULT_SSH_PORT)
}

pub fn validate_ssh_private_key(path: &str) -> keys::PrivateKeyValidation {
    validate_private_key(path)
}

pub fn validate_ssh_public_key(text: Option<&str>) -> keys::PublicKeyValidation {
    match text.filter(|t| !t.trim().is_empty()) {
        Some(t) => validate_public_key_text(t),
        None => keys::PublicKeyValidation {
            valid: false,
            fingerprint: None,
            message: Some("no public key provided".into()),
        },
    }
}

/// Verify a saved host end-to-end.
pub async fn verify_host(
    auth_mode: &str,
    ip: &str,
    port: Option<u16>,
    username: &str,
    password: Option<&str>,
    ssh_private_key_path: Option<&str>,
    ssh_public_key: Option<&str>,
) -> Result<VerifyResult> {
    let mut result = verify_host_inner(
        auth_mode,
        ip,
        port,
        username,
        password,
        ssh_private_key_path,
        ssh_public_key,
    )
    .await?;

    if result.authenticated {
        let target = SshTarget {
            addr: format!("{}:{}", ip.trim(), effective_port(port)),
            username: username.to_string(),
            auth_mode: auth_mode.to_string(),
            password: password.map(str::to_string),
            private_key_path: ssh_private_key_path.map(str::to_string),
        };
        result.mac = fetch_remote_mac(&target).await;
    }

    Ok(result)
}

/// Best-effort primary interface MAC via SSH (`ip route` → `/sys/class/net`).
async fn fetch_remote_mac(target: &SshTarget) -> Option<String> {
    const CMD: &str = r#"IFACE=$(ip -4 route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}'); if [ -n "$IFACE" ] && [ -r "/sys/class/net/$IFACE/address" ]; then cat "/sys/class/net/$IFACE/address"; else for d in /sys/class/net/*/address; do iface=$(basename "$(dirname "$d")"); [ "$iface" = "lo" ] && continue; mac=$(cat "$d" 2>/dev/null); [ -n "$mac" ] && [ "$mac" != "00:00:00:00:00:00" ] && echo "$mac" && break; done; fi"#;
    let out = run_remote_command(target, CMD, Duration::from_secs(8))
        .await
        .ok()?;
    let mac = out.stdout.trim().to_ascii_lowercase();
    if mac.len() >= 11 && mac.contains(':') {
        Some(mac)
    } else {
        None
    }
}

async fn verify_host_inner(
    auth_mode: &str,
    ip: &str,
    port: Option<u16>,
    username: &str,
    password: Option<&str>,
    ssh_private_key_path: Option<&str>,
    ssh_public_key: Option<&str>,
) -> Result<VerifyResult> {
    if ip.trim().is_empty() || username.trim().is_empty() {
        return Err(LinkSightError::InvalidInput(
            "ip and username are required".into(),
        ));
    }

    let has_password = password.is_some_and(|p| !p.is_empty());
    let ssh_mode = auth_mode != "password";

    if ssh_mode {
        if ssh_private_key_path.map_or(true, |p| p.trim().is_empty()) {
            return Err(LinkSightError::InvalidInput(
                "private key path is required for SSH login mode".into(),
            ));
        }
    } else if !has_password {
        return Err(LinkSightError::InvalidInput(
            "password is required for password login mode".into(),
        ));
    }

    let private_check = ssh_mode
        .then(|| validate_private_key(ssh_private_key_path.unwrap_or_default()))
        .filter(|_| ssh_private_key_path.is_some_and(|p| !p.trim().is_empty()));

    if let Some(ref check) = private_check {
        if !check.valid {
            return Ok(VerifyResult {
                reachable: false,
                authenticated: false,
                latency_ms: None,
                message: check.message.clone(),
                public_key_valid: None,
                public_key_fingerprint: check.fingerprint.clone(),
                auth_method: None,
                key_deployed: None,
                mac: None,
            });
        }
    }

    let port = effective_port(port);
    let addr = format!("{}:{port}", ip.trim());
    let start = Instant::now();
    let config = Arc::new(client::Config::default());

    // Stage 1: TCP
    match tokio::time::timeout(CONNECT_TIMEOUT, tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            return Ok(fail_tcp(
                start,
                Some(format!("TCP connect failed: {e}")),
                private_check,
            ));
        }
        Err(_) => {
            return Ok(fail_tcp(
                start,
                Some(format!("TCP connect timed out after {CONNECT_TIMEOUT:?}")),
                private_check,
            ));
        }
    }

    if !ssh_mode {
        return finish_password_auth(&config, &addr, username, password.unwrap(), start, None)
            .await;
    }

    let private_path = Path::new(ssh_private_key_path.unwrap().trim());

    // Stage 2: try public-key auth
    match try_publickey_auth(&config, &addr, username, private_path, start).await {
        Ok(r) => Ok(VerifyResult {
            public_key_fingerprint: private_check.as_ref().and_then(|c| c.fingerprint.clone()),
            auth_method: Some("publickey".into()),
            key_deployed: Some(false),
            ..r
        }),
        Err(key_err) => {
            if !has_password {
                return Ok(VerifyResult {
                    reachable: true,
                    authenticated: false,
                    latency_ms: None,
                    message: Some(format!(
                        "{key_err} — provide a password to deploy your public key on first connect"
                    )),
                    public_key_fingerprint: private_check
                        .as_ref()
                        .and_then(|c| c.fingerprint.clone()),
                    auth_method: None,
                    key_deployed: Some(false),
                    public_key_valid: None,
                    mac: None,
                });
            }

            let pub_line = match resolve_public_key_line(
                private_path.to_str().unwrap_or(""),
                ssh_public_key,
            ) {
                Ok(l) => l,
                Err(e) => {
                    return Ok(VerifyResult {
                        reachable: true,
                        authenticated: false,
                        latency_ms: None,
                        message: Some(format!("{key_err}; deploy skipped: {e}")),
                        public_key_fingerprint: private_check
                            .as_ref()
                            .and_then(|c| c.fingerprint.clone()),
                        auth_method: None,
                        key_deployed: Some(false),
                        public_key_valid: None,
                        mac: None,
                    });
                }
            };

            if let Err(e) =
                deploy_public_key(&config, &addr, username, password.unwrap(), &pub_line).await
            {
                return Ok(VerifyResult {
                    reachable: true,
                    authenticated: false,
                    latency_ms: None,
                    message: Some(format!("{key_err}; deploy failed: {e}")),
                    public_key_fingerprint: private_check
                        .as_ref()
                        .and_then(|c| c.fingerprint.clone()),
                    auth_method: None,
                    key_deployed: Some(false),
                    public_key_valid: Some(true),
                    mac: None,
                });
            }

            // Retry public-key auth after deploy
            match try_publickey_auth(&config, &addr, username, private_path, start).await {
                Ok(r) => Ok(VerifyResult {
                    public_key_fingerprint: private_check
                        .as_ref()
                        .and_then(|c| c.fingerprint.clone()),
                    auth_method: Some("publickey".into()),
                    key_deployed: Some(true),
                    message: Some("Public key deployed to authorized_keys (ssh-copy-id)".into()),
                    public_key_valid: Some(true),
                    ..r
                }),
                Err(retry_err) => Ok(VerifyResult {
                    reachable: true,
                    authenticated: false,
                    latency_ms: None,
                    message: Some(format!(
                        "key deployed but authentication still failed: {retry_err}"
                    )),
                    public_key_fingerprint: private_check
                        .as_ref()
                        .and_then(|c| c.fingerprint.clone()),
                    auth_method: None,
                    key_deployed: Some(true),
                    public_key_valid: Some(true),
                    mac: None,
                }),
            }
        }
    }
}

fn fail_tcp(
    _start: Instant,
    message: Option<String>,
    private_check: Option<keys::PrivateKeyValidation>,
) -> VerifyResult {
    VerifyResult {
        reachable: false,
        authenticated: false,
        latency_ms: None,
        message,
        public_key_valid: None,
        public_key_fingerprint: private_check.and_then(|c| c.fingerprint),
        auth_method: None,
        key_deployed: None,
        mac: None,
    }
}

async fn finish_password_auth(
    config: &Arc<client::Config>,
    addr: &str,
    username: &str,
    password: &str,
    start: Instant,
    key_deployed: Option<bool>,
) -> Result<VerifyResult> {
    match try_password_auth(config, addr, username, password, start).await {
        Ok(r) => Ok(VerifyResult {
            auth_method: Some("password".into()),
            key_deployed,
            ..r
        }),
        Err(msg) => Ok(VerifyResult {
            reachable: true,
            authenticated: false,
            latency_ms: None,
            message: Some(msg),
            public_key_valid: None,
            public_key_fingerprint: None,
            auth_method: None,
            key_deployed,
            mac: None,
        }),
    }
}

async fn try_password_auth(
    config: &Arc<client::Config>,
    addr: &str,
    username: &str,
    password: &str,
    start: Instant,
) -> std::result::Result<VerifyResult, String> {
    let result = tokio::time::timeout(AUTH_TIMEOUT, async {
        let mut session = client::connect(config.clone(), addr, AcceptAllKeys)
            .await
            .map_err(|e| format!("SSH connect failed: {e}"))?;
        session
            .authenticate_password(username, password)
            .await
            .map_err(|e| format!("SSH auth failed: {e}"))
    })
    .await;

    match result {
        Ok(Ok(AuthResult::Success)) => Ok(VerifyResult {
            reachable: true,
            authenticated: true,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            message: None,
            public_key_valid: None,
            public_key_fingerprint: None,
            auth_method: None,
            key_deployed: None,
            mac: None,
        }),
        Ok(Ok(AuthResult::Failure { .. })) => {
            Err("authentication rejected — check username / password".into())
        }
        Ok(Err(msg)) => Err(msg),
        Err(_) => Err(format!("SSH auth timed out after {AUTH_TIMEOUT:?}")),
    }
}

async fn try_publickey_auth(
    config: &Arc<client::Config>,
    addr: &str,
    username: &str,
    private_path: &Path,
    start: Instant,
) -> std::result::Result<VerifyResult, String> {
    let result = tokio::time::timeout(AUTH_TIMEOUT, async {
        let mut session = client::connect(config.clone(), addr, AcceptAllKeys)
            .await
            .map_err(|e| format!("SSH connect failed: {e}"))?;
        let rsa_hash = session
            .best_supported_rsa_hash()
            .await
            .unwrap_or(None)
            .flatten();
        let auth_key = private_key_with_hash(private_path, rsa_hash).map_err(|e| e.to_string())?;
        session
            .authenticate_publickey(username, auth_key)
            .await
            .map_err(|e| format!("SSH public-key auth failed: {e}"))
    })
    .await;

    match result {
        Ok(Ok(AuthResult::Success)) => Ok(VerifyResult {
            reachable: true,
            authenticated: true,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            message: None,
            public_key_valid: None,
            public_key_fingerprint: None,
            auth_method: None,
            key_deployed: None,
            mac: None,
        }),
        Ok(Ok(AuthResult::Failure { .. })) => {
            Err("public-key authentication rejected — key may not be on the server yet".into())
        }
        Ok(Err(msg)) => Err(msg),
        Err(_) => Err(format!("SSH auth timed out after {AUTH_TIMEOUT:?}")),
    }
}
