//! Network interface information.
//!
//! Working Linux implementation using the `sysfs`/`procfs` pseudo-filesystems
//! (dependency-free), plus `ip -o -4 addr` for IPv4 addresses.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::Result;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InterfaceKind {
    Wifi,
    Ethernet,
    Loopback,
    Virtual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceInfo {
    pub name: String,
    pub kind: InterfaceKind,
    pub is_up: bool,
    pub mac: Option<String>,
    pub ipv4: Option<String>,
    /// Cumulative bytes received / transmitted since boot.
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// Enumerate the host's network interfaces from `/sys/class/net`.
pub fn list_interfaces() -> Result<Vec<InterfaceInfo>> {
    let mut interfaces = Vec::new();
    let base = std::path::Path::new("/sys/class/net");
    if !base.exists() {
        return Ok(interfaces);
    }

    let ipv4_map = ipv4_addresses();

    for entry in std::fs::read_dir(base)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        let is_up = read_trimmed(&path.join("operstate"))
            .map(|s| s == "up")
            .unwrap_or(false);
        let mac = read_trimmed(&path.join("address")).filter(|m| m != "00:00:00:00:00:00");
        let rx_bytes = read_trimmed(&path.join("statistics/rx_bytes"))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let tx_bytes = read_trimmed(&path.join("statistics/tx_bytes"))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let kind = if name == "lo" {
            InterfaceKind::Loopback
        } else if path.join("wireless").exists() || path.join("phy80211").exists() {
            InterfaceKind::Wifi
        } else if path.join("device").exists() {
            InterfaceKind::Ethernet
        } else {
            InterfaceKind::Virtual
        };

        interfaces.push(InterfaceInfo {
            ipv4: ipv4_map.get(&name).cloned(),
            name,
            kind,
            is_up,
            mac,
            rx_bytes,
            tx_bytes,
        });
    }

    interfaces.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(interfaces)
}

/// Map of interface name → first IPv4 address, via `ip -o -4 addr show`.
/// Returns an empty map when `ip` is unavailable (fields stay `None`).
fn ipv4_addresses() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let output = match std::process::Command::new("ip")
        .args(["-o", "-4", "addr", "show"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return map,
    };

    // Lines look like: `2: eth0    inet 192.168.1.10/24 brd ... scope global ...`
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut parts = line.split_whitespace();
        let _idx = parts.next();
        let Some(name) = parts.next() else { continue };
        let rest: Vec<&str> = parts.collect();
        if let Some(pos) = rest.iter().position(|t| *t == "inet") {
            if let Some(cidr) = rest.get(pos + 1) {
                let ip = cidr.split('/').next().unwrap_or(cidr).to_string();
                map.entry(name.to_string()).or_insert(ip);
            }
        }
    }
    map
}

fn read_trimmed(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
}
