//! SQLite-backed result storage using `sqlx` (runtime queries, no compile-time
//! DB required).

use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;

use super::schema::SCHEMA;
use crate::error::{LinkSightError, Result};
use crate::network::model::NetworkTestResult;
use crate::network::scan::DiscoveredDevice;

/// A saved remote host (Termius-style host manager entry).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    pub id: String,
    pub alias: String,
    pub hostname: Option<String>,
    pub username: String,
    pub ip: String,
    /// Plaintext for now (local tool); to be encrypted later.
    pub password: Option<String>,
    /// `None` or `0` = use SSH default (22) at connect time; field left empty in UI.
    pub port: Option<u16>,
    /// `ssh` (default) or `password`.
    pub auth_mode: String,
    /// Local private-key file path (required for SSH mode).
    pub ssh_private_key_path: Option<String>,
    /// Optional public key pasted for first-time deploy (otherwise derived from private key).
    pub ssh_public_key: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Thin handle around a shared SQLite connection pool.
#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
}

impl Db {
    /// Open (creating if needed) the SQLite database at `path` and apply schema.
    pub async fn connect(path: &str) -> Result<Self> {
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{path}"))
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

        let db = Self { pool };
        db.init().await?;
        Ok(db)
    }

    async fn init(&self) -> Result<()> {
        sqlx::raw_sql(SCHEMA)
            .execute(&self.pool)
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        self.migrate_hosts().await?;
        Ok(())
    }

    /// Best-effort schema patches for existing databases.
    async fn migrate_hosts(&self) -> Result<()> {
        for sql in [
            "ALTER TABLE hosts ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'ssh'",
            "ALTER TABLE hosts ADD COLUMN ssh_private_key_path TEXT",
            "ALTER TABLE hosts ADD COLUMN ssh_public_key TEXT",
            "ALTER TABLE hosts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        ] {
            let _ = sqlx::query(sql).execute(&self.pool).await;
        }
        // Legacy: public-key path → infer private-key path (strip `.pub`).
        let _ = sqlx::query(
            "UPDATE hosts SET ssh_private_key_path = \
             CASE WHEN ssh_public_key_path LIKE '%.pub' \
                  THEN substr(ssh_public_key_path, 1, length(ssh_public_key_path) - 4) \
                  ELSE ssh_public_key_path END \
             WHERE ssh_private_key_path IS NULL AND ssh_public_key_path IS NOT NULL",
        )
        .execute(&self.pool)
        .await;
        Ok(())
    }

    fn port_from_db(raw: i64) -> Option<u16> {
        if raw == 0 {
            None
        } else {
            Some(raw as u16)
        }
    }

    fn port_to_db(port: Option<u16>) -> i64 {
        port.filter(|&p| p > 0).unwrap_or(0) as i64
    }

