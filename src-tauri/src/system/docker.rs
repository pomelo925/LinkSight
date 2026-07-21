//! Local Docker introspection via the `docker` CLI (images, containers, disk usage).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use tokio::process::Command;

use crate::error::{LinkSightError, Result};

/// A local Docker image summary (`docker images --format '{{json .}}'`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_since: String,
    pub created_at: String,
}

/// A local container summary (`docker ps -a` + optional `docker stats`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainer {
    pub id: String,
    pub names: String,
    pub image: String,
    pub command: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created_at: String,
    pub running_for: String,
    pub size: String,
    /// From `docker stats` (e.g. `"0.04%"`); empty when unavailable.
    pub cpu_perc: String,
    /// From `docker stats` (e.g. `"690.2MiB / 31.09GiB"`); empty when unavailable.
    pub mem_usage: String,
}

/// One row from `docker system df --format '{{json .}}'`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerDiskUsage {
    pub type_name: String,
    pub total_count: String,
    pub active: String,
    pub size: String,
    pub reclaimable: String,
}

/// One physical block device (hard disk / SSD) with capacity and Docker share.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostDiskUsage {
    /// Kernel device name, e.g. `nvme0n1` / `sda`.
    pub name: String,
    /// Drive model from udev/lsblk when available.
    pub model: String,
    /// Primary mount point (longest path on this disk), or empty if unmounted.
    pub mount: String,
    /// `df` Size (1-blocks), summed across mounts on this disk.
    pub total_bytes: u64,
    /// `df` Used, summed across mounts on this disk.
    pub used_bytes: u64,
    /// `df` Available, summed across mounts on this disk.
    pub available_bytes: u64,
    /// Docker root data attributed to this disk (0 if Docker is elsewhere).
    pub docker_bytes: u64,
}

/// Combined snapshot for the Docker Stats page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerOverview {
    pub containers: Vec<DockerContainer>,
    pub images: Vec<DockerImage>,
    pub disk_usage: Vec<DockerDiskUsage>,
    pub host_disks: Vec<HostDiskUsage>,
}

#[derive(Debug, Deserialize)]
struct DockerImageLine {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "Repository")]
    repository: String,
    #[serde(rename = "Tag")]
    tag: String,
    #[serde(rename = "Size")]
    size: String,
    #[serde(rename = "CreatedSince")]
    created_since: String,
    #[serde(rename = "CreatedAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct DockerContainerLine {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "Names")]
    names: String,
    #[serde(rename = "Image")]
    image: String,
    #[serde(rename = "Command")]
    command: String,
    #[serde(rename = "Status")]
    status: String,
    #[serde(rename = "State")]
    state: String,
    #[serde(rename = "Ports")]
    ports: String,
    #[serde(rename = "CreatedAt")]
    created_at: String,
    #[serde(rename = "RunningFor")]
    running_for: String,
    #[serde(rename = "Size")]
    size: String,
}

#[derive(Debug, Deserialize)]
struct DockerStatsLine {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "CPUPerc")]
    cpu_perc: String,
    #[serde(rename = "MemUsage")]
    mem_usage: String,
}

#[derive(Debug, Deserialize)]
struct DockerDiskUsageLine {
    #[serde(rename = "Type")]
    type_name: String,
    #[serde(rename = "TotalCount")]
    total_count: String,
    #[serde(rename = "Active")]
    active: String,
    #[serde(rename = "Size")]
    size: String,
    #[serde(rename = "Reclaimable")]
    reclaimable: String,
}

/// Prefer absolute paths — GUI / container envs often have a stripped PATH.
fn docker_bin() -> &'static str {
    static BIN: OnceLock<String> = OnceLock::new();
    BIN.get_or_init(|| {
        for candidate in ["/usr/bin/docker", "/usr/local/bin/docker", "/bin/docker"] {
            if Path::new(candidate).is_file() {
                return candidate.to_string();
            }
        }
        "docker".to_string()
    })
    .as_str()
}

async fn docker_output(args: &[&str]) -> Result<String> {
    let bin = docker_bin();
    let output = Command::new(bin).args(args).output().await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            LinkSightError::CommandFailed("Docker is not installed or not available in PATH".into())
        } else {
            LinkSightError::Io(e)
        }
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        return Err(LinkSightError::CommandFailed(if msg.is_empty() {
            format!("docker {} failed (exit {})", args.join(" "), output.status)
        } else {
            msg.to_string()
        }));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn parse_json_lines<T, U, F>(stdout: &str, map: F, label: &str) -> Result<Vec<U>>
