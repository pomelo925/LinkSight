//! LAN discovery (Basic Mode) — optional `nmap` wrapper.
//!
//! Skeleton: returns the shared result schema. A ping-sweep / `nmap -sn`
//! implementation will populate discovered devices for the `db::devices` table.

use super::model::{NetworkTestResult, TestKind, TestMode};
use crate::error::{LinkSightError, Result};

pub async fn scan(cidr: &str) -> Result<NetworkTestResult> {
    let _result = NetworkTestResult::new(TestKind::Scan, TestMode::Basic, cidr);
    Err(LinkSightError::NotImplemented(
        "LAN scan wrapper is scaffolded but not yet implemented".into(),
    ))
}
