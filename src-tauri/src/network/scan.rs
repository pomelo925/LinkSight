//! LAN discovery (Basic Mode).
//!
//! Primary path uses `nmap -sn` (ping scan, no port probing) which also yields
//! MAC address + vendor. When `nmap` is unavailable it falls back to a
//! concurrent ICMP ping-sweep across the /24.
//!
//! The subnet can be auto-detected from the host routing table when the caller
//! passes an empty CIDR.

use std::time::Instant;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::cancel::{self, CancelKind};
use super::model::{TestKind, TestMode, TestStatus};
use crate::error::{LinkSightError, Result};

/// A single host discovered on the network.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    pub ip: String,
    pub hostname: Option<String>,
    pub mac: Option<String>,
    pub vendor: Option<String>,
    pub latency_ms: Option<f64>,
}

/// Result of a LAN scan. Mirrors the shared test metadata but carries a device
/// list instead of scalar metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub id: String,
    pub kind: TestKind,
    pub mode: TestMode,
    pub target: String,
    pub status: TestStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub devices: Vec<DiscoveredDevice>,
    pub raw: Option<String>,
    pub error: Option<String>,
}

/// Discover devices on `cidr` (e.g. `192.168.1.0/24`). Empty = auto-detect.
pub async fn scan(cidr: &str) -> Result<ScanResult> {
    let gen = cancel::begin(CancelKind::Scan);
    let target = if cidr.trim().is_empty() {
        detect_local_cidr().await?
    } else {
        cidr.trim().to_string()
    };
    validate_target(&target)?;
    cancel::ensure(CancelKind::Scan, gen)?;

    let id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    let (devices, raw, status, error) = match run_nmap(&target).await {
        Ok((devices, raw)) => {
            if cancel::is_cancelled(CancelKind::Scan, gen) {
                return Err(cancel::cancelled_error());
            }
            (devices, Some(raw), TestStatus::Success, None)
        }
        // nmap missing -> fall back to a ping sweep.
        Err(LinkSightError::CommandFailed(msg)) if msg.contains("nmap not found") => {
            cancel::ensure(CancelKind::Scan, gen)?;
            match ping_sweep(&target).await {
                Ok(devices) => {
                    if cancel::is_cancelled(CancelKind::Scan, gen) {
                        return Err(cancel::cancelled_error());
                    }
                    (devices, None, TestStatus::Success, None)
                }
                Err(e) => (Vec::new(), None, TestStatus::Failed, Some(e.to_string())),
            }
        }
        Err(e) => (Vec::new(), None, TestStatus::Failed, Some(e.to_string())),
    };

    cancel::ensure(CancelKind::Scan, gen)?;

    Ok(ScanResult {
        id,
        kind: TestKind::Scan,
        mode: TestMode::Basic,
        target,
        status,
        duration_ms: start.elapsed().as_millis() as u64,
        started_at,
        devices,
        raw,
        error,
    })
}

// ---- nmap -------------------------------------------------------------------

async fn run_nmap(target: &str) -> Result<(Vec<DiscoveredDevice>, String)> {
    let output = match Command::new("nmap").arg("-sn").arg(target).output().await {
        Ok(o) => o,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(LinkSightError::CommandFailed("nmap not found".into()));
        }
        Err(e) => {
            return Err(LinkSightError::CommandFailed(format!(
                "failed to spawn nmap: {e}"
            )));
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() && stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LinkSightError::CommandFailed(format!(
            "nmap failed: {}",
            stderr.trim()
        )));
    }

    Ok((parse_nmap(&stdout), stdout))
}

fn parse_nmap(stdout: &str) -> Vec<DiscoveredDevice> {
    let mut devices = Vec::new();
    let mut current: Option<DiscoveredDevice> = None;

    for line in stdout.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Nmap scan report for ") {
            if let Some(dev) = current.take() {
                devices.push(dev);
            }
            let (hostname, ip) = parse_report_target(rest);
            current = Some(DiscoveredDevice {
                ip,
                hostname,
                mac: None,
                vendor: None,
                latency_ms: None,
            });
        } else if line.starts_with("Host is up") {
            if let Some(dev) = current.as_mut() {
                dev.latency_ms = parse_latency(line);
            }
        } else if let Some(rest) = line.strip_prefix("MAC Address: ") {
            if let Some(dev) = current.as_mut() {
                let (mac, vendor) = parse_mac(rest);
                dev.mac = Some(mac);
                dev.vendor = vendor;
            }
        }
    }
    if let Some(dev) = current.take() {
        devices.push(dev);
    }
    devices
}

/// "router.asus.com (192.168.1.1)" -> (Some(host), ip); "192.168.1.23" -> (None, ip)
fn parse_report_target(rest: &str) -> (Option<String>, String) {
    if rest.ends_with(')') {
        if let Some(open) = rest.rfind('(') {
            let hostname = rest[..open].trim();
            let ip = rest[open + 1..rest.len() - 1].trim().to_string();
            let hostname = (!hostname.is_empty()).then(|| hostname.to_string());
            return (hostname, ip);
        }
    }
    (None, rest.trim().to_string())
}

