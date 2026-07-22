//! Connectivity test (Advanced Mode) — comprehensive local ↔ remote-host
//! diagnostics with staged, live progress.
//!
//! Measured phases (streamed to the frontend via a Tauri [`Channel`]):
//!   handshake → ping → mtu → traceroute → uplink → downlink → done
//!
//! - RTT (min/avg/max), delay, jitter, packet loss — local `ping` to the host.
//! - Max payload / path MTU — local `ping -M do` DF binary search.
//! - Hop count — local `traceroute`.
//! - Uplink / downlink throughput — `iperf3` client against a server launched
//!   on the remote host over SSH (requires `iperf3` on both ends).
//! - Bandwidth-delay product — derived from throughput and RTT.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tokio::process::Command;

use super::cancel::{self, CancelKind};
use super::model::{TestKind, TestMode, TestStatus};
use super::{ping, traceroute};
use crate::error::{LinkSightError, Result};
use crate::ssh::exec::{run_remote_command, SshTarget};

const DEFAULT_SSH_PORT: u16 = 22;
const DEFAULT_IPERF_PORT: u16 = 5201;
const MTU_HI: u32 = 1472; // ICMP payload for a 1500-byte Ethernet MTU (1500 - 28).
const IPERF_SERVER_WARMUP_MS: u64 = 900;

/// Tunable measurement parameters (from the Connectivity page settings panel).
/// All fields optional so the frontend can send a partial object.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivitySettings {
    pub ping_count: Option<u32>,
    pub traceroute_max_hops: Option<u32>,
    /// `up` | `down` | `both`.
    pub direction: Option<String>,
    pub iperf_streams: Option<u32>,
    /// `tcp` | `udp`.
    pub protocol: Option<String>,
    pub iperf_port: Option<u16>,
    pub duration_secs: Option<u32>,
    pub enable_handshake: Option<bool>,
    pub enable_ping: Option<bool>,
    pub enable_mtu: Option<bool>,
    pub enable_traceroute: Option<bool>,
    pub enable_throughput: Option<bool>,
}

/// Settings with defaults applied and values clamped to sane ranges.
struct ResolvedSettings {
    ping_count: u32,
    traceroute_max_hops: u32,
    run_uplink: bool,
    run_downlink: bool,
    iperf_streams: u32,
    protocol: String,
    iperf_port: u16,
    duration_secs: u32,
    enable_handshake: bool,
    enable_ping: bool,
    enable_mtu: bool,
    enable_traceroute: bool,
    enable_throughput: bool,
}