where
    T: for<'de> Deserialize<'de>,
    F: Fn(T) -> U,
{
    let mut items = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let raw: T = serde_json::from_str(line)
            .map_err(|e| LinkSightError::Parse(format!("{label}: {e}")))?;
        items.push(map(raw));
    }
    Ok(items)
}

/// List local Docker images.
pub async fn list_images() -> Result<Vec<DockerImage>> {
    let stdout = docker_output(&["images", "--format", "{{json .}}"]).await?;
    parse_json_lines(
        &stdout,
        |raw: DockerImageLine| DockerImage {
            id: raw.id,
            repository: raw.repository,
            tag: raw.tag,
            size: raw.size,
            created_since: raw.created_since,
            created_at: raw.created_at,
        },
        "docker image line",
    )
}

/// List all local containers (`docker ps -a`). Stats fields start empty.
pub async fn list_containers() -> Result<Vec<DockerContainer>> {
    let stdout = docker_output(&["ps", "-a", "--format", "{{json .}}"]).await?;
    parse_json_lines(
        &stdout,
        |raw: DockerContainerLine| DockerContainer {
            id: raw.id,
            names: raw.names,
            image: raw.image,
            command: raw.command,
            status: raw.status,
            state: raw.state,
            ports: raw.ports,
            created_at: raw.created_at,
            running_for: raw.running_for,
            size: raw.size,
            cpu_perc: String::new(),
            mem_usage: String::new(),
        },
        "docker container line",
    )
}

/// Live CPU / memory from `docker stats --no-stream --all`.
///
/// Returns a map keyed by short container ID and by name.
async fn container_stats_map() -> Result<HashMap<String, (String, String)>> {
    let stdout =
        docker_output(&["stats", "--no-stream", "--all", "--format", "{{json .}}"]).await?;
    let lines = parse_json_lines(&stdout, |raw: DockerStatsLine| raw, "docker stats line")?;

    let mut map = HashMap::new();
    for line in lines {
        let value = (line.cpu_perc, line.mem_usage);
        if !line.id.is_empty() {
            map.insert(line.id.clone(), value.clone());
        }
        if !line.name.is_empty() {
            map.insert(line.name, value);
        }
    }
    Ok(map)
}

/// Docker CLI CPU% is relative to one core (so multi-core workloads can exceed
/// 100%). Normalize to host capacity so a fully busy machine reads ~100%.
fn normalize_cpu_perc(raw: &str, host_cpus: u32) -> String {
    let trimmed = raw.trim().trim_end_matches('%').trim();
    let Ok(value) = trimmed.parse::<f64>() else {
        return raw.to_string();
    };
    let cpus = host_cpus.max(1) as f64;
    let normalized = (value / cpus).clamp(0.0, 100.0);
    format!("{normalized:.2}%")
}

async fn host_cpu_count() -> u32 {
    match docker_output(&["info", "--format", "{{.NCPU}}"]).await {
        Ok(stdout) => stdout
            .trim()
            .parse::<u32>()
            .ok()
            .filter(|n| *n > 0)
            .unwrap_or(1),
        Err(_) => std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(1)
            .max(1),
    }
}

fn apply_stats(
    containers: &mut [DockerContainer],
    stats: &HashMap<String, (String, String)>,
    host_cpus: u32,
) {
    for c in containers.iter_mut() {
        let hit = stats.get(&c.id).or_else(|| stats.get(&c.names)).cloned();
        if let Some((cpu, mem)) = hit {
            c.cpu_perc = normalize_cpu_perc(&cpu, host_cpus);
            c.mem_usage = mem;
        }
    }
}

/// Disk usage summary (`docker system df`).
pub async fn system_df() -> Result<Vec<DockerDiskUsage>> {
    let stdout = docker_output(&["system", "df", "--format", "{{json .}}"]).await?;
    parse_json_lines(
        &stdout,
        |raw: DockerDiskUsageLine| DockerDiskUsage {
            type_name: raw.type_name,
            total_count: raw.total_count,
            active: raw.active,
            size: raw.size,
            reclaimable: raw.reclaimable,
        },
        "docker system df line",
    )
}

