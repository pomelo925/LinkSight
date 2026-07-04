//! Internet speed test (Basic Mode) — measures the local machine's
//! download / upload throughput and latency against Cloudflare's public speed
//! endpoints (`speed.cloudflare.com`).
//!
//! No account or API key required. Progress is streamed to the frontend through
//! a Tauri [`Channel`] in three phases: `latency → download → upload → done`.

use std::time::Instant;

use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::model::{TestKind, TestMode, TestStatus};
use crate::error::{LinkSightError, Result};

const DOWN_URL: &str = "https://speed.cloudflare.com/__down";
const UP_URL: &str = "https://speed.cloudflare.com/__up";

// Payload sizes (bytes). Balanced for reasonable duration on typical links.
const DOWNLOAD_BYTES: usize = 25_000_000; // 25 MB
const UPLOAD_BYTES: usize = 10_000_000; // 10 MB
const UPLOAD_CHUNK: usize = 256 * 1024; // 256 KB per streamed chunk
const LATENCY_SAMPLES: usize = 5;
// Emit at most one progress update per this fraction advanced (avoids flooding).
const PROGRESS_STEP: f64 = 0.02;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedtestResult {
    pub id: String,
    pub kind: TestKind,
    pub mode: TestMode,
    pub target: String,
    pub status: TestStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    pub latency_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub error: Option<String>,
}

/// Streamed progress event. `phase` is one of `latency|download|upload|done`;
/// `progress` is 0.0–1.0 within the current phase. Metric fields are filled in
/// as they become available.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedtestProgress {
    pub phase: String,
    pub progress: f64,
    pub latency_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
}

impl SpeedtestProgress {
    fn phase(phase: &str, progress: f64) -> Self {
        Self {
            phase: phase.to_string(),
            progress,
            latency_ms: None,
            jitter_ms: None,
            download_mbps: None,
            upload_mbps: None,
        }
    }
}

fn emit(ch: &Channel<SpeedtestProgress>, p: SpeedtestProgress) {
    let _ = ch.send(p);
}

pub async fn speedtest(on_progress: Channel<SpeedtestProgress>) -> Result<SpeedtestResult> {
    let id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| LinkSightError::CommandFailed(format!("http client init failed: {e}")))?;

    let mut result = SpeedtestResult {
        id,
        kind: TestKind::SpeedTest,
        mode: TestMode::Basic,
        target: "speed.cloudflare.com".to_string(),
        status: TestStatus::Running,
        started_at,
        duration_ms: 0,
        download_mbps: None,
        upload_mbps: None,
        latency_ms: None,
        jitter_ms: None,
        error: None,
    };

    // ---- Latency + jitter --------------------------------------------------
    emit(&on_progress, SpeedtestProgress::phase("latency", 0.0));
    match measure_latency(&client, &on_progress).await {
        Ok((avg, jitter)) => {
            result.latency_ms = Some(avg);
            result.jitter_ms = Some(jitter);
            let mut p = SpeedtestProgress::phase("latency", 1.0);
            p.latency_ms = Some(avg);
            p.jitter_ms = Some(jitter);
            emit(&on_progress, p);
        }
        Err(e) => tracing::warn!("latency measurement failed: {e}"),
    }

    // ---- Download ----------------------------------------------------------
    emit(&on_progress, SpeedtestProgress::phase("download", 0.0));
    match measure_download(&client, &on_progress).await {
        Ok(mbps) => {
            result.download_mbps = Some(mbps);
            let mut p = SpeedtestProgress::phase("download", 1.0);
            p.download_mbps = Some(mbps);
            emit(&on_progress, p);
        }
        Err(e) => {
            result.status = TestStatus::Failed;
            result.error = Some(format!("download failed: {e}"));
            result.duration_ms = start.elapsed().as_millis() as u64;
            emit(&on_progress, SpeedtestProgress::phase("done", 1.0));
            return Ok(result);
        }
    }

    // ---- Upload ------------------------------------------------------------
    emit(&on_progress, SpeedtestProgress::phase("upload", 0.0));
    match measure_upload(&client, &on_progress).await {
        Ok(mbps) => {
            result.upload_mbps = Some(mbps);
            let mut p = SpeedtestProgress::phase("upload", 1.0);
            p.upload_mbps = Some(mbps);
            emit(&on_progress, p);
        }
        Err(e) => tracing::warn!("upload measurement failed: {e}"),
    }

    result.status = TestStatus::Success;
    result.duration_ms = start.elapsed().as_millis() as u64;

    let mut done = SpeedtestProgress::phase("done", 1.0);
    done.latency_ms = result.latency_ms;
    done.jitter_ms = result.jitter_ms;
    done.download_mbps = result.download_mbps;
    done.upload_mbps = result.upload_mbps;
    emit(&on_progress, done);

    Ok(result)
}

