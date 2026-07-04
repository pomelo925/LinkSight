//! Network interface information.
//!
//! Working Linux implementation using the `sysfs`/`procfs` pseudo-filesystems
//! so it stays dependency-free. Extend with routing table + live stats later.

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceInfo {
    pub name: String,
    pub is_up: bool,
    pub mac: Option<String>,
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

        interfaces.push(InterfaceInfo {
            name,
            is_up,
            mac,
            rx_bytes,
            tx_bytes,
        });
    }

    interfaces.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(interfaces)
}

fn read_trimmed(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
}
