// Prevents an extra console window from popping up on Windows in release
// builds — the standard Tauri boilerplate for this, harmless elsewhere.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    freelance_os_desktop_lib::run()
}
