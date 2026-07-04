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
    pub port: u16,
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
        Ok(())
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
            "SELECT id, alias, hostname, username, ip, password, port, created_at, updated_at \
             FROM hosts ORDER BY alias COLLATE NOCASE",
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
                port: r.get::<i64, _>("port") as u16,
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
            .collect())
    }

    pub async fn insert_host(&self, host: &HostRecord) -> Result<()> {
        sqlx::query(
            "INSERT INTO hosts (id, alias, hostname, username, ip, password, port) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(host.id.as_str())
        .bind(host.alias.as_str())
        .bind(host.hostname.as_deref())
        .bind(host.username.as_str())
        .bind(host.ip.as_str())
        .bind(host.password.as_deref())
        .bind(host.port as i64)
        .execute(&self.pool)
        .await
        .map_err(|e| LinkSightError::CommandFailed(e.to_string()))?;
        Ok(())
    }

    pub async fn update_host(&self, host: &HostRecord) -> Result<()> {
        sqlx::query(
            "UPDATE hosts SET alias = ?, hostname = ?, username = ?, ip = ?, \
             password = ?, port = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(host.alias.as_str())
        .bind(host.hostname.as_deref())
        .bind(host.username.as_str())
        .bind(host.ip.as_str())
        .bind(host.password.as_deref())
        .bind(host.port as i64)
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
}
