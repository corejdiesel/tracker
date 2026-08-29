/**
 * A `RemoteStore` (see ../../../lib/sync/types.ts) over Neon, satisfying the
 * sync engine's other end — see ../../../lib/sync/engine.ts and
 * docs/desktop-architecture.md §4.
 *
 * This deliberately does NOT reuse lib/db/client.ts's `withUser()` verbatim,
 * even though the SET LOCAL app.user_id pattern is identical: that module
 * reads its connection string from `process.env.NEON_DSN`, which doesn't
 * exist in a Tauri webview (it's a browser-like runtime, not Node) — `dsn`
 * has to come in as an explicit argument here instead, sourced from Vite's
 * `import.meta.env` (see ../config.ts). The query shape itself is copied
 * from there on purpose: same driver, same one-transaction-per-call pattern,
 * same reason (`SET LOCAL` only applies for the transaction it's set
 * within, so it can never leak onto a reused connection).
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { RemoteStore, SyncedRow } from "../../../lib/sync/types";
import { assertSyncedTable, buildRemoteUpsert } from "../sync/columns";

const SET_USER_CONTEXT = "select set_config('app.user_id', $1, true)";

async function withUserContext<T>(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  text: string,
  params: unknown[]
): Promise<T[]> {
  const results = await sql.transaction((txn) => [
    txn.query(SET_USER_CONTEXT, [userId]),
    txn.query(text, params),
  ]);
  return results[1] as T[];
}

export function createRemoteStore(dsn: string, userId: string): RemoteStore {
  const sql = neon(dsn);

  return {
    async readRemoteRow(tableName, rowId) {
      assertSyncedTable(tableName);
      const rows = await withUserContext<SyncedRow>(
        sql, userId,
        `select * from public.${tableName} where id = $1`,
        [rowId]
      );
      return rows[0] ?? null;
    },

    async writeRemoteRow(tableName, _op, row) {
      assertSyncedTable(tableName);
      const { sql: upsertSql, params } = buildRemoteUpsert(tableName, row);
      await withUserContext(sql, userId, upsertSql, params);
    },

    async readRemoteChanges(tableName, since) {
      assertSyncedTable(tableName);
      return withUserContext<SyncedRow>(
        sql, userId,
        // Every synced row is soft-deleted, never hard-deleted, so a delete
        // has to come through here too (deleted_at set, but the row still
        // present) — filtering it out would mean a delete on one device
        // never reaches another. See docs/desktop-architecture.md §4.1a.
        `select * from public.${tableName}
          where $1::timestamptz is null or updated_at > $1::timestamptz
          order by updated_at`,
        [since]
      );
    },
  };
}
