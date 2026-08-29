//! Screen capture — a single still frame of the primary monitor, base64-PNG
//! encoded for the trip over Tauri's IPC to the frontend.
//!
//! On macOS this requires the "Screen Recording" permission (System
//! Settings → Privacy & Security → Screen Recording); the OS prompts for it
//! the first time a capture is attempted, and — per Apple's own behaviour,
//! not something this code controls — the app may need re-launching after
//! the permission is granted before capture actually starts working.
//! UNVERIFIED in this environment: there is no display server, and no
//! macOS, to exercise a real capture against — see docs/desktop-architecture.md §3.
//!
//! `xcap` re-exports the exact `image` crate version its own `RgbaImage`
//! return type uses (`xcap::image`), so this uses that re-export rather
//! than adding a second `image` dependency that could drift out of step.

use base64::{engine::general_purpose::STANDARD, Engine};
use std::io::Cursor;
use xcap::{image::ImageFormat, Monitor};

#[tauri::command]
pub fn capture_screen() -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitor found to capture".to_string())?;

    let image = monitor.capture_image().map_err(|e| e.to_string())?;

    let mut bytes: Vec<u8> = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(STANDARD.encode(&bytes))
}
