//! SSH session management (Advanced Mode).
//!
//! Designed around traits so the transport can be swapped between a direct
//! `russh` client and a future LinkSight Agent without changing callers.
//! Nothing here is fully implemented yet (enable via the `ssh` cargo feature).

pub mod executor;
pub mod session;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshCredentials {
    pub host: String,
    pub port: u16,
    pub username: String,
    /// Path to a private key; password auth is intentionally out of scope here.
    pub identity_file: Option<String>,
}

impl Default for SshCredentials {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 22,
            username: String::new(),
            identity_file: None,
        }
    }
}
