/**
 * Thin wrapper over the `capture_screen` Tauri command (src-tauri/src/capture.rs).
 * Returns a base64-encoded PNG of the primary monitor. On macOS this needs
 * the "Screen Recording" permission — the OS prompts for it on first use;
 * see capture.rs's doc comment for what's unverified about that from here.
 */
import { invoke } from "@tauri-apps/api/core";

export async function captureScreen(): Promise<string> {
  return invoke<string>("capture_screen");
}
