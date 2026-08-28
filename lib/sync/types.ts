/**
 * The sync engine's dependencies, as interfaces — not `better-sqlite3`, not
 * `@neondatabase/serverless` directly. That is what makes `engine.ts`
 * testable with plain in-memory fakes; see docs/desktop-architecture.md
 * §4.5. The Tauri command bridge (`desktop/src-tauri/src/commands.rs`)
 * satisfies `LocalStore`; a thin wrapper over `lib/db/client.ts`'s
 * `withUser()` satisfies `RemoteStore`. Neither adapter is wired up yet —
 * see the note in the commit this file ships in.
 */

/** Any row this engine moves must carry these three columns — every synced
 * table in both schemas does. */
export interface SyncedRow {
  id: string;
  updated_at: string; // ISO 8601 — compared lexicographically, like lib/dates.ts
  deleted_at: string | null;
  [column: string]: unknown;
}

export type SyncOp = "upsert" | "delete";

export interface OutboxEntry {
  id: string;
  tableName: string;
  rowId: string;
  /** Informational only — the wire write is identical either way (see
   * `pushOutbox`). This app soft-deletes everywhere: a "delete" IS an
   * upsert whose payload has `deleted_at` set, not a distinct kind of
   * write. Keeping `op` lets a local store track intent for its own UI
   * without the sync engine needing a second code path for it. */
  op: SyncOp;
  /** The row's full current state, INCLUDING `deleted_at` if this is a
   * delete — always present. An earlier version of this type made payload
   * null for a delete, which meant a push had nothing to actually write
   * `deleted_at` from; see the commit this fix shipped in. */
  payload: SyncedRow;
  createdAt: string;
}

export interface LocalStore {
  /** Rows currently queued for push, oldest first. */
  readOutbox(): Promise<OutboxEntry[]>;
  /** Remove an outbox entry once it has been pushed (or superseded). */
  clearOutboxEntry(id: string): Promise<void>;
  /** The current local row for a table/id, or null if absent. */
  readLocalRow(tableName: string, rowId: string): Promise<SyncedRow | null>;
  /** Write (upsert) a row pulled from the server into the local table. */
  writeLocalRow(tableName: string, row: SyncedRow): Promise<void>;
  /** The last-synced watermark for a table, or null if never synced. */
  readCursor(tableName: string): Promise<string | null>;
  writeCursor(tableName: string, lastSyncedAt: string): Promise<void>;
}

export interface RemoteStore {
  /** The current server row for a table/id, or null if absent (or deleted
   * with hard-delete semantics — this schema uses soft deletes, so a
   * present-but-deleted row is the normal shape, not null). */
  readRemoteRow(tableName: string, rowId: string): Promise<SyncedRow | null>;
  /** Upsert or soft-delete a row on the server. */
  writeRemoteRow(tableName: string, op: SyncOp, row: SyncedRow): Promise<void>;
  /** Rows changed on the server since `since` (exclusive), oldest first. */
  readRemoteChanges(tableName: string, since: string | null): Promise<SyncedRow[]>;
}
