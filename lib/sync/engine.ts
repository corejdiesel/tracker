import type { LocalStore, RemoteStore, SyncedRow } from "./types";

/**
 * True if `a` is strictly later than `b`. Both are ISO 8601 timestamps in
 * the same format (UTC, same precision) — ordinary `<`/`>` on strings gives
 * the right chronological order for that shape, the same property
 * `lib/dates.ts` relies on for date-only strings. This is NOT safe for
 * timestamps in different formats or timezones; every writer in this system
 * (Postgres's `timestamptz` serialised by PostgREST, and SQLite rows written
 * by this engine) produces the same UTC/`Z` shape, so the assumption holds
 * — but it is an assumption, not a general-purpose date comparison.
 */
function isNewer(a: string, b: string): boolean {
  return a > b;
}

export interface PushResult {
  pushed: number;
  /** Dropped because the server already had a later write — not an error,
   * the next pull brings that version down. */
  supersededByServer: number;
  /** Left in the outbox for retry — a push actually failed (network, auth). */
  failed: number;
}

/**
 * Push every queued local write to the server, oldest first — see
 * docs/desktop-architecture.md §4.3. Processes entries strictly in order:
 * an older queued write for the same row must be evaluated (and likely
 * dropped as superseded) before a newer one for that same row is pushed,
 * so two edits to one row while offline resolve to the last one written,
 * not whichever happened to reach the network first.
 */
export async function pushOutbox(local: LocalStore, remote: RemoteStore): Promise<PushResult> {
  const result: PushResult = { pushed: 0, supersededByServer: 0, failed: 0 };
  const entries = await local.readOutbox();

  for (const entry of entries) {
    try {
      const serverRow = await remote.readRemoteRow(entry.tableName, entry.rowId);

      if (serverRow && !isNewer(entry.payload.updated_at, serverRow.updated_at)) {
        // The server already has a write at least as new as this one.
        result.supersededByServer++;
        await local.clearOutboxEntry(entry.id);
        continue;
      }

      // Same write either way — a delete's payload already carries
      // `deleted_at` set, so there is nothing op-specific left to do here.
      await remote.writeRemoteRow(entry.tableName, entry.op, entry.payload);
      result.pushed++;
      await local.clearOutboxEntry(entry.id);
    } catch {
      // Left in place — the caller's next sync tick retries it. `attempts`
      // bookkeeping is the local store's responsibility (it owns the row),
      // not this function's; the engine only decides whether to retry, not
      // how retries are counted or backed off.
      result.failed++;
    }
  }

  return result;
}

export interface PullResult {
  written: number;
  /** Skipped because the local copy has a newer, not-yet-pushed edit. */
  skippedLocalNewer: number;
}

/**
 * Pull server changes for one table since the last cursor — see
 * docs/desktop-architecture.md §4.4. The cursor advances over every row
 * the server returned, including ones skipped as locally-superseded:
 * the cursor means "how far the pull has progressed," not "what got
 * applied" — advancing only on applied rows would re-fetch a skipped row
 * forever until its local edit happens to get pushed first.
 */
export async function pullTable(
  local: LocalStore,
  remote: RemoteStore,
  tableName: string
): Promise<PullResult> {
  const result: PullResult = { written: 0, skippedLocalNewer: 0 };
  const cursor = await local.readCursor(tableName);
  const changes = await remote.readRemoteChanges(tableName, cursor);

  let latestSeen = cursor;

  for (const serverRow of changes) {
    const localRow = await local.readLocalRow(tableName, serverRow.id);

    if (!localRow || isNewer(serverRow.updated_at, localRow.updated_at)) {
      await local.writeLocalRow(tableName, serverRow);
      result.written++;
    } else {
      result.skippedLocalNewer++;
    }

    if (!latestSeen || isNewer(serverRow.updated_at, latestSeen)) {
      latestSeen = serverRow.updated_at;
    }
  }

  if (latestSeen && latestSeen !== cursor) {
    await local.writeCursor(tableName, latestSeen);
  }

  return result;
}

/** Rows this engine knows how to sync — matches the tables in
 * `desktop/src-tauri/migrations/0001_local.sql`, minus the two bookkeeping
 * tables that are local-only and never themselves synced. */
export const SYNCED_TABLES = [
  "clients",
  "projects",
  "invoices",
  "expenses",
  "recurring_costs",
  "tasks",
  "time_entries",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** One full round: push everything queued, then pull every table. Push goes
 * first so a local edit doesn't get raced by a pull that hasn't seen it yet. */
export async function syncOnce(
  local: LocalStore,
  remote: RemoteStore
): Promise<{ push: PushResult; pulls: Record<SyncedTable, PullResult> }> {
  const push = await pushOutbox(local, remote);
  const pulls = {} as Record<SyncedTable, PullResult>;

  for (const table of SYNCED_TABLES) {
    pulls[table] = await pullTable(local, remote, table);
  }

  return { push, pulls };
}

export type { LocalStore, RemoteStore, SyncedRow };