impl ConnectivitySettings {
    fn resolve(&self) -> ResolvedSettings {
        let direction = self.direction.as_deref().unwrap_or("both");
        let protocol = match self.protocol.as_deref() {
            Some("udp") => "udp",
            _ => "tcp",
        };
        ResolvedSettings {
            ping_count: self.ping_count.unwrap_or(5).clamp(1, 50),
            traceroute_max_hops: self.traceroute_max_hops.unwrap_or(30).clamp(1, 64),
            run_uplink: matches!(direction, "up" | "both"),
            run_downlink: matches!(direction, "down" | "both"),
            iperf_streams: self.iperf_streams.unwrap_or(1).clamp(1, 128),
            protocol: protocol.to_string(),
            iperf_port: effective_port(self.iperf_port, DEFAULT_IPERF_PORT),
            duration_secs: self.duration_secs.unwrap_or(5).clamp(1, 30),
            enable_handshake: self.enable_handshake.unwrap_or(true),
            enable_ping: self.enable_ping.unwrap_or(true),
            enable_mtu: self.enable_mtu.unwrap_or(true),
            enable_traceroute: self.enable_traceroute.unwrap_or(true),
            enable_throughput: self.enable_throughput.unwrap_or(true),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityResult {
    pub id: String,
    pub kind: TestKind,
    pub mode: TestMode,
    pub target: String,
    pub status: TestStatus,
    pub started_at: String,
    pub duration_ms: u64,

    pub rtt_min_ms: Option<f64>,
    pub rtt_avg_ms: Option<f64>,
    pub rtt_max_ms: Option<f64>,
    pub delay_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub packet_loss_pct: Option<f64>,
    pub max_payload_bytes: Option<u32>,
    pub path_mtu_bytes: Option<u32>,
    pub hops: Option<u32>,
    pub handshake_ms: Option<f64>,
    pub uplink_mbps: Option<f64>,
    pub downlink_mbps: Option<f64>,
    pub bdp_bytes: Option<f64>,

    pub raw: Option<String>,
    pub error: Option<String>,
}

/// Live progress event. `phase` names the active measurement; `progress` is
/// 0.0–1.0 within it. Metric fields are filled in as they become known and are
/// merged on the frontend so earlier values stay visible.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityProgress {
    pub phase: String,
    pub progress: f64,
    pub rtt_min_ms: Option<f64>,
    pub rtt_avg_ms: Option<f64>,
    pub rtt_max_ms: Option<f64>,
    pub delay_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub packet_loss_pct: Option<f64>,
    pub max_payload_bytes: Option<u32>,
    pub path_mtu_bytes: Option<u32>,
    pub hops: Option<u32>,
    pub handshake_ms: Option<f64>,
    pub uplink_mbps: Option<f64>,
    pub downlink_mbps: Option<f64>,
    pub bdp_bytes: Option<f64>,
    /// Non-fatal note for the phase (e.g. "iperf3 not found on remote").
    pub note: Option<String>,
}

impl ConnectivityProgress {
    fn phase(phase: &str, progress: f64) -> Self {
        Self {
            phase: phase.to_string(),
            progress,
            rtt_min_ms: None,
            rtt_avg_ms: None,
            rtt_max_ms: None,
            delay_ms: None,
            jitter_ms: None,
            packet_loss_pct: None,
            max_payload_bytes: None,
            path_mtu_bytes: None,
            hops: None,
            handshake_ms: None,
            uplink_mbps: None,
            downlink_mbps: None,
            bdp_bytes: None,
            note: None,
        }
    }
}

fn emit(ch: &Channel<ConnectivityProgress>, p: ConnectivityProgress) {
    let _ = ch.send(p);
}

fn effective_port(port: Option<u16>, default: u16) -> u16 {
    port.filter(|&p| p > 0).unwrap_or(default)
}

/// Reject injection-prone hosts (we shell out to ping / traceroute / iperf3).
fn validate_ip(host: &str) -> Result<()> {
    if host.trim().is_empty() {
        return Err(LinkSightError::InvalidInput("host is empty".into()));
    }
    let ok = host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '-' | '_'));
    if !ok {
        return Err(LinkSightError::InvalidInput(format!(
            "host contains invalid characters: {host}"
        )));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn connectivity_test(
    ip: &str,
    ssh_port: Option<u16>,
    username: &str,
    auth_mode: &str,
    password: Option<&str>,
    private_key_path: Option<&str>,
    settings: &ConnectivitySettings,
    on_progress: Channel<ConnectivityProgress>,
) -> Result<ConnectivityResult> {
    validate_ip(ip)?;
    if username.trim().is_empty() {
        return Err(LinkSightError::InvalidInput("username is required".into()));
    }

    let gen = cancel::begin(CancelKind::Connectivity);
    let cfg = settings.resolve();
    let ip = ip.trim().to_string();
    let ssh_port = effective_port(ssh_port, DEFAULT_SSH_PORT);
    let iperf_port = cfg.iperf_port;
    let duration = cfg.duration_secs;
    let start = Instant::now();

    let mut result = ConnectivityResult {
        id: uuid::Uuid::new_v4().to_string(),
        kind: TestKind::Iperf,
        mode: TestMode::Advanced,
        target: ip.clone(),
        status: TestStatus::Running,
        started_at: chrono::Utc::now().to_rfc3339(),
        duration_ms: 0,
        rtt_min_ms: None,
        rtt_avg_ms: None,
        rtt_max_ms: None,
        delay_ms: None,
        jitter_ms: None,
        packet_loss_pct: None,
        max_payload_bytes: None,
        path_mtu_bytes: None,
        hops: None,
        handshake_ms: None,
        uplink_mbps: None,
        downlink_mbps: None,
        bdp_bytes: None,
        raw: None,
        error: None,
    };
    let mut notes: Vec<String> = Vec::new();

    let target = SshTarget {
        addr: format!("{ip}:{ssh_port}"),
        username: username.to_string(),
        auth_mode: auth_mode.to_string(),
        password: password.map(str::to_string),
        private_key_path: private_key_path.map(str::to_string),
    };

    // ---- Handshake: TCP connect time to the SSH port ----------------------
    if cfg.enable_handshake {
        cancel::ensure(CancelKind::Connectivity, gen)?;
        emit(&on_progress, ConnectivityProgress::phase("handshake", 0.0));
        if let Some(ms) = measure_handshake(&target.addr).await {
            result.handshake_ms = Some(ms);
        }
        let mut p = ConnectivityProgress::phase("handshake", 1.0);
        p.handshake_ms = result.handshake_ms;
        emit(&on_progress, p);
    }

    // ---- Ping: RTT / delay / jitter / packet loss -------------------------
    if cfg.enable_ping {
        cancel::ensure(CancelKind::Connectivity, gen)?;
        emit(&on_progress, ConnectivityProgress::phase("ping", 0.0));
        match ping::ping(&ip, cfg.ping_count).await {
            Ok(r) => {
                let s = r.summary;
                result.rtt_min_ms = s.rtt_min_ms;
                result.rtt_avg_ms = s.rtt_avg_ms;
                result.rtt_max_ms = s.rtt_max_ms;
                result.jitter_ms = s.jitter_ms;
                result.packet_loss_pct = s.packet_loss_pct;
                result.delay_ms = s.rtt_avg_ms.map(|v| v / 2.0);
            }
            Err(e) => notes.push(format!("ping failed: {e}")),
        }
        let mut p = ConnectivityProgress::phase("ping", 1.0);
        p.rtt_min_ms = result.rtt_min_ms;
        p.rtt_avg_ms = result.rtt_avg_ms;
        p.rtt_max_ms = result.rtt_max_ms;
        p.delay_ms = result.delay_ms;
        p.jitter_ms = result.jitter_ms;
        p.packet_loss_pct = result.packet_loss_pct;
        emit(&on_progress, p);
    }

    // ---- Path MTU / max payload (DF binary search) ------------------------
    if cfg.enable_mtu {
        cancel::ensure(CancelKind::Connectivity, gen)?;
        emit(&on_progress, ConnectivityProgress::phase("mtu", 0.0));
        if let Some(payload) = measure_max_payload(&ip).await {
            result.max_payload_bytes = Some(payload);
            result.path_mtu_bytes = Some(payload + 28); // + 8 ICMP + 20 IPv4 header
        } else {
            notes.push("path MTU probe got no DF response".into());
        }
        let mut p = ConnectivityProgress::phase("mtu", 1.0);
        p.max_payload_bytes = result.max_payload_bytes;
        p.path_mtu_bytes = result.path_mtu_bytes;
        emit(&on_progress, p);
    }

    // ---- Traceroute: hop count --------------------------------------------
    if cfg.enable_traceroute {
        cancel::ensure(CancelKind::Connectivity, gen)?;
        emit(&on_progress, ConnectivityProgress::phase("traceroute", 0.0));
        match traceroute::traceroute(&ip, cfg.traceroute_max_hops).await {
            Ok(tr) => result.hops = Some(tr.hops.len() as u32),
            Err(e) => notes.push(format!("traceroute failed: {e}")),
        }
        let mut p = ConnectivityProgress::phase("traceroute", 1.0);
        p.hops = result.hops;
        emit(&on_progress, p);
    }

    // ---- Throughput via iperf3 (uplink then downlink) ---------------------
    if cfg.enable_throughput && (cfg.run_uplink || cfg.run_downlink) {
        match preflight_remote_iperf(&target).await {
            Ok(()) => {
                // Uplink: local client sends → remote receives.
                if cfg.run_uplink {
                    cancel::ensure(CancelKind::Connectivity, gen)?;
                    emit(&on_progress, ConnectivityProgress::phase("uplink", 0.0));
                    match measure_iperf(&target, &ip, iperf_port, duration, false, &cfg).await {
                        Ok(mbps) => result.uplink_mbps = Some(mbps),
                        Err(e) => notes.push(format!("uplink iperf3 failed: {e}")),
                    }
                    let mut p = ConnectivityProgress::phase("uplink", 1.0);
                    p.uplink_mbps = result.uplink_mbps;
                    emit(&on_progress, p);
                }

                // Downlink: reverse mode — remote sends → local receives.
                if cfg.run_downlink {
                    cancel::ensure(CancelKind::Connectivity, gen)?;
                    emit(&on_progress, ConnectivityProgress::phase("downlink", 0.0));
                    match measure_iperf(&target, &ip, iperf_port, duration, true, &cfg).await {
                        Ok(mbps) => result.downlink_mbps = Some(mbps),
                        Err(e) => notes.push(format!("downlink iperf3 failed: {e}")),
                    }
                    let mut p = ConnectivityProgress::phase("downlink", 1.0);
                    p.downlink_mbps = result.downlink_mbps;
                    emit(&on_progress, p);
                }
            }
            Err(e) => notes.push(e),
        }
    }

    // ---- Bandwidth-delay product ------------------------------------------
    let bandwidth = result.downlink_mbps.or(result.uplink_mbps);
    if let (Some(mbps), Some(rtt)) = (bandwidth, result.rtt_avg_ms) {
        // bits = Mbps * 1e6 * seconds; bytes = bits / 8
        result.bdp_bytes = Some(mbps * 1_000_000.0 * (rtt / 1000.0) / 8.0);
    }

    result.status = if result.rtt_avg_ms.is_some() || result.handshake_ms.is_some() {
        TestStatus::Success
    } else {
        TestStatus::Failed
    };
    if result.status == TestStatus::Failed && result.error.is_none() {
        result.error = Some("host unreachable — no ping response or SSH connection".into());
    }
    result.duration_ms = start.elapsed().as_millis() as u64;
    if !notes.is_empty() {
        result.raw = Some(notes.join("\n"));
    }

    let mut done = ConnectivityProgress::phase("done", 1.0);
    done.rtt_min_ms = result.rtt_min_ms;
    done.rtt_avg_ms = result.rtt_avg_ms;
    done.rtt_max_ms = result.rtt_max_ms;
    done.delay_ms = result.delay_ms;
    done.jitter_ms = result.jitter_ms;
    done.packet_loss_pct = result.packet_loss_pct;
    done.max_payload_bytes = result.max_payload_bytes;
    done.path_mtu_bytes = result.path_mtu_bytes;
    done.hops = result.hops;
    done.handshake_ms = result.handshake_ms;
    done.uplink_mbps = result.uplink_mbps;
    done.downlink_mbps = result.downlink_mbps;
    done.bdp_bytes = result.bdp_bytes;
    emit(&on_progress, done);

    Ok(result)
}

/// TCP connect time (ms) to the SSH port, or `None` if unreachable.
async fn measure_handshake(addr: &str) -> Option<f64> {
    let t = Instant::now();
    match tokio::time::timeout(Duration::from_secs(5), tokio::net::TcpStream::connect(addr)).await {
        Ok(Ok(_)) => Some(t.elapsed().as_secs_f64() * 1000.0),
        _ => None,
    }
}

/// Largest ICMP payload that traverses the path without fragmentation (DF set),
/// found by binary search. `None` if the host never answers a DF probe.
async fn measure_max_payload(ip: &str) -> Option<u32> {
    let mut lo: u32 = 0;
    let mut hi: u32 = MTU_HI;
    let mut best: Option<u32> = None;

    while lo <= hi {
        let mid = lo + (hi - lo) / 2;
        if ping_df(ip, mid).await {
            best = Some(mid);
            lo = mid + 1;
        } else if mid == 0 {
            break;
        } else {
            hi = mid - 1;
        }
    }
    best
}

/// Single DF ping with `size` payload bytes. Returns true if it got a reply.
async fn ping_df(ip: &str, size: u32) -> bool {
    Command::new("ping")
        .args([
            "-c",
            "1",
            "-W",
            "1",
            "-M",
            "do",
            "-s",
            &size.to_string(),
            ip,
        ])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Confirm `iperf3` is available on the remote host before running throughput.
async fn preflight_remote_iperf(target: &SshTarget) -> std::result::Result<(), String> {
    let out = run_remote_command(
        target,
        "command -v iperf3 >/dev/null 2>&1 && echo OK || echo MISSING",
        Duration::from_secs(12),
    )
    .await
    .map_err(|e| format!("remote SSH check failed: {e}"))?;

    if out.stdout.contains("OK") {
        Ok(())
    } else {
        Err("iperf3 is not installed on the remote host".into())
    }
}

/// Launch a single-shot remote iperf3 server, then run the local client.
/// `reverse` = true measures downlink (remote → local).
async fn measure_iperf(
    target: &SshTarget,
    ip: &str,
    port: u16,
    duration: u32,
    reverse: bool,
    cfg: &ResolvedSettings,
) -> std::result::Result<f64, String> {
    // `-1` makes the server handle exactly one client then exit; `timeout`
    // guarantees it is reaped even if the client never connects (self-cleaning).
    let server_timeout = duration + 15;
    let server_cmd = format!(
        "nohup timeout {server_timeout} iperf3 -s -1 -p {port} >/dev/null 2>&1 & echo started"
    );
    run_remote_command(target, &server_cmd, Duration::from_secs(12))
        .await
        .map_err(|e| format!("start remote server: {e}"))?;

    tokio::time::sleep(Duration::from_millis(IPERF_SERVER_WARMUP_MS)).await;

    let udp = cfg.protocol == "udp";
    let mut args = vec![
        "-c".to_string(),
        ip.to_string(),
        "-p".to_string(),
        port.to_string(),
        "-t".to_string(),
        duration.to_string(),
        "-J".to_string(),
    ];
    if cfg.iperf_streams > 1 {
        args.push("-P".to_string());
        args.push(cfg.iperf_streams.to_string());
    }
    if udp {
        // UDP defaults to a 1 Mbit/s cap; `-b 0` removes it to measure the
        // achievable rate (and lets iperf3 report jitter / loss).
        args.push("-u".to_string());
        args.push("-b".to_string());
        args.push("0".to_string());
    }
    if reverse {
        args.push("-R".to_string());
    }

    let output = Command::new("iperf3")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("spawn local iperf3 (is it installed?): {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: Value =
        serde_json::from_str(&stdout).map_err(|e| format!("parse iperf3 JSON: {e}"))?;

    if let Some(err) = json.get("error").and_then(Value::as_str) {
        return Err(err.to_string());
    }

    // UDP aggregates under `end.sum`; TCP under `sum_sent` / `sum_received`
    // (the client is the receiver in reverse mode). Try the expected key first,
    // then fall back across the alternatives.
    let primary = if udp {
        "/end/sum/bits_per_second"
    } else if reverse {
        "/end/sum_received/bits_per_second"
    } else {
        "/end/sum_sent/bits_per_second"
    };
    let bps = json
        .pointer(primary)
        .and_then(Value::as_f64)
        .or_else(|| {
            json.pointer("/end/sum/bits_per_second")
                .and_then(Value::as_f64)
        })
        .or_else(|| {
            json.pointer("/end/sum_received/bits_per_second")
                .and_then(Value::as_f64)
        })
        .or_else(|| {
            json.pointer("/end/sum_sent/bits_per_second")
                .and_then(Value::as_f64)
        })
        .ok_or_else(|| "iperf3 report missing throughput".to_string())?;

    Ok(bps / 1_000_000.0)
}
