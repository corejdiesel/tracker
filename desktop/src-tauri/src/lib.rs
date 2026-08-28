mod commands;
mod db;
mod keychain;

use db::Db;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // The database lives in the app's own data directory, not
            // alongside the binary — so it survives an app update and isn't
            // wiped by reinstalling.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("local.db");

            let conn = db::open(&db_path)
                .map_err(|e| format!("failed to open local database at {db_path:?}: {e}"))?;

            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_query,
            commands::db_execute,
            commands::db_execute_batch,
            commands::keychain_set,
            commands::keychain_get,
            commands::keychain_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Freelance OS desktop shell");
}