/// Parse Docker size labels (`22.43GB`, `22.43 GB`, `690.2MiB`, `7.238kB`) → bytes.
fn parse_docker_size_bytes(raw: &str) -> u64 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0;
    }
    // Prefer first token; if unit is separate (`22.43 GB`), join for parsing.
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    let cleaned = if parts.len() >= 2 && parts[0].chars().all(|c| c.is_ascii_digit() || c == '.') {
        format!("{}{}", parts[0], parts[1])
    } else {
        parts[0].to_string()
    };

    let bytes = cleaned.as_bytes();
    let mut i = 0;
    while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
        i += 1;
    }
    if i == 0 {
        return 0;
    }
    let value: f64 = cleaned[..i].parse().unwrap_or(0.0);
    if !value.is_finite() || value < 0.0 {
        return 0;
    }
    let unit = cleaned[i..].to_ascii_uppercase();
    let binary = unit.contains('I');
    let base: f64 = if binary { 1024.0 } else { 1000.0 };
    let prefix = unit.replace("IB", "B").replace('B', "");
    let exp = match prefix.as_str() {
        "K" => 1,
        "M" => 2,
        "G" => 3,
        "T" => 4,
        "P" => 5,
        _ => 0,
    };
    (value * base.powi(exp)).round() as u64
}

async fn docker_root_dir() -> String {
    match docker_output(&["info", "--format", "{{.DockerRootDir}}"]).await {
        Ok(s) => s.trim().to_string(),
        Err(_) => String::new(),
    }
}

#[derive(Debug, Deserialize)]
struct LsblkDevice {
    name: String,
    #[serde(rename = "type")]
    type_name: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    children: Option<Vec<LsblkDevice>>,
}

#[derive(Debug, Deserialize)]
struct LsblkOut {
    blockdevices: Vec<LsblkDevice>,
}

#[derive(Debug, Clone)]
struct DfEntry {
    /// Kernel name without `/dev/`, e.g. `nvme1n1p2`.
    device: String,
    total_bytes: u64,
    used_bytes: u64,
    available_bytes: u64,
    mount: String,
}

fn path_is_under(path: &str, mount: &str) -> bool {
    if mount == "/" {
        return path.starts_with('/');
    }
    path == mount || path.starts_with(&(mount.to_string() + "/"))
}

fn skip_df_mount(mount: &str) -> bool {
    matches!(
        mount,
        "/boot" | "/boot/efi" | "/boot/firmware" | "/efi" | "[SWAP]"
    ) || mount.starts_with("/snap/")
        || mount.starts_with("/run/")
        || mount.starts_with("/sys/")
        || mount.starts_with("/dev/")
        || mount.starts_with("/proc/")
}

/// Parent disk name: `nvme1n1p2` → `nvme1n1`, `sda1` → `sda`, `mmcblk0p1` → `mmcblk0`.
fn parent_disk_name(partition: &str) -> String {
    let name = partition.trim_start_matches("/dev/");
    if let Some(rest) = name.strip_prefix("nvme") {
        // nvme0n1p2 → nvme0n1
        if let Some(p) = rest.find('p') {
            let after_n = &rest[..p];
            if after_n.contains('n') {
                return format!("nvme{after_n}");
            }
        }
        return name.to_string();
    }
    if let Some(rest) = name.strip_prefix("mmcblk") {
        if let Some(p) = rest.find('p') {
            return format!("mmcblk{}", &rest[..p]);
        }
        return name.to_string();
    }
    // sda1 / vda2 / xvda3 → strip trailing digits
    let trimmed = name.trim_end_matches(|c: char| c.is_ascii_digit());
    if trimmed.is_empty() {
        name.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Parse `df -B1 -P` into real block-device mounts (Size / Used).
fn parse_df_entries(stdout: &str) -> Vec<DfEntry> {
    let mut entries = Vec::new();
    for line in stdout.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }
        let filesystem = cols[0];
        if !filesystem.starts_with("/dev/") {
            continue;
        }
        if filesystem.contains("loop") {
            continue;
        }
        let total_bytes: u64 = cols[1].parse().unwrap_or(0);
        let used_bytes: u64 = cols[2].parse().unwrap_or(0);
        let available_bytes: u64 = cols[3].parse().unwrap_or(0);
        let mount = cols[5..].join(" ");
        if mount.is_empty() || skip_df_mount(&mount) {
            continue;
        }
        // Ignore tiny volumes (EFI leftovers etc. if not already filtered).
        if total_bytes < 2 * 1024 * 1024 * 1024 {
            continue;
        }
        entries.push(DfEntry {
            device: filesystem.trim_start_matches("/dev/").to_string(),
            total_bytes,
            used_bytes,
            available_bytes,
            mount,
        });
    }
    entries
}