async fn measure_latency(
    client: &reqwest::Client,
    ch: &Channel<SpeedtestProgress>,
) -> Result<(f64, f64)> {
    let mut samples = Vec::with_capacity(LATENCY_SAMPLES);
    for i in 0..LATENCY_SAMPLES {
        let t = Instant::now();
        let resp = client
            .get(format!("{DOWN_URL}?bytes=0"))
            .send()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        let _ = resp
            .bytes()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        samples.push(t.elapsed().as_secs_f64() * 1000.0);
        emit(
            ch,
            SpeedtestProgress::phase("latency", (i + 1) as f64 / LATENCY_SAMPLES as f64),
        );
    }

    let avg = samples.iter().sum::<f64>() / samples.len() as f64;
    // Jitter = mean absolute difference between consecutive samples.
    let jitter = if samples.len() > 1 {
        let diffs: f64 = samples.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f64>();
        diffs / (samples.len() - 1) as f64
    } else {
        0.0
    };
    Ok((avg, jitter))
}

async fn measure_download(
    client: &reqwest::Client,
    ch: &Channel<SpeedtestProgress>,
) -> Result<f64> {
    let t = Instant::now();
    let resp = client
        .get(format!("{DOWN_URL}?bytes={DOWNLOAD_BYTES}"))
        .send()
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

    let mut stream = resp.bytes_stream();
    let mut received: usize = 0;
    let mut last_emit = 0.0_f64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        received += chunk.len();

        let progress = (received as f64 / DOWNLOAD_BYTES as f64).min(1.0);
        if progress - last_emit >= PROGRESS_STEP {
            last_emit = progress;
            let secs = t.elapsed().as_secs_f64();
            let mut p = SpeedtestProgress::phase("download", progress);
            p.download_mbps = Some(mbps(received, secs));
            emit(ch, p);
        }
    }

    let secs = t.elapsed().as_secs_f64();
    Ok(mbps(received, secs))
}

async fn measure_upload(client: &reqwest::Client, ch: &Channel<SpeedtestProgress>) -> Result<f64> {
    let t = Instant::now();
    let ch = ch.clone();
    let mut sent: usize = 0;
    let mut last_emit = 0.0_f64;

    // Stream the payload in fixed-size chunks so upload progress can be
    // reported as the body is consumed by the client.
    let stream = futures_util::stream::iter((0..UPLOAD_BYTES).step_by(UPLOAD_CHUNK).map(
        move |offset| {
            let len = UPLOAD_CHUNK.min(UPLOAD_BYTES - offset);
            sent += len;
            let progress = (sent as f64 / UPLOAD_BYTES as f64).min(1.0);
            if progress - last_emit >= PROGRESS_STEP {
                last_emit = progress;
                emit(&ch, SpeedtestProgress::phase("upload", progress));
            }
            Ok::<Bytes, std::io::Error>(Bytes::from(vec![0u8; len]))
        },
    ));

    let resp = client
        .post(UP_URL)
        .header(reqwest::header::CONTENT_LENGTH, UPLOAD_BYTES)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
    // Drain response so timing includes the full request/response cycle.
    let _ = resp.bytes().await;
    let secs = t.elapsed().as_secs_f64();
    Ok(mbps(UPLOAD_BYTES, secs))
}

/// Convert transferred bytes over a duration into megabits per second.
fn mbps(bytes: usize, secs: f64) -> f64 {
    if secs <= 0.0 {
        return 0.0;
    }
    (bytes as f64 * 8.0) / secs / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_mbps() {
        // 12.5 MB in 1s = 100 Mbps
        assert!((mbps(12_500_000, 1.0) - 100.0).abs() < 0.001);
        assert_eq!(mbps(1000, 0.0), 0.0);
    }
}
