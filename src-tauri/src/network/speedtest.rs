//! Internet speed test (Basic Mode) — measures the local machine's
//! download / upload throughput and latency against Cloudflare's public speed
//! endpoints (`speed.cloudflare.com`).
//!
//! Progress is streamed through a Tauri [`Channel`] in phases:
//! `latency → download → upload → done`. Both directions share the same staged
//! ramp-up engine; only the HTTP transport and tail payload sizes differ.

use std::time::Instant;

use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::model::{TestKind, TestMode, TestStatus};
use crate::error::{LinkSightError, Result};

const DOWN_URL: &str = "https://speed.cloudflare.com/__down";
const UP_URL: &str = "https://speed.cloudflare.com/__up";

/// Shared ramp-up stages (Cloudflare Speed Test — identical for both directions).
const SHARED_STAGES: &[usize] = &[100_000, 1_000_000, 10_000_000, 25_000_000];
const SHARED_STAGE_REPS: &[u32] = &[10, 8, 6, 4];
/// Download-only tail stages (Cloudflare: 100 MB × 3, 250 MB × 2).
const DOWNLOAD_TAIL_STAGES: &[usize] = &[100_000_000, 250_000_000];
const DOWNLOAD_TAIL_REPS: &[u32] = &[3, 2];
/// Upload-only tail stage (Cloudflare: 50 MB × 3).
const UPLOAD_TAIL_STAGES: &[usize] = &[50_000_000];
const UPLOAD_TAIL_REPS: &[u32] = &[3];

const DOWNLOAD_STAGES: &[usize] = &[
    100_000,
    1_000_000,
    10_000_000,
    25_000_000,
    100_000_000,
    250_000_000,
];
const UPLOAD_STAGES: &[usize] = &[
    100_000,
    1_000_000,
    10_000_000,
    25_000_000,
    50_000_000,
];
const DOWNLOAD_STAGE_REPS: &[u32] = &[10, 8, 6, 4, 3, 2];
const UPLOAD_STAGE_REPS: &[u32] = &[10, 8, 6, 4, 3];
const UPLOAD_CHUNK: usize = 1024 * 1024;
const LATENCY_SAMPLES: usize = 5;
const MIN_HEADLINE_STAGE_BYTES: u64 = 10_000_000;
/// Cloudflare Speed Test default: 90th percentile of bandwidth samples.
const BANDWIDTH_PERCENTILE: f64 = 0.9;
/// Ignore transfers shorter than this when scoring bandwidth (Cloudflare default: 10 ms).
const BANDWIDTH_MIN_REQUEST_MS: f64 = 10.0;
/// Stop further stages once a qualifying transfer runs this long (Cloudflare-style ramp-up).
const BANDWIDTH_FINISH_REQUEST_MS: f64 = 750.0;

struct TransferResult {
    mbps: f64,
    duration_ms: f64,
}

struct BandwidthProfile {
    stages: &'static [usize],
    reps: &'static [u32],
}

#[derive(Clone, Copy)]
enum BandwidthDirection {
    Download,
    Upload,
}

