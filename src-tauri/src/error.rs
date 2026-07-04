//! Unified error type shared across backend modules and surfaced to the
//! frontend as a plain string via `serde`.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum LinkSightError {
    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("command failed: {0}")]
    CommandFailed(String),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("not implemented: {0}")]
    NotImplemented(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Serialize errors as their display string so the frontend receives a clean
/// message from a rejected `invoke`.
impl Serialize for LinkSightError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LinkSightError>;
