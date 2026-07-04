//! SQLite schema. Kept as plain SQL so it's easy to inspect and evolve.
//!
//! Tables are intentionally extensible (JSON `metadata` columns + nullable
//! metric fields) so new test kinds don't require migrations.

pub const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    address       TEXT NOT NULL,
    mac           TEXT,
    last_seen     TEXT,
    metadata      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS network_tests (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL,          -- ping | traceroute | scan | speedtest | iperf | latency
    mode          TEXT NOT NULL,          -- basic | advanced
    target        TEXT NOT NULL,
    status        TEXT NOT NULL,          -- success | failed
    started_at    TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    summary_json  TEXT,                   -- serialized TestSummary
    raw           TEXT,
    error         TEXT,
    device_id     TEXT REFERENCES devices(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved remote hosts (Termius-style host manager).
-- NOTE: passwords are stored in plaintext for now (local tool); encrypt later.
CREATE TABLE IF NOT EXISTS hosts (
    id            TEXT PRIMARY KEY,
    alias         TEXT NOT NULL,
    hostname      TEXT,
    username      TEXT NOT NULL,
    ip            TEXT NOT NULL,
    password      TEXT,
    port          INTEGER NOT NULL DEFAULT 22,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS ssh_sessions (
    id            TEXT PRIMARY KEY,
    host          TEXT NOT NULL,
    port          INTEGER NOT NULL DEFAULT 22,
    username      TEXT NOT NULL,
    identity_file TEXT,
    last_used     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bandwidth_results (
    id            TEXT PRIMARY KEY,
    test_id       TEXT REFERENCES network_tests(id) ON DELETE CASCADE,
    upload_mbps   REAL,
    download_mbps REAL,
    protocol      TEXT,                   -- tcp | udp
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS latency_results (
    id            TEXT PRIMARY KEY,
    test_id       TEXT REFERENCES network_tests(id) ON DELETE CASCADE,
    rtt_min_ms    REAL,
    rtt_avg_ms    REAL,
    rtt_max_ms    REAL,
    jitter_ms     REAL,
    packet_loss   REAL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_network_tests_kind ON network_tests(kind);
CREATE INDEX IF NOT EXISTS idx_network_tests_target ON network_tests(target);

-- One row per discovered address; enables upsert on rescan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_address ON devices(address);
"#;