impl BandwidthDirection {
    fn profile(self) -> BandwidthProfile {
        match self {
            Self::Download => BandwidthProfile {
                stages: DOWNLOAD_STAGES,
                reps: DOWNLOAD_STAGE_REPS,
            },
            Self::Upload => BandwidthProfile {
                stages: UPLOAD_STAGES,
                reps: UPLOAD_STAGE_REPS,
            },
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Download => "download",
            Self::Upload => "upload",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedStageResult {
    pub label: String,
    pub bytes: u64,
    pub samples_mbps: Vec<f64>,
}

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
    pub download_latency_ms: Option<f64>,
    pub upload_latency_ms: Option<f64>,
    pub download_jitter_ms: Option<f64>,
    pub upload_jitter_ms: Option<f64>,
    #[serde(default)]
    pub download_stages: Vec<SpeedStageResult>,
    #[serde(default)]
    pub upload_stages: Vec<SpeedStageResult>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub direction: String,
    pub stage_label: String,
    pub stage_index: u32,
    pub stage_count: u32,
    pub sample_index: u32,
    pub mbps: f64,
    pub stage_done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedtestProgress {
    pub phase: String,
    pub progress: f64,
    pub latency_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_jitter_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_jitter_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample: Option<SpeedSample>,
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
            download_latency_ms: None,
            upload_latency_ms: None,
            download_jitter_ms: None,
            upload_jitter_ms: None,
            sample: None,
        }
    }
}

fn emit(ch: &Channel<SpeedtestProgress>, p: SpeedtestProgress) {
    let _ = ch.send(p);
}

fn size_label(bytes: usize) -> String {
    if bytes >= 1_000_000 {
        format!("{}MB", bytes / 1_000_000)
    } else if bytes >= 1_000 {
        format!("{}kB", bytes / 1_000)
    } else {
        format!("{bytes}B")
    }
}

fn jitter_from_samples(samples: &[f64]) -> f64 {
    if samples.len() <= 1 {
        return 0.0;
    }
    let diffs: f64 = samples.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
    diffs / (samples.len() - 1) as f64
}

fn percentile_f64(values: &[f64], p: f64) -> Option<f64> {
    let mut sorted: Vec<f64> = values
        .iter()
        .copied()
        .filter(|v| *v > 0.0 && v.is_finite())
        .collect();
    if sorted.is_empty() {
        return None;
    }
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    if sorted.len() == 1 {
        return Some(sorted[0]);
    }
    let rank = p * (sorted.len() - 1) as f64;
    let lo = rank.floor() as usize;
    let hi = rank.ceil() as usize;
    if lo == hi {
        return Some(sorted[lo]);
    }
    let frac = rank - lo as f64;
    Some(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
}

fn sample_duration_ms(bytes: u64, mbps: f64) -> f64 {
    if mbps <= 0.0 || !mbps.is_finite() {
        return 0.0;
    }
    (bytes as f64 * 8.0) / (mbps * 1000.0)
}

fn good_bandwidth_samples(stage: &SpeedStageResult) -> Vec<f64> {
    stage
        .samples_mbps
        .iter()
        .copied()
        .filter(|&mbps| {
            mbps > 0.0
                && mbps.is_finite()
                && sample_duration_ms(stage.bytes, mbps) >= BANDWIDTH_MIN_REQUEST_MS
        })
        .collect()
}

fn headline_from_stages(stages: &[SpeedStageResult], min_bytes: u64) -> Option<f64> {
    let mut eligible: Vec<&SpeedStageResult> = stages
        .iter()
        .filter(|s| s.bytes >= min_bytes && !s.samples_mbps.is_empty())
        .collect();
    if eligible.is_empty() {
        return None;
    }
    eligible.sort_by_key(|s| s.bytes);

    // Prefer the largest stage — ramp-up sizes under-report on fast links.
    for stage in eligible.iter().rev() {
        let samples = good_bandwidth_samples(stage);
        if let Some(rate) = percentile_f64(&samples, BANDWIDTH_PERCENTILE) {
            return Some(rate);
        }
    }
    None
}

fn live_headline_mbps(
    completed: &[SpeedStageResult],
    current_label: &str,
    current_bytes: u64,
    current_samples: &[f64],
) -> f64 {
    let mut stages = completed.to_vec();
    if !current_samples.is_empty() {
        stages.push(SpeedStageResult {
            label: current_label.to_string(),
            bytes: current_bytes,
            samples_mbps: current_samples.to_vec(),
        });
    }
    best_throughput_mbps(&stages).unwrap_or(0.0)
}

/// Final headline: 90th percentile of samples from the largest qualifying stage
/// (matches Cloudflare Speed Test `bandwidthPercentile` default).
fn best_throughput_mbps(stages: &[SpeedStageResult]) -> Option<f64> {
    headline_from_stages(stages, MIN_HEADLINE_STAGE_BYTES)
        .or_else(|| headline_from_stages(stages, 1_000_000))
        .or_else(|| {
            stages.iter().rev().find_map(|stage| {
                percentile_f64(&good_bandwidth_samples(stage), BANDWIDTH_PERCENTILE)
            })
        })
}

pub async fn speedtest(on_progress: Channel<SpeedtestProgress>) -> Result<SpeedtestResult> {
    let id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
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
        download_latency_ms: None,
        upload_latency_ms: None,
        download_jitter_ms: None,
        upload_jitter_ms: None,
        download_stages: Vec::new(),
        upload_stages: Vec::new(),
        error: None,
    };

    // ---- Latency + jitter (download & upload directions) -------------------
    emit(&on_progress, SpeedtestProgress::phase("latency", 0.0));
    match measure_download_latency(&client, &on_progress).await {
        Ok((avg, jitter)) => {
            result.download_latency_ms = Some(avg);
            result.download_jitter_ms = Some(jitter);
        }
        Err(e) => tracing::warn!("download latency failed: {e}"),
    }

    match measure_upload_latency(&client, &on_progress).await {
        Ok((avg, jitter)) => {
            result.upload_latency_ms = Some(avg);
            result.upload_jitter_ms = Some(jitter);
        }
        Err(e) => tracing::warn!("upload latency failed: {e}"),
    }

    let dl_lat = result.download_latency_ms;
    let ul_lat = result.upload_latency_ms;
    let dl_jit = result.download_jitter_ms;
    let ul_jit = result.upload_jitter_ms;

    if dl_lat.is_some() || ul_lat.is_some() {
        let lats: Vec<f64> = [dl_lat, ul_lat].into_iter().flatten().collect();
        result.latency_ms = Some(lats.iter().sum::<f64>() / lats.len() as f64);
    }
    if dl_jit.is_some() || ul_jit.is_some() {
        let jits: Vec<f64> = [dl_jit, ul_jit].into_iter().flatten().collect();
        result.jitter_ms = Some(jits.iter().sum::<f64>() / jits.len() as f64);
    }

    let mut latency_done = SpeedtestProgress::phase("latency", 1.0);
    latency_done.latency_ms = result.latency_ms;
    latency_done.jitter_ms = result.jitter_ms;
    latency_done.download_latency_ms = result.download_latency_ms;
    latency_done.upload_latency_ms = result.upload_latency_ms;
    latency_done.download_jitter_ms = result.download_jitter_ms;
    latency_done.upload_jitter_ms = result.upload_jitter_ms;
    emit(&on_progress, latency_done);

    // ---- Download (staged) -------------------------------------------------
    match run_bandwidth_phase(&client, &on_progress, BandwidthDirection::Download).await {
        Ok((mbps, stages)) => {
            result.download_mbps = Some(mbps);
            result.download_stages = stages;
        }
        Err(e) => {
            result.status = TestStatus::Failed;
            result.error = Some(format!("download failed: {e}"));
            result.duration_ms = start.elapsed().as_millis() as u64;
            emit(&on_progress, SpeedtestProgress::phase("done", 1.0));
            return Ok(result);
        }
    }

    // ---- Upload (staged) ---------------------------------------------------
    match run_bandwidth_phase(&client, &on_progress, BandwidthDirection::Upload).await {
        Ok((mbps, stages)) => {
            result.upload_mbps = Some(mbps);
            result.upload_stages = stages;
        }
        Err(e) => tracing::warn!("upload measurement failed: {e}"),
    }

    result.status = TestStatus::Success;
    result.duration_ms = start.elapsed().as_millis() as u64;

    let mut done = SpeedtestProgress::phase("done", 1.0);
    done.latency_ms = result.latency_ms;
    done.jitter_ms = result.jitter_ms;
    done.download_latency_ms = result.download_latency_ms;
    done.upload_latency_ms = result.upload_latency_ms;
    done.download_jitter_ms = result.download_jitter_ms;
    done.upload_jitter_ms = result.upload_jitter_ms;
    done.download_mbps = result.download_mbps;
    done.upload_mbps = result.upload_mbps;
    emit(&on_progress, done);

    Ok(result)
}

async fn measure_download_latency(
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

        let mut p = SpeedtestProgress::phase(
            "latency",
            (i + 1) as f64 / (LATENCY_SAMPLES * 2) as f64,
        );
        p.download_latency_ms = Some(samples.iter().sum::<f64>() / samples.len() as f64);
        p.download_jitter_ms = Some(jitter_from_samples(&samples));
        emit(ch, p);
    }

