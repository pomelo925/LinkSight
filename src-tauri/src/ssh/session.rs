//! SSH session lifecycle abstraction.
//!
//! `SshSession` is the transport-agnostic contract implemented later by a
//! `russh`-backed client and (optionally) by a LinkSight Agent tunnel.

use super::SshCredentials;
use crate::error::{LinkSightError, Result};

// NOTE: `async fn` in traits is stable on recent Rust; we keep this simple and
// avoid extra dependencies during scaffolding.
pub trait SshSession: Send + Sync {
    /// Open an interactive shell/session to the target.
    fn connect(
        &self,
        creds: &SshCredentials,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Cleanly tear down the session.
    fn disconnect(&self) -> impl std::future::Future<Output = Result<()>> + Send;
}

/// Placeholder session manager. Tracks intent; the real implementation will
/// hold a `russh` handle behind the `ssh` feature flag.
#[derive(Default)]
pub struct SessionManager;

impl SessionManager {
    pub fn new() -> Self {
        Self
    }

    pub async fn open(&self, _creds: SshCredentials) -> Result<()> {
        Err(LinkSightError::NotImplemented(
            "SSH session manager is scaffolded (enable the `ssh` feature)".into(),
        ))
    }
}