    /// Persist a completed network test.
    pub async fn save_test(&self, result: &NetworkTestResult) -> Result<()> {
        let summary_json = serde_json::to_string(&result.summary)
            .map_err(|e| LinkSightError::Parse(e.to_string()))?;
        let kind = serde_json::to_value(result.kind)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default();
        let mode = serde_json::to_value(result.mode)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default();
        let status = serde_json::to_value(result.status)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default();

        sqlx::query(
            "INSERT INTO network_tests \
             (id, kind, mode, target, status, started_at, duration_ms, summary_json, raw, error) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(result.id.as_str())
        .bind(kind)
        .bind(mode)
        .bind(result.target.as_str())
        .bind(status)
        .bind(result.started_at.as_str())
        .bind(result.duration_ms as i64)
        .bind(summary_json)
        .bind(result.raw.as_deref())
        .bind(result.error.as_deref())
        .execute(&self.pool)
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

        Ok(())
    }

    /// Insert or refresh discovered devices (keyed on address).
    pub async fn upsert_devices(&self, devices: &[DiscoveredDevice]) -> Result<()> {
        for device in devices {
            sqlx::query(
                "INSERT INTO devices (id, name, address, mac, last_seen) \
                 VALUES (?, ?, ?, ?, datetime('now')) \
                 ON CONFLICT(address) DO UPDATE SET \
                    name = COALESCE(excluded.name, devices.name), \
                    mac = COALESCE(excluded.mac, devices.mac), \
                    last_seen = excluded.last_seen",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(device.hostname.as_deref())
            .bind(device.ip.as_str())
            .bind(device.mac.as_deref())
            .execute(&self.pool)
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        }
        Ok(())
    }

    // ---- Hosts (saved remote machines) --------------------------------------

    pub async fn list_hosts(&self) -> Result<Vec<HostRecord>> {
        let rows = sqlx::query(
            "SELECT id, alias, hostname, username, ip, password, port, \
             COALESCE(auth_mode, 'ssh') AS auth_mode, \
             ssh_private_key_path, ssh_public_key, created_at, updated_at \
             FROM hosts ORDER BY COALESCE(sort_order, 0) ASC, alias COLLATE NOCASE",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|r| HostRecord {
                id: r.get("id"),
                alias: r.get("alias"),
                hostname: r.get("hostname"),
                username: r.get("username"),
                ip: r.get("ip"),
                password: r.get("password"),
                port: Self::port_from_db(r.get::<i64, _>("port")),
                auth_mode: r.get("auth_mode"),
                ssh_private_key_path: r.get("ssh_private_key_path"),
                ssh_public_key: r.get("ssh_public_key"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
            .collect())
    }

    pub async fn host_exists(&self, id: &str) -> Result<bool> {
        let row = sqlx::query("SELECT 1 FROM hosts WHERE id = ? LIMIT 1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(row.is_some())
    }

    pub async fn insert_host(&self, host: &HostRecord) -> Result<()> {
        let next_order: i64 =
            sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM hosts")
                .fetch_one(&self.pool)
                .await
                .unwrap_or(0);

        sqlx::query(
            "INSERT INTO hosts \
             (id, alias, hostname, username, ip, password, port, auth_mode, \
              ssh_private_key_path, ssh_public_key, sort_order) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(host.id.as_str())
        .bind(host.alias.as_str())
        .bind(host.hostname.as_deref())
        .bind(host.username.as_str())
        .bind(host.ip.as_str())
        .bind(host.password.as_deref())
        .bind(Self::port_to_db(host.port))
        .bind(host.auth_mode.as_str())
        .bind(host.ssh_private_key_path.as_deref())
        .bind(host.ssh_public_key.as_deref())
        .bind(next_order)
        .execute(&self.pool)
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(())
    }

    pub async fn update_host(&self, host: &HostRecord) -> Result<()> {
        sqlx::query(
            "UPDATE hosts SET alias = ?, hostname = ?, username = ?, ip = ?, \
             password = ?, port = ?, auth_mode = ?, ssh_private_key_path = ?, \
             ssh_public_key = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(host.alias.as_str())
        .bind(host.hostname.as_deref())
        .bind(host.username.as_str())
        .bind(host.ip.as_str())
        .bind(host.password.as_deref())
        .bind(Self::port_to_db(host.port))
        .bind(host.auth_mode.as_str())
        .bind(host.ssh_private_key_path.as_deref())
        .bind(host.ssh_public_key.as_deref())
        .bind(host.id.as_str())
        .execute(&self.pool)
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(())
    }

    pub async fn delete_host(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM hosts WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(())
    }

    /// Persist display order. `ids` is the full ordered list of host ids.
    pub async fn reorder_hosts(&self, ids: &[String]) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        for (index, id) in ids.iter().enumerate() {
            sqlx::query("UPDATE hosts SET sort_order = ? WHERE id = ?")
                .bind(index as i64)
                .bind(id.as_str())
                .execute(&mut *tx)
                .await
                .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        }
        tx.commit()
            .await
            .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_host(id: &str) -> HostRecord {
        HostRecord {
            id: id.to_string(),
            alias: "lab-server".into(),
            hostname: Some("server.local".into()),
            username: "admin".into(),
            ip: "192.168.1.10".into(),
            password: None,
            port: None,
            auth_mode: "ssh".into(),
            ssh_private_key_path: Some("/home/user/.ssh/id_ed25519".into()),
            ssh_public_key: None,
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn hosts_persist_across_db_reconnect() {
        let path =
            std::env::temp_dir().join(format!("linksight-host-test-{}.db", uuid::Uuid::new_v4()));
        let path_str = path.to_string_lossy().to_string();

        let id = uuid::Uuid::new_v4().to_string();
        {
            let db = Db::connect(&path_str).await.expect("open db");
            db.insert_host(&sample_host(&id))
                .await
                .expect("insert host");
        }

        let db = Db::connect(&path_str).await.expect("reopen db");
        let hosts = db.list_hosts().await.expect("list hosts");
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].id, id);
        assert_eq!(hosts[0].alias, "lab-server");

        let mut updated = hosts[0].clone();
        updated.alias = "lab-updated".into();
        db.update_host(&updated).await.expect("update host");

        drop(db);
        let db = Db::connect(&path_str).await.expect("reopen after update");
        let hosts = db.list_hosts().await.expect("list after update");
        assert_eq!(hosts[0].alias, "lab-updated");

        db.delete_host(&id).await.expect("delete host");
        assert!(db.list_hosts().await.expect("list after delete").is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn host_exists_detects_saved_rows() {
        let path =
            std::env::temp_dir().join(format!("linksight-host-exists-{}.db", uuid::Uuid::new_v4()));
        let path_str = path.to_string_lossy().to_string();
        let id = uuid::Uuid::new_v4().to_string();

        let db = Db::connect(&path_str).await.expect("open db");
        assert!(!db.host_exists(&id).await.expect("exists check"));
        db.insert_host(&sample_host(&id))
            .await
            .expect("insert host");
        assert!(db.host_exists(&id).await.expect("exists check"));

        let _ = std::fs::remove_file(path);
    }
}
