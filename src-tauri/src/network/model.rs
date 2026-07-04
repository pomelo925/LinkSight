//! Shared result schema.
//!
//! Every diagnostic — Basic Mode (ping/traceroute/scan/speedtest) and
//! Advanced Mode (iperf3/ssh/remote metrics) — returns a `NetworkTestResult`.
//! This is the single contract between the Rust core and the React frontend
//! (see `src/lib/types.ts`), so the UI renders any test through one component.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TestKind {
    Ping,
    Traceroute,
    Scan,
    SpeedTest,
    Iperf,
    Latency,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TestMode {
    Basic,
    Advanced,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Idle,
    Running,
    Analyzing,
    Success,
    Failed,
}

/// Normalized metrics common to every test kind. Fields not relevant to a
/// given test are left `None`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSummary {
    pub rtt_min_ms: Option<f64>,
    pub rtt_avg_ms: Option<f64>,
    pub rtt_max_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub packet_loss_pct: Option<f64>,
    pub bandwidth_mbps: Option<f64>,
    pub hops: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTestResult {
    pub id: String,
    pub kind: TestKind,
    pub mode: TestMode,
    pub target: String,
    pub status: TestStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub summary: TestSummary,
    /// Raw tool output for the details view.
    pub raw: Option<String>,
    pub error: Option<String>,
}

impl NetworkTestResult {
    pub fn new(kind: TestKind, mode: TestMode, target: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            kind,
            mode,
            target: target.into(),
            status: TestStatus::Running,
            started_at: chrono::Utc::now().to_rfc3339(),
            duration_ms: 0,
            summary: TestSummary::default(),
            raw: None,
            error: None,
        }
    }
}
