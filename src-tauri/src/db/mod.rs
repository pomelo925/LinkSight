//! Local persistence (SQLite via sqlx).

pub mod schema;
pub mod store;

pub use store::Db;
