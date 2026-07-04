//! SQLite-backed result storage using `sqlx` (runtime queries, no compile-time
//! DB required).

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;

use super::schema::SCHEMA;
use crate::error::{LinkSightError, Result};
use crate::network::model::NetworkTestResult;

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
}
