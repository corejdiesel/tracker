import type { LocalStore, OutboxEntry, RemoteStore, SyncedRow, SyncOp } from "./types";

/**
 * In-memory fakes, not mocks — real Maps behind the interfaces, so the
 * engine tests exercise actual read-your-writes behaviour rather than
 * asserting on call counts. Exported (not test-only) so a future adapter's
 * own tests can reuse them as a reference implementation of the contract.
 */
export function createFakeLocalStore(): LocalStore & {
  outbox: Map<string, OutboxEntry>;
  rows: Map<string, SyncedRow>;
  cursors: Map<string, string>;
} {
  const outbox = new Map<string, OutboxEntry>();
  const rows = new Map<string, SyncedRow>(); // key: `${tableName}:${id}`
  const cursors = new Map<string, string>();
  const key = (tableName: string, id: string) => `${tableName}:${id}`;

  return {
    outbox,
    rows,
    cursors,
    async readOutbox() {
      return [...outbox.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async clearOutboxEntry(id) {
      outbox.delete(id);
    },
    async readLocalRow(tableName, rowId) {
      return rows.get(key(tableName, rowId)) ?? null;
    },
    async writeLocalRow(tableName, row) {
      rows.set(key(tableName, row.id), row);
    },
    async readCursor(tableName) {
      return cursors.get(tableName) ?? null;
    },
    async writeCursor(tableName, lastSyncedAt) {
      cursors.set(tableName, lastSyncedAt);
    },
  };
}

export function createFakeRemoteStore(): RemoteStore & {
  rows: Map<string, SyncedRow>;
  /** When set, every write to this table throws — simulates a network or
   * auth failure for testing the retry-left-in-outbox path. */
  failWritesFor: Set<string>;
} {
  const rows = new Map<string, SyncedRow>();
  const failWritesFor = new Set<string>();
  const key = (tableName: string, id: string) => `${tableName}:${id}`;

  return {
    rows,
    failWritesFor,
    async readRemoteRow(tableName, rowId) {
      return rows.get(key(tableName, rowId)) ?? null;
    },
    async writeRemoteRow(tableName: string, _op: SyncOp, row: SyncedRow) {
      if (failWritesFor.has(tableName)) throw new Error(`simulated failure writing ${tableName}`);
      rows.set(key(tableName, row.id), row);
    },
    async readRemoteChanges(tableName, since) {
      const prefix = `${tableName}:`;
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, row]) => row)
        .filter((r) => !since || r.updated_at > since)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    },
  };
}
