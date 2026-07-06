//! Deploy a client public key to a remote `~/.ssh/authorized_keys` (ssh-copy-id).

use std::sync::Arc;
use std::time::Duration;

use russh::client::{self, AuthResult};
use russh::ChannelMsg;

use super::verify::AcceptAllKeys;
use crate::error::{LinkSightError, Result};

const DEPLOY_TIMEOUT: Duration = Duration::from_secs(15);

fn shell_escape_single(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Password-authenticate, then append `public_key_line` to `authorized_keys`.
pub async fn deploy_public_key(
    config: &Arc<client::Config>,
    addr: &str,
    username: &str,
    password: &str,
    public_key_line: &str,
) -> Result<()> {
    let line = public_key_line.trim();
    if line.is_empty() {
        return Err(LinkSightError::InvalidInput(
            "public key line is empty".into(),
        ));
    }

    tokio::time::timeout(DEPLOY_TIMEOUT, async {
        let mut session = client::connect(config.clone(), addr, AcceptAllKeys)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("SSH connect failed: {e}")))?;

        match session.authenticate_password(username, password).await {
            Ok(AuthResult::Success) => {}
            Ok(AuthResult::Failure { .. }) => {
                return Err(LinkSightError::CommandFailed(
                    "password authentication failed — cannot deploy public key".into(),
                ));
            }
            Err(e) => {
                return Err(LinkSightError::CommandFailed(format!(
                    "password auth error: {e}"
                )));
            }
        }

        let key = shell_escape_single(line);
        let cmd = format!(
            "mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
             (grep -qxF {key} ~/.ssh/authorized_keys 2>/dev/null || echo {key} >> ~/.ssh/authorized_keys) && \
             chmod 600 ~/.ssh/authorized_keys"
        );

        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("open session: {e}")))?;
        channel
            .exec(true, cmd)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("exec deploy: {e}")))?;

        let mut exit_code = None;
        while let Some(msg) = channel.wait().await {
            if let ChannelMsg::ExitStatus { exit_status } = msg {
                exit_code = Some(exit_status);
                break;
            }
        }

        match exit_code {
            Some(0) => Ok(()),
            Some(code) => Err(LinkSightError::CommandFailed(format!(
                "deploy command exited with status {code}"
            ))),
            None => Err(LinkSightError::CommandFailed(
                "deploy command produced no exit status".into(),
            )),
        }
    })
    .await
    .map_err(|_| {
        LinkSightError::CommandFailed(format!("deploy timed out after {DEPLOY_TIMEOUT:?}"))
    })?
}