fn collect_disk_models(dev: &LsblkDevice, out: &mut HashMap<String, String>) {
    if dev.type_name == "disk" {
        let model = dev.model.as_deref().unwrap_or("").trim().to_string();
        if !model.is_empty() {
            out.insert(dev.name.clone(), model);
        }
    }
    if let Some(children) = &dev.children {
        for child in children {
            collect_disk_models(child, out);
        }
    }
}

/// Host disks from `df` Size/Used (summed per physical disk). Docker share uses the
/// filesystem that contains Docker's root directory.
async fn list_host_disks(docker_total_bytes: u64, docker_root: &str) -> Vec<HostDiskUsage> {
    let df = Command::new("df").args(["-B1", "-P"]).output().await;
    let Ok(df_out) = df else {
        return Vec::new();
    };
    if !df_out.status.success() {
        return Vec::new();
    }
    let entries = parse_df_entries(&String::from_utf8_lossy(&df_out.stdout));
    if entries.is_empty() {
        return Vec::new();
    }

    let mut models: HashMap<String, String> = HashMap::new();
    if let Ok(lsblk_out) = Command::new("lsblk")
        .args(["-J", "-o", "NAME,TYPE,MODEL"])
        .output()
        .await
    {
        if lsblk_out.status.success() {
            if let Ok(parsed) = serde_json::from_slice::<LsblkOut>(&lsblk_out.stdout) {
                for dev in &parsed.blockdevices {
                    collect_disk_models(dev, &mut models);
                }
            }
        }
    }

    // Group df mounts by parent physical disk; sum Size + Used + Avail.
    struct Acc {
        total_bytes: u64,
        used_bytes: u64,
        available_bytes: u64,
        mounts: Vec<String>,
    }
    let mut groups: HashMap<String, Acc> = HashMap::new();
    for entry in &entries {
        let parent = parent_disk_name(&entry.device);
        let acc = groups.entry(parent).or_insert(Acc {
            total_bytes: 0,
            used_bytes: 0,
            available_bytes: 0,
            mounts: Vec::new(),
        });
        acc.total_bytes = acc.total_bytes.saturating_add(entry.total_bytes);
        acc.used_bytes = acc.used_bytes.saturating_add(entry.used_bytes);
        acc.available_bytes = acc.available_bytes.saturating_add(entry.available_bytes);
        acc.mounts.push(entry.mount.clone());
    }

    let docker_mount = if docker_root.is_empty() {
        None
    } else {
        entries
            .iter()
            .map(|e| &e.mount)
            .filter(|m| path_is_under(docker_root, m))
            .max_by_key(|m| m.len())
            .cloned()
    };
    // Fall back when Docker root is unknown or unmatched (e.g. `docker info` failed).
    let docker_mount = docker_mount.or_else(|| {
        if docker_total_bytes == 0 {
            None
        } else if entries.iter().any(|e| e.mount == "/") {
            Some("/".into())
        } else {
            entries
                .iter()
                .max_by_key(|e| e.total_bytes)
                .map(|e| e.mount.clone())
        }
    });

    let mut disks = Vec::new();
    for (name, acc) in groups {
        if acc.total_bytes == 0 {
            continue;
        }
        let mut primary_mount = acc
            .mounts
            .iter()
            .max_by_key(|m| m.len())
            .cloned()
            .unwrap_or_default();
        if acc.mounts.iter().any(|m| m == "/") {
            primary_mount = "/".into();
        }

        let docker_bytes = match &docker_mount {
            Some(dm) if acc.mounts.iter().any(|m| m == dm) => docker_total_bytes,
            _ => 0,
        };

        disks.push(HostDiskUsage {
            name: name.clone(),
            model: models.get(&name).cloned().unwrap_or_default(),
            mount: primary_mount,
            total_bytes: acc.total_bytes,
            used_bytes: acc.used_bytes.min(acc.total_bytes),
            available_bytes: acc.available_bytes,
            docker_bytes: docker_bytes.min(acc.total_bytes),
        });
    }

    // Last resort: put all Docker usage on the largest disk.
    if docker_total_bytes > 0 && disks.iter().all(|d| d.docker_bytes == 0) {
        if let Some(disk) = disks.iter_mut().max_by_key(|d| d.total_bytes) {
            disk.docker_bytes = docker_total_bytes.min(disk.total_bytes);
        }
    }

    disks.sort_by(|a, b| a.name.cmp(&b.name));
    disks
}