/// "Host is up (0.0021s latency)." -> 2.1 (ms)
fn parse_latency(line: &str) -> Option<f64> {
    let open = line.find('(')?;
    let s_idx = line[open..].find('s')? + open;
    let num = line[open + 1..s_idx].trim();
    num.parse::<f64>().ok().map(|secs| secs * 1000.0)
}

/// "AA:BB:CC:DD:EE:FF (Vendor Name)" -> (mac, Some(vendor))
fn parse_mac(rest: &str) -> (String, Option<String>) {
    if let Some(open) = rest.find('(') {
        let mac = rest[..open].trim().to_string();
        let vendor = rest[open + 1..].trim_end_matches(')').trim();
        let vendor = (!vendor.is_empty() && vendor != "Unknown").then(|| vendor.to_string());
        (mac, vendor)
    } else {
        (rest.trim().to_string(), None)
    }
}

// ---- ping sweep fallback ----------------------------------------------------

async fn ping_sweep(target: &str) -> Result<Vec<DiscoveredDevice>> {
    let base = target.split('/').next().unwrap_or(target);
    let octets: Vec<&str> = base.split('.').collect();
    if octets.len() != 4 {
        return Err(LinkSightError::InvalidInput(format!(
            "ping sweep supports IPv4 /24 only (got {target})"
        )));
    }
    let prefix = format!("{}.{}.{}", octets[0], octets[1], octets[2]);

    let mut handles = Vec::with_capacity(254);
    for host in 1..=254u32 {
        let ip = format!("{prefix}.{host}");
        handles.push(tokio::spawn(async move {
            let out = Command::new("ping")
                .arg("-c")
                .arg("1")
                .arg("-W")
                .arg("1")
                .arg(&ip)
                .output()
                .await
                .ok()?;
            if !out.status.success() {
                return None;
            }
            let stdout = String::from_utf8_lossy(&out.stdout);
            Some(DiscoveredDevice {
                ip,
                hostname: None,
                mac: None,
                vendor: None,
                latency_ms: parse_ping_latency(&stdout),
            })
        }));
    }

    let mut devices = Vec::new();
    for handle in handles {
        if let Ok(Some(dev)) = handle.await {
            devices.push(dev);
        }
    }
    devices.sort_by_key(|d| ip_sort_key(&d.ip));
    Ok(devices)
}

fn parse_ping_latency(stdout: &str) -> Option<f64> {
    for line in stdout.lines() {
        if let Some(idx) = line.find("time=") {
            let num: String = line[idx + 5..]
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            return num.parse::<f64>().ok();
        }
    }
    None
}

/// Numeric key for sorting IPv4 strings.
fn ip_sort_key(ip: &str) -> u32 {
    ip.split('.')
        .filter_map(|o| o.parse::<u32>().ok())
        .fold(0u32, |acc, o| (acc << 8) | (o & 0xff))
}

// ---- subnet detection & validation ------------------------------------------

async fn detect_local_cidr() -> Result<String> {
    if let Ok(cidr) = detect_cidr_via_ip_command().await {
        return Ok(cidr);
    }
    detect_cidr_via_proc_route()
}

