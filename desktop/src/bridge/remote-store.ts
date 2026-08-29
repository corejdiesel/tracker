/**
 * A `RemoteStore` (see ../../../lib/sync/types.ts) over Neon, satisfying the
 * sync engine's other end — see ../../../lib/sync/engine.ts and
 * docs/desktop-architecture.md §4. Connection plumbing (the SET LOCAL
 * app.user_id pattern) lives in ./neon-connection.ts, shared with timer.ts.
 */
import type { RemoteStore, SyncedRow } from "../../../lib/sync/types";
import { assertSyncedTable, buildRemoteUpsert } from "../sync/columns";
import { connectAsUser } from "./neon-connection";

export function createRemoteStore(dsn: string, userId: string): RemoteStore {
  const conn = connectAsUser(dsn, userId);

  return {
    async readRemoteRow(tableName, rowId) {
      assertSyncedTable(tableName);
      const rows = await conn.query<SyncedRow>(
        `select * from public.${tableName} where id = $1`,
        [rowId]
      );
      return rows[0] ?? null;
    },

    async writeRemoteRow(tableName, _op, row) {
      assertSyncedTable(tableName);
      const { sql: upsertSql, params } = buildRemoteUpsert(tableName, row);
      await conn.query(upsertSql, params);
    },

    async readRemoteChanges(tableName, since) {
      assertSyncedTable(tableName);
      return conn.query<SyncedRow>(
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