    let avg = samples.iter().sum::<f64>() / samples.len() as f64;
    Ok((avg, jitter_from_samples(&samples)))
}

async fn measure_upload_latency(
    client: &reqwest::Client,
    ch: &Channel<SpeedtestProgress>,
) -> Result<(f64, f64)> {
    let mut samples = Vec::with_capacity(LATENCY_SAMPLES);
    for i in 0..LATENCY_SAMPLES {
        let t = Instant::now();
        let resp = client
            .post(UP_URL)
            .header(reqwest::header::CONTENT_LENGTH, 0)
            .body(Bytes::new())
            .send()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        let _ = resp
            .bytes()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        samples.push(t.elapsed().as_secs_f64() * 1000.0);

        let mut p = SpeedtestProgress::phase(
            "latency",
            0.5 + (i + 1) as f64 / (LATENCY_SAMPLES * 2) as f64,
        );
        p.upload_latency_ms = Some(samples.iter().sum::<f64>() / samples.len() as f64);
        p.upload_jitter_ms = Some(jitter_from_samples(&samples));
        emit(ch, p);
    }

    let avg = samples.iter().sum::<f64>() / samples.len() as f64;
    Ok((avg, jitter_from_samples(&samples)))
}

fn scheduled_bytes(stages: &[usize], reps: &[u32]) -> u64 {
    stages
        .iter()
        .zip(reps.iter())
        .map(|(&size, &count)| size as u64 * count as u64)
        .sum()
}

