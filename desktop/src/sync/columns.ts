import { SYNCED_TABLES, type SyncedTable } from "../../../lib/sync/engine";
import type { SyncedRow } from "../../../lib/sync/types";

export function assertSyncedTable(tableName: string): asserts tableName is SyncedTable {
  if (!(SYNCED_TABLES as readonly string[]).includes(tableName)) {
    throw new Error(`"${tableName}" is not a synced table`);
  }
}

/**
 * Every column each table carries beyond id/created_at/updated_at/deleted_at
 * (handled generically below) — the intersection of the local SQLite schema
 * (`src-tauri/migrations/0001_local.sql`) and the Postgres one
 * (`db/migrations/0001_initial_schema.sql`, `0002_time_and_work_log.sql`).
 * The two schemas are kept column-identical on purpose so this list needs
 * no per-direction filtering beyond REMOTE_GENERATED_COLUMNS below — a
 * mismatch here would silently drop data in one sync direction, so if a
 * migration adds a column to one schema, add it to the other and to this
 * list in the same change.
 */
export const TABLE_COLUMNS: Record<SyncedTable, readonly string[]> = {
  clients: [
    "name", "company_number", "vat_number", "default_day_rate_pence",
    "payment_terms_days", "vat_treatment", "notes",
  ],
  projects: [
    "client_id", "name", "status", "fee_structure", "fee_pence", "day_rate_pence",
    "estimated_days", "probability", "starts_on", "ends_on", "notes",
  ],
  invoices: [
    "client_id", "project_id", "number", "issue_date", "due_date",
    "subtotal_pence", "vat_pence", "total_pence", "status", "paid_on", "notes",
  ],
  expenses: [
    "spent_on", "vendor", "net_pence", "vat_pence", "gross_pence", "category_slug",
    "entity", "business_percent", "is_capital_asset", "disallowable", "project_id",
    "recurring_cost_id", "attachment_path", "source", "source_ref", "confidence",
  ],
  recurring_costs: [
    "vendor", "amount_pence", "cadence", "next_charge_on", "category_slug",
    "cancel_by", "dependency", "last_reviewed_on", "active",
  ],
  tasks: [
    "project_id", "engagement_window_id", "title", "due_on", "estimate_hours",
    "status", "source", "source_ref", "confidence",
  ],
  time_entries: [
    "project_id", "task_id", "worked_on", "minutes", "note", "billable",
    "source", "source_ref",
  ],
};

/**
 * Columns Postgres computes itself (`generated always as (...) stored`) —
 * writable in the local SQLite copy (which has no equivalent generated-column
 * story that plays nicely with whole-row sync writes, so the local schema
 * just stores them as plain columns), but never sent on a write to Postgres:
 * it would reject an explicit value for a generated column outright.
 */
export const REMOTE_GENERATED_COLUMNS: Partial<Record<SyncedTable, readonly string[]>> = {
  invoices: ["total_pence"],
  expenses: ["gross_pence"],
};

/**
 * Columns that are `boolean` in Postgres but SQLite INTEGER 0/1 locally
 * (SQLite has no boolean type). Pulling FROM Postgres needs no special
 * handling here — a JSON boolean in a pulled row is converted to SQLite's
 * integer 0/1 by `db.rs`'s `json_to_sql` on the way into `db_execute`, same
 * as it already does for every other boolean-shaped value. Only the PUSH
 * direction needs the explicit coercion below (see buildRemoteUpsert): the
 * Postgres wire protocol has no implicit integer→boolean cast for a bound
 * parameter, so sending a raw 0/1 there fails outright rather than doing
 * something quietly wrong.
 */
export const BOOLEAN_COLUMNS: Partial<Record<SyncedTable, readonly string[]>> = {
  recurring_costs: ["active"],
  expenses: ["is_capital_asset", "disallowable"],
  time_entries: ["billable"],
};

function coerceForRemote(tableName: SyncedTable, column: string, value: unknown): unknown {
  const booleans = BOOLEAN_COLUMNS[tableName];
  if (booleans?.includes(column)) {
    return typeof value === "number" ? value !== 0 : Boolean(value);
  }
  return value ?? null;
}

/**
 * The upsert Postgres runs for one pushed row — see docs/desktop-architecture
 * §4.3. `owner_id` is set from the authenticated session context
 * (`public.app_user_id()`, set by the caller's SET LOCAL — see
 * lib/db/client.ts's SET_USER_CONTEXT for the same pattern on the web side),
 * never taken from the row itself: nothing client-supplied should be able to
 * assign a row to a different owner. `id` and `created_at` are set on
 * insert only — the `on conflict` branch deliberately excludes them, so an
 * update never rewrites when a row was first created.
 */
export function buildRemoteUpsert(
  tableName: SyncedTable,
  row: SyncedRow
): { sql: string; params: unknown[] } {
  const generated = new Set(REMOTE_GENERATED_COLUMNS[tableName] ?? []);
  const columns = TABLE_COLUMNS[tableName].filter((c) => !generated.has(c));

  const allColumns = ["id", "created_at", "updated_at", "deleted_at", ...columns];
  const params: unknown[] = [
    row.id,
    row.created_at,
    row.updated_at,
    row.deleted_at,
    ...columns.map((c) => coerceForRemote(tableName, c, row[c])),
  ];

  const placeholders = allColumns.map((_, i) => `$${i + 1}`).join(", ");
  const updateSet = ["updated_at", "deleted_at", ...columns]
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const sql =
    `insert into public.${tableName} (owner_id, ${allColumns.join(", ")}) ` +
    `values ((select public.app_user_id()), ${placeholders}) ` +
    `on conflict (id) do update set ${updateSet}`;

  return { sql, params };
}

/**
 * The upsert the local SQLite database runs for one pulled row. No
 * generated-column exclusion or boolean coercion needed here — the local
 * schema has no generated columns, and `db.rs`'s `json_to_sql` already
 * normalises a JSON boolean to SQLite's integer 0/1 on its own.
 */
export function buildLocalUpsert(
  tableName: SyncedTable,
  row: SyncedRow
): { sql: string; params: unknown[] } {
  const columns = TABLE_COLUMNS[tableName];
  const allColumns = ["id", "created_at", "updated_at", "deleted_at", ...columns];
  const params: unknown[] = [
    row.id,
    row.created_at,
    row.updated_at,
    row.deleted_at,
    ...columns.map((c) => row[c] ?? null),
  ];

  const placeholders = allColumns.map(() => "?").join(", ");
  const updateSet = ["updated_at", "deleted_at", ...columns]
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const sql =
    `insert into ${tableName} (${allColumns.join(", ")}) values (${placeholders}) ` +
    `on conflict (id) do update set ${updateSet}`;

  return { sql, params };
}