async fn detect_cidr_via_ip_command() -> Result<String> {
    let output = Command::new("ip")
        .args(["-4", "route", "show"])
        .output()
        .await
        .map_err(|e| LinkSightError::CommandFailed(format!("failed to run `ip route`: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LinkSightError::CommandFailed(format!(
            "`ip route` failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ip_route_output(&stdout)
}

fn parse_ip_route_output(stdout: &str) -> Result<String> {
    // Prefer connected link routes (e.g. "192.168.1.0/24 dev wlan0 scope link")
    for line in stdout.lines() {
        if !line.contains("scope link") {
            continue;
        }
        if let Some(cidr) = line.split_whitespace().next() {
            if is_ipv4_cidr(cidr) && !cidr.starts_with("127.") {
                return Ok(cidr.to_string());
            }
        }
    }

    // Fallback: first non-loopback IPv4 prefix in the routing table.
    for line in stdout.lines() {
        if let Some(cidr) = line.split_whitespace().next() {
            if is_ipv4_cidr(cidr) && !cidr.starts_with("127.") {
                return Ok(cidr.to_string());
            }
        }
    }

    Err(LinkSightError::CommandFailed(
        "no usable subnet in `ip route` output".into(),
    ))
}

/// Parse `/proc/net/route` (always present on Linux, no external binary needed).
fn detect_cidr_via_proc_route() -> Result<String> {
    let content = std::fs::read_to_string("/proc/net/route").map_err(|e| {
        LinkSightError::CommandFailed(format!("failed to read /proc/net/route: {e}"))
    })?;

    let mut best: Option<String> = None;

    for line in content.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 8 {
            continue;
        }
        let iface = cols[0];
        if iface == "lo" {
            continue;
        }

        let dest_hex = cols[1];
        let gateway_hex = cols[2];
        let flags: u32 = cols[3].parse().unwrap_or(0);
        let mask_hex = cols[7];

        // RTF_UP = 0x1, RTF_GATEWAY = 0x2 — want local connected routes.
        const RTF_UP: u32 = 0x1;
        const RTF_GATEWAY: u32 = 0x2;
        if flags & RTF_UP == 0 || flags & RTF_GATEWAY != 0 {
            continue;
        }
        if gateway_hex != "00000000" {
            continue;
        }
        if dest_hex == "00000000" || mask_hex == "00000000" {
            continue;
        }

        let Some(ip) = hex_le_to_ipv4(dest_hex) else {
            continue;
        };
        let Some(prefix) = hex_le_to_prefix(mask_hex) else {
            continue;
        };
        if ip.starts_with("127.") || prefix == 0 {
            continue;
        }

        let cidr = format!("{ip}/{prefix}");
        // Prefer typical LAN /24 routes.
        if prefix == 24 {
            return Ok(cidr);
        }
        best.get_or_insert(cidr);
    }

    best.ok_or_else(|| {
        LinkSightError::CommandFailed(
            "could not auto-detect local subnet; specify a CIDR (e.g. 192.168.1.0/24)".into(),
        )
    })
}

/// Convert a little-endian hex IPv4 from `/proc/net/route` (e.g. `0001A8C0`).
fn hex_le_to_ipv4(hex: &str) -> Option<String> {
    let v = u32::from_str_radix(hex, 16).ok()?;
    Some(format!(
        "{}.{}.{}.{}",
        v & 0xff,
        (v >> 8) & 0xff,
        (v >> 16) & 0xff,
        (v >> 24) & 0xff,
    ))
}

fn hex_le_to_prefix(mask_hex: &str) -> Option<u8> {
    let mask = u32::from_str_radix(mask_hex, 16).ok()?;
    let bits = mask.count_ones();
    if bits == 0 || bits > 32 {
        return None;
    }
    Some(bits as u8)
}

fn is_ipv4_cidr(s: &str) -> bool {
    let (addr, prefix) = match s.split_once('/') {
        Some(parts) => parts,
        None => return false,
    };
    let mask: u8 = match prefix.parse() {
        Ok(n) if n <= 32 => n,
        _ => return false,
    };
    let _ = mask;
    addr.split('.').count() == 4 && addr.split('.').all(|o| o.parse::<u8>().is_ok())
}

fn validate_target(target: &str) -> Result<()> {
    if target.is_empty() {
        return Err(LinkSightError::InvalidInput("target is empty".into()));
    }
    let ok = target
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '.' | '/'));
    if !ok {
        return Err(LinkSightError::InvalidInput(format!(
            "invalid scan target (expected IPv4 CIDR): {target}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nmap_output() {
        let sample = "\
Starting Nmap 7.80 ( https://nmap.org )
Nmap scan report for router.asus.com (192.168.1.1)
Host is up (0.0021s latency).
MAC Address: AA:BB:CC:DD:EE:FF (Asustek Computer)
Nmap scan report for 192.168.1.23
Host is up (0.045s latency).
Nmap done: 256 IP addresses (2 hosts up) scanned in 2.50 seconds";
        let devices = parse_nmap(sample);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].ip, "192.168.1.1");
        assert_eq!(devices[0].hostname.as_deref(), Some("router.asus.com"));
        assert_eq!(devices[0].mac.as_deref(), Some("AA:BB:CC:DD:EE:FF"));
        assert_eq!(devices[0].vendor.as_deref(), Some("Asustek Computer"));
        assert!((devices[0].latency_ms.unwrap() - 2.1).abs() < 0.001);
        assert_eq!(devices[1].ip, "192.168.1.23");
        assert!(devices[1].hostname.is_none());
        assert!(devices[1].mac.is_none());
    }

    #[test]
    fn sorts_ipv4() {
        assert!(ip_sort_key("192.168.1.2") < ip_sort_key("192.168.1.10"));
    }

    #[test]
    fn validates_target() {
        assert!(validate_target("192.168.1.0/24").is_ok());
        assert!(validate_target("10.0.0.0/8").is_ok());
        assert!(validate_target("192.168.1.0/24; rm -rf /").is_err());
    }

    #[test]
    fn parses_proc_net_route_hex() {
        assert_eq!(hex_le_to_ipv4("0001A8C0"), Some("192.168.1.0".to_string()));
        assert_eq!(hex_le_to_prefix("00FFFFFF"), Some(24));
    }
}
