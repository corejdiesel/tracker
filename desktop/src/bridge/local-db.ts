/**
 * Thin wrapper over the Tauri commands in `src-tauri/src/commands.rs`. This
 * is the ONLY place in the frontend that should call `invoke("db_*")`
 * directly — everything else goes through this module, so the shape of the
 * bridge can change in one place if the Rust side does.
 */
import { invoke } from "@tauri-apps/api/core";

export async function dbQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[]
): Promise<T[]> {
  return invoke<T[]>("db_query", { sql, params });
}

export async function dbExecute(sql: string, params: unknown[]): Promise<number> {
  return invoke<number>("db_execute", { sql, params });
}

/** Runs several statements as one transaction — see commands.rs for why the
 * sync engine's pull-apply step needs this over individual dbExecute calls. */
export async function dbExecuteBatch(
  statements: Array<[sql: string, params: unknown[]]>
): Promise<void> {
  return invoke<void>("db_execute_batch", { statements });
}
