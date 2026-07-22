//! Traceroute (Basic Mode) — wraps the system `traceroute` binary.
//!
//! Returns per-hop data (host/ip + probe RTTs). Like [`super::scan`] it uses a
//! dedicated result type carrying a hop list rather than scalar metrics.

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::cancel::{self, CancelKind};
use super::model::{TestKind, TestMode, TestStatus};
use crate::error::{LinkSightError, Result};

/// A single hop along the route.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceHop {
    pub ttl: u32,
    pub host: Option<String>,
    pub ip: Option<String>,
    /// RTTs for each probe at this hop (ms). Empty when the hop timed out.
    pub rtts_ms: Vec<f64>,
    /// True when every probe at this hop timed out (`* * *`).
    pub timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteResult {
    pub id: String,
    pub kind: TestKind,
    pub mode: TestMode,
    pub target: String,
    pub status: TestStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub hops: Vec<TraceHop>,
    pub raw: Option<String>,
    pub error: Option<String>,
}

/// Run `traceroute` to `host` with up to `max_hops` hops.
pub async fn traceroute(host: &str, max_hops: u32) -> Result<TracerouteResult> {
    let gen = cancel::begin(CancelKind::Traceroute);
    validate_host(host)?;
    let max_hops = if max_hops == 0 { 30 } else { max_hops.min(64) };

    let id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    // -q 3 probes per hop, -w 2s wait, -m max hops.
    let output = Command::new("traceroute")
        .arg("-m")
        .arg(max_hops.to_string())
        .arg("-q")
        .arg("3")
        .arg("-w")
        .arg("2")
        .arg(host)
        .output()
        .await;

    cancel::ensure(CancelKind::Traceroute, gen)?;

    let output = match output {
        Ok(o) => o,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(LinkSightError::CommandFailed(
                "traceroute not found — install the `traceroute` package".into(),
            ));
        }
        Err(e) => {
            return Err(LinkSightError::CommandFailed(format!(
                "failed to spawn traceroute: {e}"
            )));
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && stdout.trim().is_empty() {
        return Ok(TracerouteResult {
            id,
            kind: TestKind::Traceroute,
            mode: TestMode::Basic,
            target: host.to_string(),
            status: TestStatus::Failed,
            started_at,
            duration_ms,
            hops: Vec::new(),
            raw: Some(if stderr.is_empty() {
                stdout
            } else {
                stderr.clone()
            }),
            error: Some(if stderr.trim().is_empty() {
                format!("traceroute to {host} failed")
            } else {
                stderr.trim().to_string()
            }),
        });
    }

    let hops = parse_traceroute(&stdout);

    Ok(TracerouteResult {
        id,
        kind: TestKind::Traceroute,
        mode: TestMode::Basic,
        target: host.to_string(),
        status: TestStatus::Success,
        started_at,
        duration_ms,
        hops,
        raw: Some(stdout),
        error: None,
    })
}

/// Parse the per-hop lines of `traceroute` output.
fn parse_traceroute(stdout: &str) -> Vec<TraceHop> {
    let mut hops = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        // Hop lines begin with the hop number.
        let mut tokens = line.split_whitespace().peekable();
        let ttl: u32 = match tokens.peek().and_then(|t| t.parse().ok()) {
            Some(n) => n,
            None => continue, // header or blank line
        };
        tokens.next(); // consume the ttl token

        let mut hop = TraceHop {
            ttl,
            host: None,
            ip: None,
            rtts_ms: Vec::new(),
            timed_out: false,
        };

        let toks: Vec<&str> = tokens.collect();
        let mut i = 0;
        while i < toks.len() {
            let tok = toks[i];

            if tok == "*" {
                i += 1;
                continue;
            }

            // "12.3 ms" → previous token is the RTT value.
            if tok == "ms" {
                if i > 0 {
                    if let Ok(v) = toks[i - 1].parse::<f64>() {
                        hop.rtts_ms.push(v);
                    }
                }
                i += 1;
                continue;
            }

            // "(1.2.3.4)" → the IP for this hop.
            if tok.starts_with('(') && tok.ends_with(')') {
                if hop.ip.is_none() {
                    hop.ip = Some(tok.trim_matches(['(', ')']).to_string());
                }
                i += 1;
                continue;
            }

            // A pure number followed by "ms" is an RTT; skip here (handled above).
            if tok.parse::<f64>().is_ok() {
                i += 1;
                continue;
            }

            // Otherwise it's a hostname (or bare IP with `-n`).
            if hop.host.is_none() && hop.ip.is_none() {
                if is_ipv4(tok) {
                    hop.ip = Some(tok.to_string());
                } else {
                    hop.host = Some(tok.to_string());
                }
            }
            i += 1;
        }

        // If host is a name but ip empty, that's fine; if both empty → timeout.
        hop.timed_out = hop.rtts_ms.is_empty() && hop.host.is_none() && hop.ip.is_none();
        hops.push(hop);
    }

    hops
}

fn is_ipv4(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok())
}

fn validate_host(host: &str) -> Result<()> {
    if host.is_empty() {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_output() {
        let sample = "\
traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
 1  router.home (192.168.1.1)  1.234 ms  1.111 ms  1.567 ms
 2  * * *
 3  10.0.0.1 (10.0.0.1)  5.1 ms  4.9 ms  5.3 ms
 4  dns.google (8.8.8.8)  10.2 ms  9.8 ms  10.5 ms";
        let hops = parse_traceroute(sample);
        assert_eq!(hops.len(), 4);

        assert_eq!(hops[0].ttl, 1);
        assert_eq!(hops[0].host.as_deref(), Some("router.home"));
        assert_eq!(hops[0].ip.as_deref(), Some("192.168.1.1"));
        assert_eq!(hops[0].rtts_ms.len(), 3);

        assert!(hops[1].timed_out);
        assert!(hops[1].rtts_ms.is_empty());

        assert_eq!(hops[3].host.as_deref(), Some("dns.google"));
        assert_eq!(hops[3].ip.as_deref(), Some("8.8.8.8"));
    }

    #[test]
    fn parses_numeric_mode() {
        let sample = " 1  192.168.1.1  1.2 ms  1.1 ms  1.3 ms";
        let hops = parse_traceroute(sample);
        assert_eq!(hops.len(), 1);
        assert_eq!(hops[0].ip.as_deref(), Some("192.168.1.1"));
        assert_eq!(hops[0].rtts_ms, vec![1.2, 1.1, 1.3]);
    }

    #[test]
    fn rejects_bad_host() {
        assert!(validate_host("8.8.8.8; rm -rf /").is_err());
        assert!(validate_host("example.com").is_ok());
    }
}
