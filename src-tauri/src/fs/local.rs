//! Local filesystem browsing and mutations (this machine).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, PermissionsExt};

use crate::error::{LinkSightError, Result};

use super::types::{
    format_permissions, group_name, join_path, owner_name, sort_entries, FileEntry, FileListing,
};

fn default_start_path() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

/// Expand `~` / `~/…` to `$HOME`. Absolute and relative paths otherwise unchanged.
fn expand_user_path(path: &str) -> PathBuf {
    let path = path.trim();
    if path == "~" {
        return default_start_path();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return default_start_path().join(rest);
    }
    PathBuf::from(path)
}

fn resolve_path(path: Option<&str>) -> Result<PathBuf> {
    let requested = path
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(expand_user_path)
        .unwrap_or_else(default_start_path);

    if requested.is_absolute() {
        fs::canonicalize(&requested).map_err(map_io)
    } else {
        let base = default_start_path();
        fs::canonicalize(base.join(&requested)).map_err(map_io)
    }
}

fn map_io(e: std::io::Error) -> LinkSightError {
    LinkSightError::CommandFailed(e.to_string())
}

fn entry_from_path(path: &Path, name: &str) -> Result<FileEntry> {
    let meta = fs::symlink_metadata(path).map_err(map_io)?;
    let is_symlink = meta.file_type().is_symlink();
    let is_dir = meta.is_dir();
    let modified = meta.modified().ok().and_then(system_time_to_secs);

    #[cfg(unix)]
    let (mode, uid, gid) = {
        let mode = meta.mode();
        (Some(mode), Some(meta.uid()), Some(meta.gid()))
    };
    #[cfg(not(unix))]
    let (mode, uid, gid) = (None, None, None);

    let kind = if is_dir {
        "dir"
    } else if is_symlink {
        "symlink"
    } else {
        "file"
    };

    let permissions = mode
        .map(|m| format_permissions(m, is_dir, is_symlink))
        .unwrap_or_else(|| format_permissions(0, is_dir, is_symlink));

    Ok(FileEntry {
        path: path.to_string_lossy().into_owned(),
        name: name.to_string(),
        kind: kind.to_string(),
        size: if is_dir { None } else { Some(meta.len()) },
        modified,
        permissions,
        mode,
        uid,
        gid,
        owner: uid.map(owner_name),
        group: gid.map(group_name),
    })
}

fn system_time_to_secs(t: SystemTime) -> Option<i64> {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs() as i64)
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

pub fn list_dir(path: Option<&str>, show_hidden: bool) -> Result<FileListing> {
    let canonical = resolve_path(path)?;
    if !canonical.is_dir() {
        return Err(LinkSightError::CommandFailed("not a directory".into()));
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&canonical).map_err(map_io)? {
        let item = match item {
            Ok(v) => v,
            Err(_) => continue, // skip unreadable dirents
        };
        let name = item.file_name().to_string_lossy().into_owned();
        if !show_hidden && is_hidden(&name) {
            continue;
        }
        // Skip entries we cannot stat (e.g. mode 700 dirs belonging to other users)
        // instead of failing the whole listing.
        match entry_from_path(&item.path(), &name) {
            Ok(entry) => entries.push(entry),
            Err(_) => continue,
        }
    }

    sort_entries(&mut entries);
    Ok(FileListing {
        path: canonical.to_string_lossy().into_owned(),
        entries,
    })
}

pub fn mkdir(path: &str) -> Result<()> {
    fs::create_dir(path).map_err(map_io)?;
    Ok(())
}

pub fn rename(old_path: &str, new_path: &str) -> Result<()> {
    fs::rename(old_path, new_path).map_err(map_io)?;
    Ok(())
}

pub fn remove(path: &str, kind: &str) -> Result<()> {
    match kind {
        "dir" => fs::remove_dir_all(path).map_err(map_io),
        _ => fs::remove_file(path).map_err(map_io),
    }
    .map(|_| ())
}

#[cfg(unix)]
pub fn set_permissions(path: &str, mode: u32) -> Result<()> {
    let meta = fs::metadata(path).map_err(map_io)?;
    let current = meta.mode();
    let new_mode = (current & !0o777) | (mode & 0o777);
    fs::set_permissions(path, fs::Permissions::from_mode(new_mode)).map_err(map_io)?;
    Ok(())
}

#[cfg(not(unix))]
pub fn set_permissions(_path: &str, _mode: u32) -> Result<()> {
    Err(LinkSightError::NotImplemented(
        "chmod is only supported on Unix".into(),
    ))
}

pub fn read_file(path: &str) -> Result<Vec<u8>> {
    fs::read(path).map_err(map_io)
}

pub fn write_file(path: &str, data: &[u8]) -> Result<()> {
    fs::write(path, data).map_err(map_io)?;
    Ok(())
}

pub fn join_dir_file(dir: &str, name: &str) -> String {
    join_path(dir, name)
}
