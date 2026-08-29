/**
 * A `LocalStore` (see ../../../lib/sync/types.ts) over the Tauri-bridged
 * SQLite database (`./local-db.ts`, which talks to `src-tauri/src/db.rs`).
 */
import { dbExecute, dbExecuteBatch, dbQuery } from "./local-db";
import type { LocalStore, OutboxEntry, SyncedRow } from "../../../lib/sync/types";
import { assertSyncedTable, buildLocalUpsert } from "../sync/columns";

interface OutboxRow extends Record<string, unknown> {
  id: string;
  table_name: string;
  row_id: string;
  op: "upsert" | "delete";
  payload: string; // JSON, see 0001_local.sql's comment on why it's always present
  created_at: string;
}

export function createLocalStore(): LocalStore {
  return {
    async readOutbox(): Promise<OutboxEntry[]> {
      const rows = await dbQuery<OutboxRow>(
        "select id, table_name, row_id, op, payload, created_at from outbox order by created_at",
        []
      );
      return rows.map((r) => ({
        id: r.id,
        tableName: r.table_name,
        rowId: r.row_id,
        op: r.op,
        payload: JSON.parse(r.payload) as SyncedRow,
        createdAt: r.created_at,
      }));
    },

    async clearOutboxEntry(id: string): Promise<void> {
      await dbExecute("delete from outbox where id = ?", [id]);
    },

    async readLocalRow(tableName: string, rowId: string): Promise<SyncedRow | null> {
      assertSyncedTable(tableName);
      const rows = await dbQuery<SyncedRow>(`select * from ${tableName} where id = ?`, [rowId]);
      return rows[0] ?? null;
    },

    async writeLocalRow(tableName: string, row: SyncedRow): Promise<void> {
      assertSyncedTable(tableName);
      const { sql, params } = buildLocalUpsert(tableName, row);
      await dbExecute(sql, params);
    },

    async readCursor(tableName: string): Promise<string | null> {
      const rows = await dbQuery<{ last_synced_at: string }>(
        "select last_synced_at from sync_cursor where table_name = ?",
        [tableName]
      );
      return rows[0]?.last_synced_at ?? null;
    },

    async writeCursor(tableName: string, lastSyncedAt: string): Promise<void> {
      await dbExecute(
        `insert into sync_cursor (table_name, last_synced_at) values (?, ?)
           on conflict (table_name) do update set last_synced_at = excluded.last_synced_at`,
        [tableName, lastSyncedAt]
      );
    },
  };
}

/**
 * Queues a local mutation for push AND applies it to the local table, in one
 * SQLite transaction — see desktop/README.md's TODO: "every local mutation
 * has to insert an outbox row alongside its actual table write, in the same
 * transaction." Nothing calls this yet (no mutation UI exists beyond the
 * placeholder screen — see docs/desktop-architecture.md §2), but it's the
 * one function any future create/edit/delete screen writes through, so the
 * outbox-write half of the plumbing doesn't get rebuilt per-screen.
 */
export async function writeLocalMutation(
  tableName: string,
  op: "upsert" | "delete",
  row: SyncedRow,
  outboxId: string
): Promise<void> {
  assertSyncedTable(tableName);
  const { sql: upsertSql, params: upsertParams } = buildLocalUpsert(tableName, row);
  await dbExecuteBatch([
    [upsertSql, upsertParams],
    [
      "insert into outbox (id, table_name, row_id, op, payload, created_at) values (?, ?, ?, ?, ?, ?)",
      [outboxId, tableName, row.id, op, JSON.stringify(row), row.updated_at],
    ],
  ]);
}
