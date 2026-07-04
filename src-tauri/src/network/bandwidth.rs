//! Bandwidth measurement (Advanced Mode) — `iperf3` external binary wrapper.
//!
//! Requires a reachable iperf3 server (or a future LinkSight Agent running the
//! server side). Skeleton returns the shared result schema; the real
//! implementation will run `iperf3 -c <host> -J` and map the JSON report onto
//! [`super::model::TestSummary::bandwidth_mbps`].

use super::model::{NetworkTestResult, TestKind, TestMode};
use crate::error::{LinkSightError, Result};

pub async fn iperf3_client(host: &str, _port: u16) -> Result<NetworkTestResult> {
    let _result = NetworkTestResult::new(TestKind::Iperf, TestMode::Advanced, host);
    Err(LinkSightError::NotImplemented(
        "iperf3 bandwidth wrapper is scaffolded but not yet implemented".into(),
    ))
}
