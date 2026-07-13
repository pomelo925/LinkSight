//! SFTP browsing and file operations over an authenticated SSH session.

use std::time::Duration;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, OpenFlags};
use tokio::io::AsyncWriteExt;

use super::exec::{connect_and_authenticate, SshTarget};
use crate::error::{LinkSightError, Result};
use crate::fs::local;
use crate::fs::types::{
    format_permissions, group_name, join_path, owner_name, sort_entries, FileEntry, FileListing,
};

const OP_TIMEOUT: Duration = Duration::from_secs(30);

async fn with_sftp<F, Fut, T>(target: &SshTarget, f: F) -> Result<T>
where
    F: FnOnce(SftpSession) -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let fut = async {
        let session = connect_and_authenticate(target).await?;
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("open session: {e}")))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("request sftp subsystem: {e}")))?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("sftp init: {e}")))?;
        f(sftp).await
    };

    tokio::time::timeout(OP_TIMEOUT, fut)
        .await
        .map_err(|_| LinkSightError::CommandFailed("SFTP operation timed out".into()))?
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn entry_from_remote(base: &str, name: &str, meta: &russh_sftp::client::fs::Metadata) -> FileEntry {
    let is_dir = meta.is_dir();
    let is_symlink = meta.is_symlink();
    let kind = if is_dir {
        "dir"
    } else if is_symlink {
        "symlink"
    } else {
        "file"
    };
    let mode = meta.permissions;
    let uid = meta.uid;
    let gid = meta.gid;
    FileEntry {
        path: join_path(base, name),
        name: name.to_string(),
        kind: kind.to_string(),
        size: if is_dir { None } else { meta.size },
        modified: meta.mtime.map(|t| t as i64),
        permissions: mode
            .map(|m| format_permissions(m, is_dir, is_symlink))
            .unwrap_or_else(|| format_permissions(0, is_dir, is_symlink)),
        mode,
        uid,
        gid,
        owner: uid.map(owner_name).or_else(|| meta.user.clone()),
        group: gid.map(group_name).or_else(|| meta.group.clone()),
    }
}

pub async fn list_dir(
    target: &SshTarget,
    path: Option<&str>,
    show_hidden: bool,
) -> Result<FileListing> {
    let requested = path
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .unwrap_or(".")
        .to_string();

    with_sftp(target, |sftp| async move {
        let canonical = sftp
            .canonicalize(&requested)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("resolve path: {e}")))?;

        let dir = sftp
            .read_dir(&canonical)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("read dir: {e}")))?;

        let mut entries = Vec::new();
        for entry in dir {
            let name = entry.file_name();
            if !show_hidden && is_hidden(&name) {
                continue;
            }
            entries.push(entry_from_remote(&canonical, &name, &entry.metadata()));
        }

        sort_entries(&mut entries);
        Ok(FileListing {
            path: canonical,
            entries,
        })
    })
    .await
}

pub async fn mkdir(target: &SshTarget, path: &str) -> Result<()> {
    with_sftp(target, |sftp| async move {
        sftp.create_dir(path)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("mkdir: {e}")))?;
        Ok(())
    })
    .await
}

pub async fn rename(target: &SshTarget, old_path: &str, new_path: &str) -> Result<()> {
    with_sftp(target, |sftp| async move {
        sftp.rename(old_path, new_path)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("rename: {e}")))?;
        Ok(())
    })
    .await
}

pub async fn remove(target: &SshTarget, path: &str, kind: &str) -> Result<()> {
    with_sftp(target, |sftp| async move {
        let result = if kind == "dir" {
            sftp.remove_dir(path).await
        } else {
            sftp.remove_file(path).await
        };
        result.map_err(|e| LinkSightError::CommandFailed(format!("remove: {e}")))?;
        Ok(())
    })
    .await
}

pub async fn set_permissions(target: &SshTarget, path: &str, mode: u32) -> Result<()> {
    with_sftp(target, |sftp| async move {
        let mut attrs = FileAttributes::empty();
        attrs.permissions = Some(mode & 0o777);
        sftp.set_metadata(path, attrs)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("set permissions: {e}")))?;
        Ok(())
    })
    .await
}

pub async fn upload_file(target: &SshTarget, local_path: &str, remote_dir: &str) -> Result<()> {
    let data = local::read_file(local_path)?;
    let name = std::path::Path::new(local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| LinkSightError::InvalidInput("invalid local path".into()))?;
    let remote_path = join_path(remote_dir, name);

    with_sftp(target, |sftp| async move {
        let mut file = sftp
            .open_with_flags(
                &remote_path,
                OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
            )
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("open remote: {e}")))?;
        file.write_all(&data)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("write remote: {e}")))?;
        file.shutdown()
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("close remote: {e}")))?;
        Ok(())
    })
    .await
}

pub async fn download_file(target: &SshTarget, remote_path: &str, local_dir: &str) -> Result<()> {
    let name = std::path::Path::new(remote_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| LinkSightError::InvalidInput("invalid remote path".into()))?;
    let local_path = local::join_dir_file(local_dir, name);

    with_sftp(target, |sftp| async move {
        let data = sftp
            .read(remote_path)
            .await
            .map_err(|e| LinkSightError::CommandFailed(format!("read remote: {e}")))?;
        local::write_file(&local_path, &data)?;
        Ok(())
    })
    .await
}
