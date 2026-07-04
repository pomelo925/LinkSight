//! ICMP ping (Basic Mode) via the system `ping` binary.
//!
//! This is the reference end-to-end diagnostic: the frontend button invokes
//! `run_ping`, which calls [`ping`], parses the output and returns the shared
//! [`NetworkTestResult`] schema.

use std::time::Instant;

use tokio::process::Command;

use super::model::{NetworkTestResult, TestKind, TestMode, TestStatus, TestSummary};
use crate::error::{LinkSightError, Result};

/// Run `ping` against `host` for `count` packets.
pub async fn ping(host: &str, count: u32) -> Result<NetworkTestResult> {
    validate_host(host)?;
    let count = count.clamp(1, 50);

    let mut result = NetworkTestResult::new(TestKind::Ping, TestMode::Basic, host);
    let started = Instant::now();

    // -c count, -w overall deadline (seconds) as a safety timeout.
    let output = Command::new("ping")
        .arg("-c")
        .arg(count.to_string())
        .arg("-w")
        .arg((count + 5).to_string())
        .arg(host)
        .output()
        .await
        .map_err(|e| LinkSightError::CommandFailed(format!("failed to spawn ping: {e}")))?;

    result.duration_ms = started.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    result.raw = Some(if stdout.is_empty() { stderr.clone() } else { stdout.clone() });

    if !output.status.success() {
        result.status = TestStatus::Failed;
        result.error = Some(if stderr.trim().is_empty() {
            format!("ping to {host} failed (100% packet loss or unreachable)")
        } else {
            stderr.trim().to_string()
        });
        return Ok(result);
    }

    result.summary = parse_summary(&stdout);
    result.status = TestStatus::Success;
    Ok(result)
}

/// Parse the `rtt min/avg/max/mdev` and `packet loss` lines from ping output.
fn parse_summary(stdout: &str) -> TestSummary {
    let mut summary = TestSummary::default();

    for line in stdout.lines() {
        let line = line.trim();

        if let Some(idx) = line.find("% packet loss") {
            let head = &line[..idx];
            if let Some(num) = head.rsplit([' ', ',']).find(|s| !s.is_empty()) {
                summary.packet_loss_pct = num.parse::<f64>().ok();
            }
        }

        // e.g. "rtt min/avg/max/mdev = 11.1/12.4/13.7/0.9 ms"
        if line.starts_with("rtt ") || line.starts_with("round-trip ") {
            if let Some(eq) = line.find('=') {
                let values = line[eq + 1..].trim().trim_end_matches(" ms");
                let parts: Vec<f64> = values
                    .split('/')
                    .filter_map(|s| s.trim().parse::<f64>().ok())
                    .collect();
                if parts.len() >= 3 {
                    summary.rtt_min_ms = Some(parts[0]);
                    summary.rtt_avg_ms = Some(parts[1]);
                    summary.rtt_max_ms = Some(parts[2]);
                }
                if parts.len() >= 4 {
                    summary.jitter_ms = Some(parts[3]);
                }
            }
        }
    }

    summary
}

/// Reject obviously invalid / injection-prone hosts (we shell out to `ping`).
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
PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.3 ms
--- 1.1.1.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3005ms
rtt min/avg/max/mdev = 11.123/12.456/13.789/0.900 ms";
        let s = parse_summary(sample);
        assert_eq!(s.packet_loss_pct, Some(0.0));
        assert_eq!(s.rtt_min_ms, Some(11.123));
        assert_eq!(s.rtt_avg_ms, Some(12.456));
        assert_eq!(s.rtt_max_ms, Some(13.789));
        assert_eq!(s.jitter_ms, Some(0.900));
    }

    #[test]
    fn parses_partial_loss() {
        let sample = "5 packets transmitted, 4 received, 20% packet loss, time 4005ms";
        let s = parse_summary(sample);
        assert_eq!(s.packet_loss_pct, Some(20.0));
    }

    #[test]
    fn rejects_bad_host() {
        assert!(validate_host("8.8.8.8; rm -rf /").is_err());
        assert!(validate_host("example.com").is_ok());
    }
}
