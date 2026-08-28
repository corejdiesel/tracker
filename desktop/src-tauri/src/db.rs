//! Local SQLite access. The schema itself lives in `migrations/0001_local.sql`
//! and is embedded at compile time — there is exactly one copy of it, the
//! same file `scripts/verify-local-schema.mjs` runs against `node:sqlite`.
//!
//! This module is deliberately thin: a connection, a migration runner, and
//! parameterised query/execute. It does NOT implement sync policy — no
//! conflict resolution, no outbox reconciliation. That logic lives in
//! TypeScript (`desktop/src/sync/`) specifically so it can be unit tested
//! without a Tauri runtime; see docs/desktop-architecture.md §4.5. Rust's
//! job is just to be a safe, parameterised bridge to the file on disk.

use rusqlite::{Connection, params_from_iter, types::Value as SqlValue};
use serde_json::{Map, Value as JsonValue};
use std::path::Path;
use std::sync::Mutex;

const LOCAL_SCHEMA: &str = include_str!("../migrations/0001_local.sql");

pub struct Db(pub Mutex<Connection>);

#[derive(thiserror::Error, Debug)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

impl serde::Serialize for DbError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub fn open(db_path: &Path) -> Result<Connection, DbError> {
    let conn = Connection::open(db_path)?;
    // Required on every connection — SQLite does not enforce foreign keys by
    // default even though the schema declares them. See the note at the top
    // of 0001_local.sql.
    conn.execute("pragma foreign_keys = on", [])?;
    conn.execute_batch(LOCAL_SCHEMA)?;
    Ok(conn)
}

/// A JSON value from a bound parameter, converted to rusqlite's dynamic
/// `Value`. Only the shapes the frontend actually sends are supported —
/// nested objects/arrays are rejected rather than silently stringified,
/// since a caller doing that almost certainly has a bug.
fn json_to_sql(value: &JsonValue) -> Result<SqlValue, DbError> {
    Ok(match value {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or_default())
            }
        }
        JsonValue::String(s) => SqlValue::Text(s.clone()),
        other => {
            return Err(DbError::Json(serde_json::Error::io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("unsupported bound parameter shape: {other}"),
            ))))
        }
    })
}

fn sql_to_json(value: rusqlite::types::ValueRef) -> JsonValue {
    match value {
        rusqlite::types::ValueRef::Null => JsonValue::Null,
        rusqlite::types::ValueRef::Integer(i) => JsonValue::from(i),
        rusqlite::types::ValueRef::Real(f) => JsonValue::from(f),
        rusqlite::types::ValueRef::Text(t) => {
            JsonValue::String(String::from_utf8_lossy(t).into_owned())
        }
        rusqlite::types::ValueRef::Blob(_) => JsonValue::Null, // not used by this schema
    }
}

/// Run a SELECT with bound parameters, returning each row as a JSON object
/// keyed by column name — the shape the sync engine and the frontend both
/// expect, matching PostgREST's row shape closely enough that the two data
/// layers can share types on the TypeScript side.
pub fn query(
    conn: &Connection,
    sql: &str,
    params: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, DbError> {
    let bound: Vec<SqlValue> = params.iter().map(json_to_sql).collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare(sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt.query_map(params_from_iter(bound), |row| {
        let mut obj = Map::new();
        for (i, name) in column_names.iter().enumerate() {
            obj.insert(name.clone(), sql_to_json(row.get_ref(i)?));
        }
        Ok(JsonValue::Object(obj))
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
}

/// Run an INSERT/UPDATE/DELETE with bound parameters. Returns rows affected.
pub fn execute(conn: &Connection, sql: &str, params: Vec<JsonValue>) -> Result<usize, DbError> {
    let bound: Vec<SqlValue> = params.iter().map(json_to_sql).collect::<Result<_, _>>()?;
    Ok(conn.execute(sql, params_from_iter(bound))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// In-memory connection with the real schema applied — same file
    /// `scripts/verify-local-schema.mjs` runs against `node:sqlite` from the
    /// JS side, so both runtimes are checked against one source of truth.
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("pragma foreign_keys = on", []).unwrap();
        conn.execute_batch(LOCAL_SCHEMA).unwrap();
        conn
    }

    #[test]
    fn schema_applies_cleanly() {
        test_conn();
    }

    #[test]
    fn query_returns_json_rows_shaped_like_the_columns() {
        let conn = test_conn();
        execute(
            &conn,
            "insert into clients (id, name, created_at, updated_at) values (?, ?, ?, ?)",
            vec![
                JsonValue::String("c1".into()),
                JsonValue::String("Alice".into()),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
            ],
        )
        .unwrap();

        let rows = query(&conn, "select id, name from clients", vec![]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], JsonValue::String("c1".into()));
        assert_eq!(rows[0]["name"], JsonValue::String("Alice".into()));
    }

    #[test]
    fn a_check_constraint_violation_surfaces_as_an_error_not_a_silent_no_op() {
        let conn = test_conn();
        let result = execute(
            &conn,
            "insert into time_entries (id, project_id, worked_on, minutes, created_at, updated_at)
               values ('t1', 'no-such-project', '2026-08-28', 0, '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z')",
            vec![],
        );
        assert!(result.is_err(), "expected the zero-minutes check to reject this insert");
    }

    #[test]
    fn null_round_trips_as_json_null_not_as_a_missing_key() {
        let conn = test_conn();
        execute(
            &conn,
            "insert into clients (id, name, company_number, created_at, updated_at) values (?, ?, NULL, ?, ?)",
            vec![
                JsonValue::String("c2".into()),
                JsonValue::String("Bob".into()),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
            ],
        )
        .unwrap();

        let rows = query(&conn, "select company_number from clients where id = 'c2'", vec![]).unwrap();
        assert_eq!(rows[0]["company_number"], JsonValue::Null);
    }

    #[test]
    fn unsupported_nested_parameter_shapes_are_rejected_not_silently_stringified() {
        let conn = test_conn();
        let result = execute(
            &conn,
            "insert into clients (id, name, created_at, updated_at) values (?, ?, ?, ?)",
            vec![
                JsonValue::String("c3".into()),
                serde_json::json!({ "nested": true }),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
                JsonValue::String("2026-08-28T00:00:00Z".into()),
            ],
        );
        assert!(result.is_err());
    }
}