fn bandwidth_direction_saturated(bytes: usize, duration_ms: f64) -> bool {
    bytes >= MIN_HEADLINE_STAGE_BYTES as usize && duration_ms >= BANDWIDTH_FINISH_REQUEST_MS
}

fn transfer_result(bytes: usize, duration_ms: f64) -> TransferResult {
    TransferResult {
        mbps: if duration_ms > 0.0 {
            mbps(bytes, duration_ms / 1000.0)
        } else {
            0.0
        },
        duration_ms,
    }
}

/// One full download of `size` bytes; timed from first payload byte received.
async fn measure_download_once(client: &reqwest::Client, size: usize) -> Result<TransferResult> {
    let resp = client
        .get(format!("{DOWN_URL}?bytes={size}"))
        .send()
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

    let mut transfer_start: Option<Instant> = None;
    let mut stream = resp.bytes_stream();
    let mut received = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        if !chunk.is_empty() && transfer_start.is_none() {
            transfer_start = Some(Instant::now());
        }
        received += chunk.len();
    }

    let Some(start) = transfer_start else {
        return Ok(transfer_result(0, 0.0));
    };
    if received == 0 {
        return Ok(transfer_result(0, 0.0));
    }
    Ok(transfer_result(
        received,
        start.elapsed().as_secs_f64() * 1000.0,
    ))
}

/// One full upload of `size` bytes; timed from first payload byte sent until
/// the request body is fully uploaded (server response wait is excluded).
async fn measure_upload_once(client: &reqwest::Client, size: usize) -> Result<TransferResult> {
    use std::sync::{Arc, Mutex};

    let transfer_start: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
    let ts = transfer_start.clone();
    let total = size;

    let stream = futures_util::stream::unfold(0usize, move |offset| {
        let ts = ts.clone();
        async move {
            if offset >= total {
                return None;
            }
            let len = UPLOAD_CHUNK.min(total - offset);
            let next = offset + len;
            if offset == 0 {
                if let Ok(mut g) = ts.lock() {
                    if g.is_none() {
                        *g = Some(Instant::now());
                    }
                }
            }
            Some((Ok::<Bytes, std::io::Error>(upload_payload_chunk(len)), next))
        }
    });

    let resp = client
        .post(UP_URL)
        .header(reqwest::header::CONTENT_LENGTH, size)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

    let duration_ms = transfer_start
        .lock()
        .ok()
        .and_then(|g| *g)
        .map(|t| t.elapsed().as_secs_f64() * 1000.0)
        .unwrap_or(0.0);

    let _ = resp
        .bytes()
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

    Ok(transfer_result(size, duration_ms))
}

