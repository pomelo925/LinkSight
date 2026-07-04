//! Traceroute (Basic Mode) — wraps the system `traceroute` binary.
//!
//! Skeleton: returns the shared result schema. Parsing of per-hop RTTs will be
//! filled in following the same pattern as [`super::ping`].

use super::model::{NetworkTestResult, TestKind, TestMode};
use crate::error::{LinkSightError, Result};

pub async fn traceroute(host: &str, _max_hops: u32) -> Result<NetworkTestResult> {
    let _result = NetworkTestResult::new(TestKind::Traceroute, TestMode::Basic, host);
    Err(LinkSightError::NotImplemented(
        "traceroute wrapper is scaffolded but not yet implemented".into(),
    ))
}