/// Fetch containers (+ stats), images, and disk usage in one snapshot.
pub async fn overview() -> Result<DockerOverview> {
    let (mut containers, images, disk_usage, stats, host_cpus, docker_root) = tokio::try_join!(
        list_containers(),
        list_images(),
        system_df(),
        container_stats_map(),
        async { Ok::<u32, LinkSightError>(host_cpu_count().await) },
        async { Ok::<String, LinkSightError>(docker_root_dir().await) },
    )?;
    apply_stats(&mut containers, &stats, host_cpus);
    let docker_total: u64 = disk_usage
        .iter()
        .map(|r| parse_docker_size_bytes(&r.size))
        .sum();
    let host_disks = list_host_disks(docker_total, &docker_root).await;
    Ok(DockerOverview {
        containers,
        images,
        disk_usage,
        host_disks,
    })
}

fn validate_ref(value: &str, label: &str) -> Result<()> {
    let v = value.trim();
    if v.is_empty() {
        return Err(LinkSightError::InvalidInput(format!("{label} is required")));
    }
    if v.starts_with('-') || v.contains('\0') || v.chars().any(|c| c.is_whitespace()) {
        return Err(LinkSightError::InvalidInput(format!("invalid {label}")));
    }
    Ok(())
}

/// `docker stop <id>`
pub async fn stop_container(id: &str) -> Result<()> {
    validate_ref(id, "container id")?;
    docker_output(&["stop", id.trim()]).await?;
    Ok(())
}

/// `docker restart <id>`
pub async fn restart_container(id: &str) -> Result<()> {
    validate_ref(id, "container id")?;
    docker_output(&["restart", id.trim()]).await?;
    Ok(())
}

/// `docker rm -f <id>`
pub async fn remove_container(id: &str) -> Result<()> {
    validate_ref(id, "container id")?;
    docker_output(&["rm", "-f", id.trim()]).await?;
    Ok(())
}

/// Retag an image (`docker tag`) and drop the previous name:tag when present.
pub async fn rename_image(
    id: &str,
    old_repository: &str,
    old_tag: &str,
    repository: &str,
    tag: &str,
) -> Result<()> {
    validate_ref(id, "image id")?;
    let repository = repository.trim();
    let tag = tag.trim();
    if repository.is_empty() {
        return Err(LinkSightError::InvalidInput(
            "repository is required".into(),
        ));
    }
    if tag.is_empty() {
        return Err(LinkSightError::InvalidInput("tag is required".into()));
    }
    if repository.contains(':')
        || repository.contains('\0')
        || tag.contains(':')
        || tag.contains('\0')
        || tag.contains('/')
    {
        return Err(LinkSightError::InvalidInput(
            "invalid repository or tag".into(),
        ));
    }

    let new_ref = format!("{repository}:{tag}");
    validate_ref(&new_ref, "image reference")?;
    docker_output(&["tag", id.trim(), &new_ref]).await?;

    let old_repository = old_repository.trim();
    let old_tag = old_tag.trim();
    if old_repository.is_empty()
        || old_tag.is_empty()
        || old_repository == "<none>"
        || old_tag == "<none>"
    {
        return Ok(());
    }
    let old_ref = format!("{old_repository}:{old_tag}");
    if old_ref != new_ref {
        // Best-effort: ignore failures (e.g. dangling / still referenced).
        let _ = docker_output(&["rmi", &old_ref]).await;
    }
    Ok(())
}

/// `docker rmi <id-or-ref>`
pub async fn remove_image(id_or_ref: &str) -> Result<()> {
    validate_ref(id_or_ref, "image")?;
    docker_output(&["rmi", id_or_ref.trim()]).await?;
    Ok(())
}
