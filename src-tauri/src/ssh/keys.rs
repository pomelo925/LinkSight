//! SSH key loading, validation, and public-key line derivation from a private key.

use std::path::Path;

use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, ssh_key::PublicKey};
use russh::keys::ssh_key::HashAlg;

use crate::error::{LinkSightError, Result};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateKeyValidation {
    pub valid: bool,
    pub fingerprint: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicKeyValidation {
    pub valid: bool,
    pub fingerprint: Option<String>,
    pub message: Option<String>,
}

/// Validate that a private-key file exists and can be parsed.
pub fn validate_private_key(path: &str) -> PrivateKeyValidation {
    match load_private_key(path) {
        Ok(key) => PrivateKeyValidation {
            valid: true,
            fingerprint: Some(fingerprint(key.public_key())),
            message: None,
        },
        Err(e) => PrivateKeyValidation {
            valid: false,
            fingerprint: None,
            message: Some(e),
        },
    }
}

pub fn validate_public_key_text(text: &str) -> PublicKeyValidation {
    match parse_public_key_text(text) {
        Ok(key) => PublicKeyValidation {
            valid: true,
            fingerprint: Some(fingerprint(&key)),
            message: None,
        },
        Err(e) => PublicKeyValidation {
            valid: false,
            fingerprint: None,
            message: Some(e),
        },
    }
}

fn load_private_key(path: &str) -> std::result::Result<russh::keys::PrivateKey, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("private key path is empty".into());
    }
    if !Path::new(path).exists() {
        return Err(format!("private key not found: {path}"));
    }
    load_secret_key(path, None).map_err(|e| format!("cannot load private key: {e}"))
}

fn parse_public_key_text(text: &str) -> std::result::Result<PublicKey, String> {
    PublicKey::from_openssh(text.trim())
        .map_err(|e| format!("invalid OpenSSH public key: {e}"))
}

fn fingerprint(key: &PublicKey) -> String {
    key.fingerprint(HashAlg::Sha256).to_string()
}

/// One-line OpenSSH public key derived from a private-key file.
pub fn public_key_line_from_private(path: &str) -> std::result::Result<String, String> {
    let private = load_private_key(path)?;
    let line = private
        .public_key()
        .to_openssh()
        .map_err(|e| format!("encode public key: {e}"))?
        .to_string();
    Ok(line)
}

/// Public key line for deploy: explicit paste wins, else derive from private key.
pub fn resolve_public_key_line(
    private_path: &str,
    explicit_public: Option<&str>,
) -> std::result::Result<String, String> {
    if let Some(text) = explicit_public.filter(|t| !t.trim().is_empty()) {
        parse_public_key_text(text)?;
        return Ok(text.trim().to_string());
    }
    public_key_line_from_private(private_path)
}

pub fn private_key_with_hash(
    private_path: &Path,
    rsa_hash: Option<HashAlg>,
) -> Result<PrivateKeyWithHashAlg> {
    let key_pair = load_secret_key(private_path, None)
        .map_err(|e| LinkSightError::CommandFailed(format!("load private key: {e}")))?;
    Ok(PrivateKeyWithHashAlg::new(
        std::sync::Arc::new(key_pair),
        rsa_hash,
    ))
}