fn upload_payload_chunk(len: usize) -> Bytes {
    static CHUNK: std::sync::OnceLock<Bytes> = std::sync::OnceLock::new();
    let chunk = CHUNK.get_or_init(|| Bytes::from(vec![0u8; UPLOAD_CHUNK]));
    if len == UPLOAD_CHUNK {
        chunk.clone()
    } else {
        chunk.slice(0..len)
    }
}

async fn measure_transfer(
    client: &reqwest::Client,
    direction: BandwidthDirection,
    size: usize,
) -> Result<TransferResult> {
    match direction {
        BandwidthDirection::Download => measure_download_once(client, size).await,
        BandwidthDirection::Upload => measure_upload_once(client, size).await,
    }
}

async fn run_bandwidth_phase(
    client: &reqwest::Client,
    ch: &Channel<SpeedtestProgress>,
    direction: BandwidthDirection,
) -> Result<(f64, Vec<SpeedStageResult>)> {
    emit(ch, SpeedtestProgress::phase(direction.label(), 0.0));
    let (mbps, stages) = measure_bandwidth_staged(client, ch, direction).await?;
    let mut done = SpeedtestProgress::phase(direction.label(), 1.0);
    match direction {
        BandwidthDirection::Download => done.download_mbps = Some(mbps),
        BandwidthDirection::Upload => done.upload_mbps = Some(mbps),
    }
    emit(ch, done);
    Ok((mbps, stages))
}

async fn measure_bandwidth_staged(
    client: &reqwest::Client,
    ch: &Channel<SpeedtestProgress>,
    direction: BandwidthDirection,
) -> Result<(f64, Vec<SpeedStageResult>)> {
    let profile = direction.profile();
    let stages = profile.stages;
    let reps = profile.reps;
    let stage_count = stages.len() as u32;
    let total_bytes = scheduled_bytes(stages, reps).max(1) as f64;
    let mut bytes_done = 0u64;
    let mut stage_results = Vec::new();

    for (stage_idx, (&size, &target_reps)) in stages.iter().zip(reps.iter()).enumerate() {
        let label = size_label(size);
        let mut samples = Vec::with_capacity(target_reps as usize);
        let mut saturated = false;

        for sample_idx in 0..target_reps {
            let transfer = measure_transfer(client, direction, size).await?;
            bytes_done += size as u64;

            if transfer.mbps > 0.0 {
                samples.push(transfer.mbps);
            }

            let headline = live_headline_mbps(&stage_results, &label, size as u64, &samples);
            emit_sample(
                ch,
                direction,
                &label,
                stage_idx as u32,
                stage_count,
                sample_idx,
                transfer.mbps,
                sample_idx + 1 == target_reps,
                bytes_done as f64 / total_bytes,
                headline,
            );

            if bandwidth_direction_saturated(size, transfer.duration_ms) {
                saturated = true;
                break;
            }
        }

        stage_results.push(SpeedStageResult {
            label,
            bytes: size as u64,
            samples_mbps: samples,
        });

        if saturated {
            break;
        }
    }

    let final_mbps = best_throughput_mbps(&stage_results).unwrap_or(0.0);
    Ok((final_mbps, stage_results))
}

