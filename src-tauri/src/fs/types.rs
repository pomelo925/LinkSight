//! Shared filesystem entry types used by local browsing and remote SFTP.

use serde::Serialize;

/// A single file or directory entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    /// Absolute path.
    pub path: String,
    /// `"dir"`, `"file"` or `"symlink"`.
    pub kind: String,
    pub size: Option<u64>,
    /// Last-modified Unix timestamp (seconds).
    pub modified: Option<i64>,
    /// `ls -l` style permission string.
    pub permissions: String,
    /// Raw Unix mode bits (type + rwx).
    pub mode: Option<u32>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

/// A resolved directory listing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListing {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

pub fn join_path(base: &str, name: &str) -> String {
    if base == "/" {
        format!("/{name}")
    } else {
        format!("{}/{name}", base.trim_end_matches('/'))
    }
}

pub fn parent_path(path: &str) -> Option<String> {
    if path == "/" {
        return None;
    }
    let trimmed = path.trim_end_matches('/');
    let parent = trimmed.rsplit_once('/')?.0;
    Some(if parent.is_empty() {
        "/".into()
    } else {
        parent.into()
    })
}

pub fn format_permissions(mode: u32, is_dir: bool, is_symlink: bool) -> String {
    let type_char = if is_symlink {
        'l'
    } else if is_dir {
        'd'
    } else {
        '-'
    };
    let mut s = String::with_capacity(10);
    s.push(type_char);
    for shift in [6, 3, 0] {
        let bits = (mode >> shift) & 0b111;
        s.push(if bits & 0b100 != 0 { 'r' } else { '-' });
        s.push(if bits & 0b010 != 0 { 'w' } else { '-' });
        s.push(if bits & 0b001 != 0 { 'x' } else { '-' });
    }
    s
}

pub fn owner_name(uid: u32) -> String {
    if uid == 0 {
        "root".into()
    } else {
        uid.to_string()
    }
}

pub fn group_name(gid: u32) -> String {
    if gid == 0 {
        "root".into()
    } else {
        gid.to_string()
    }
}

pub fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|a, b| {
        let ad = a.kind == "dir";
        let bd = b.kind == "dir";
        bd.cmp(&ad)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}
