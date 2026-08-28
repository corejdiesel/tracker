//! Tauri commands — the JS ↔ Rust bridge. Each command is a thin wrapper:
//! `db.rs` does the SQL, `keychain.rs` does credential storage, this file
//! just exposes them with `#[tauri::command]` and converts errors to
//! strings Tauri can serialise back to the frontend.

use crate::db::{self, Db};
use serde_json::Value as JsonValue;
use tauri::State;

fn poisoned() -> String {
    "the local database connection was poisoned by a panic in another command — restart the app"
        .to_string()
}

#[tauri::command]
pub fn db_query(db: State<Db>, sql: String, params: Vec<JsonValue>) -> Result<Vec<JsonValue>, String> {
    let conn = db.0.lock().map_err(|_| poisoned())?;
    db::query(&conn, &sql, params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_execute(db: State<Db>, sql: String, params: Vec<JsonValue>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|_| poisoned())?;
    db::execute(&conn, &sql, params).map_err(|e| e.to_string())
}

/// Runs several statements as one transaction — used by the sync engine when
/// applying a pulled batch, so a failure partway through a pull can't leave
/// the local database with half a batch's changes and a cursor that thinks
/// otherwise.
#[tauri::command]
pub fn db_execute_batch(
    db: State<Db>,
    statements: Vec<(String, Vec<JsonValue>)>,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|_| poisoned())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (sql, params) in statements {
        db::execute(&tx, &sql, params).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_set(account: String, secret: String) -> Result<(), String> {
    crate::keychain::set(&account, &secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(account: String) -> Result<Option<String>, String> {
    crate::keychain::get(&account).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_delete(account: String) -> Result<(), String> {
    crate::keychain::delete(&account).map_err(|e| e.to_string())
}