#[allow(clippy::too_many_arguments)]
fn emit_sample(
    ch: &Channel<SpeedtestProgress>,
    direction: BandwidthDirection,
    stage_label: &str,
    stage_index: u32,
    stage_count: u32,
    sample_index: u32,
    rate: f64,
    stage_done: bool,
    progress: f64,
    headline_mbps: f64,
) {
    let direction_label = direction.label();
    let mut p = SpeedtestProgress::phase(direction_label, progress);
    match direction {
        BandwidthDirection::Download => p.download_mbps = Some(headline_mbps),
        BandwidthDirection::Upload => p.upload_mbps = Some(headline_mbps),
    }
    p.sample = Some(SpeedSample {
        direction: direction_label.to_string(),
        stage_label: stage_label.to_string(),
        stage_index,
        stage_count,
        sample_index,
        mbps: rate,
        stage_done,
    });
    emit(ch, p);
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
        assert!((mbps(12_500_000, 1.0) - 100.0).abs() < 0.001);
        assert_eq!(mbps(1000, 0.0), 0.0);
        // No artificial cap — 100 MB in 1 s is 800 Mbps by physics, not clamping.
        assert!((mbps(100_000_000, 1.0) - 800.0).abs() < 0.001);
    }

    #[test]
    fn headline_uses_largest_stage_p90() {
        let stages = vec![
            SpeedStageResult {
                label: "100kB".into(),
                bytes: 100_000,
                samples_mbps: vec![12.0, 18.0, 15.0, 20.0, 14.0, 16.0, 19.0, 17.0, 13.0, 11.0],
            },
            SpeedStageResult {
                label: "10MB".into(),
                bytes: 10_000_000,
                samples_mbps: vec![72.0, 78.0, 81.0, 80.0, 79.0, 77.0],
            },
            SpeedStageResult {
                label: "25MB".into(),
                bytes: 25_000_000,
                samples_mbps: vec![95.0, 98.0, 100.0, 97.0],
            },
        ];
        let headline = best_throughput_mbps(&stages).unwrap();
        // p90 of the largest (25 MB) stage, not the median of per-stage medians.
        assert!(headline > 97.0 && headline < 101.0, "got {headline}");
    }

    #[test]
    fn ignores_short_warmup_samples() {
        let stage = SpeedStageResult {
            label: "100kB".into(),
            bytes: 100_000,
            samples_mbps: vec![500.0, 600.0],
        };
        assert!(good_bandwidth_samples(&stage).is_empty());
    }

    #[test]
    fn download_upload_share_warmup_profile() {
        assert_eq!(&DOWNLOAD_STAGES[..SHARED_STAGES.len()], SHARED_STAGES);
        assert_eq!(&UPLOAD_STAGES[..SHARED_STAGES.len()], SHARED_STAGES);
        assert_eq!(
            &DOWNLOAD_STAGE_REPS[..SHARED_STAGE_REPS.len()],
            SHARED_STAGE_REPS
        );
        assert_eq!(
            &UPLOAD_STAGE_REPS[..SHARED_STAGE_REPS.len()],
            SHARED_STAGE_REPS
        );
        assert_eq!(DOWNLOAD_TAIL_STAGES, &DOWNLOAD_STAGES[SHARED_STAGES.len()..]);
        assert_eq!(DOWNLOAD_TAIL_REPS, &DOWNLOAD_STAGE_REPS[SHARED_STAGE_REPS.len()..]);
        assert_eq!(UPLOAD_TAIL_STAGES, &UPLOAD_STAGES[SHARED_STAGES.len()..]);
        assert_eq!(UPLOAD_TAIL_REPS, &UPLOAD_STAGE_REPS[SHARED_STAGE_REPS.len()..]);
    }

    #[test]
    fn stage_rep_counts_match_cloudflare() {
        assert_eq!(DOWNLOAD_STAGE_REPS.len(), DOWNLOAD_STAGES.len());
        assert_eq!(UPLOAD_STAGE_REPS.len(), UPLOAD_STAGES.len());
        assert_eq!(DOWNLOAD_STAGE_REPS[0], 10);
        assert_eq!(DOWNLOAD_STAGE_REPS[5], 2);
    }

    #[test]
    fn formats_size_label() {
        assert_eq!(size_label(100_000), "100kB");
        assert_eq!(size_label(1_000_000), "1MB");
    }

    #[test]
    fn saturates_after_long_headline_transfer() {
        assert!(bandwidth_direction_saturated(10_000_000, 800.0));
        assert!(!bandwidth_direction_saturated(10_000_000, 500.0));
        assert!(!bandwidth_direction_saturated(1_000_000, 800.0));
    }

    #[test]
    fn upload_progress_weights_large_stages() {
        let total = scheduled_bytes(UPLOAD_STAGES, UPLOAD_STAGE_REPS);
        let tail = 50_000_000u64 * UPLOAD_STAGE_REPS[UPLOAD_STAGE_REPS.len() - 1] as u64;
        assert!(tail * 100 / total > 40, "tail={tail} total={total}");
    }
}
