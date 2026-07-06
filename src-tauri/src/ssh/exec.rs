//! Authenticated one-shot remote command execution over SSH (russh).
//!
//! Unlike [`super::executor`] (a streaming-session scaffold), this runs a single
//! command to completion and returns the captured stdout/stderr and exit status.
//! Used by the connectivity test to launch a remote `iperf3` server.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, AuthResult};
use russh::ChannelMsg;

use super::keys::private_key_with_hash;
use super::verify::AcceptAllKeys;
use crate::error::{LinkSightError, Result};

/// Captured output of a finished remote command.
#[derive(Debug, Clone)]
pub struct RemoteOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<u32>,
}

impl RemoteOutput {
    pub fn ok(&self) -> bool {
        self.exit_code == Some(0)
    }
}

/// Connection + auth parameters for a remote SSH target.
#[derive(Debug, Clone)]
pub struct SshTarget {
    /// `ip:port`, port already resolved to the effective SSH port.
    pub addr: String,
    pub username: String,
    /// `ssh` (public-key) or `password`.
    pub auth_mode: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
}

async fn authenticate(
    session: &mut client::Handle<AcceptAllKeys>,
    target: &SshTarget,
) -> std::result::Result<(), String> {
    let auth = if target.auth_mode == "password" {
        let password = target
            .password
            .as_deref()
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "password required for password auth".to_string())?;
        session
            .authenticate_password(&target.username, password)
            .await
            .map_err(|e| format!("SSH auth failed: {e}"))?
    } else {
        let path = target
            .private_key_path
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| "private key path required for SSH auth".to_string())?;
        let rsa_hash = session
            .best_supported_rsa_hash()
            .await
            .unwrap_or(None)
            .flatten();
        let key = private_key_with_hash(Path::new(path.trim()), rsa_hash)
            .map_err(|e| e.to_string())?;
        session
            .authenticate_publickey(&target.username, key)
            .await
            .map_err(|e| format!("SSH public-key auth failed: {e}"))?
    };

    match auth {
        AuthResult::Success => Ok(()),
        AuthResult::Failure { .. } => Err("SSH authentication rejected".into()),
    }
}

/// Open a TCP connection to the target and complete SSH authentication,
/// returning the live session handle. Shared by one-shot exec and the SFTP
/// browser so the auth logic lives in one place.
pub(crate) async fn connect_and_authenticate(
    target: &SshTarget,
) -> Result<client::Handle<AcceptAllKeys>> {
    let config = Arc::new(client::Config::default());
    let mut session = client::connect(config, &target.addr, AcceptAllKeys)
        .await
        .map_err(|e| LinkSightError::CommandFailed(format!("SSH connect failed: {e}")))?;

    authenticate(&mut session, target)
        .await
        .map_err(LinkSightError::CommandFailed)?;

    Ok(session)
}

/// Connect, authenticate, and run `command` to completion.
pub async fn run_remote_command(
    target: &SshTarget,
    command: &str,
    timeout: Duration,
) -> Result<RemoteOutput> {
    let fut = async {
        let session = connect_and_authenticate(target).await?;

        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("open session: {e}")))?;
        channel
            .exec(true, command)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("exec: {e}")))?;

        let mut stdout: Vec<u8> = Vec::new();
        let mut stderr: Vec<u8> = Vec::new();
        let mut exit_code = None;

        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => stdout.extend_from_slice(data),
                ChannelMsg::ExtendedData { ref data, .. } => stderr.extend_from_slice(data),
                ChannelMsg::ExitStatus { exit_status } => exit_code = Some(exit_status),
                _ => {}
            }
        }

        Ok(RemoteOutput {
            stdout: String::from_utf8_lossy(&stdout).to_string(),
            stderr: String::from_utf8_lossy(&stderr).to_string(),
            exit_code,
        })
    };

    tokio::time::timeout(timeout, fut)
        .await
        .map_err(|_| LinkSightError::CommandFailed(format!("remote command timed out after {timeout:?}")))?
}
