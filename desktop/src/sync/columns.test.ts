import { describe, expect, it } from "vitest";
import { assertSyncedTable, buildLocalUpsert, buildRemoteUpsert } from "./columns";
import type { SyncedRow } from "../../../lib/sync/types";

const row = (over: Partial<SyncedRow>): SyncedRow => ({
  id: "r1",
  updated_at: "2026-08-28T10:00:00.000Z",
  deleted_at: null,
  ...over,
});

describe("assertSyncedTable", () => {
  it("accepts a real synced table", () => {
    expect(() => assertSyncedTable("clients")).not.toThrow();
  });

  it("rejects an arbitrary string — never trust a table name that didn't come from SYNCED_TABLES", () => {
    expect(() => assertSyncedTable("users")).toThrow('"users" is not a synced table');
    expect(() => assertSyncedTable("clients; drop table clients;--")).toThrow();
  });
});

describe("buildRemoteUpsert", () => {
  it("excludes a Postgres-generated column from the write, even though the row carries it", () => {
    const { sql, params } = buildRemoteUpsert(
      "invoices",
      row({
        id: "i1", created_at: "2026-08-01T00:00:00.000Z",
        client_id: "c1", project_id: null, number: "INV-1",
        issue_date: "2026-08-01", due_date: "2026-08-31",
        subtotal_pence: 10000, vat_pence: 2000, total_pence: 12000,
        status: "draft", paid_on: null, notes: null,
      })
    );

    // Not a bare .not.toContain("total_pence") — "subtotal_pence" is a
    // legitimate column and contains that same substring.
    expect(sql).not.toMatch(/\btotal_pence\b/);
    expect(sql).toContain("insert into public.invoices");
    expect(sql).toContain("(select public.app_user_id())");
    // subtotal_pence and vat_pence are still written — only the generated
    // column is dropped.
    expect(params).toContain(10000);
    expect(params).toContain(2000);
    expect(params).not.toContain(12000);
  });

  it("never updates id or created_at on conflict, so a re-push can't rewrite when a row was first created", () => {
    const { sql } = buildRemoteUpsert(
      "clients",
      row({ id: "c1", created_at: "2026-08-01T00:00:00.000Z", name: "Alice" })
    );

    const updateClause = sql.split("do update set")[1];
    expect(updateClause).toBeDefined();
    expect(updateClause).not.toMatch(/\bid\s*=/);
    expect(updateClause).not.toMatch(/\bcreated_at\s*=/);
    expect(updateClause).toContain("updated_at = excluded.updated_at");
    expect(updateClause).toContain("name = excluded.name");
  });

  it("coerces a SQLite 0/1 into a real boolean for a Postgres boolean column", () => {
    const { sql, params } = buildRemoteUpsert(
      "time_entries",
      row({
        id: "t1", created_at: "2026-08-01T00:00:00.000Z",
        project_id: "p1", task_id: null, worked_on: "2026-08-26",
        minutes: 90, note: null, billable: 0, source: "manual", source_ref: null,
      })
    );

    expect(sql).toContain("billable");
    expect(params).toContain(false);
    expect(params).not.toContain(0);
  });

  it("coerces a truthy SQLite 1 into boolean true, not the number 1", () => {
    const { params } = buildRemoteUpsert(
      "recurring_costs",
      row({
        id: "rc1", created_at: "2026-08-01T00:00:00.000Z",
        vendor: "Figma", amount_pence: 1500, cadence: "monthly",
        next_charge_on: "2026-09-01", category_slug: "software",
        cancel_by: null, dependency: "discretionary", last_reviewed_on: null,
        active: 1,
      })
    );

    expect(params).toContain(true);
    expect(params).not.toContain(1);
  });
});

describe("buildLocalUpsert", () => {
  it("writes every column, including ones Postgres computes — the local schema has no generated columns", () => {
    const { sql, params } = buildLocalUpsert(
      "invoices",
      row({
        id: "i1", created_at: "2026-08-01T00:00:00.000Z",
        client_id: "c1", project_id: null, number: "INV-1",
        issue_date: "2026-08-01", due_date: "2026-08-31",
        subtotal_pence: 10000, vat_pence: 2000, total_pence: 12000,
        status: "draft", paid_on: null, notes: null,
      })
    );

    expect(sql).toContain("total_pence");
    expect(params).toContain(12000);
  });

  it("uses ? placeholders (SQLite), not $N (Postgres)", () => {
    const { sql } = buildLocalUpsert("clients", row({ name: "Alice" }));
    expect(sql).toContain("?");
    expect(sql).not.toMatch(/\$\d/);
  });

  it("falls back to null for a column the row doesn't carry", () => {
    const { params } = buildLocalUpsert("clients", row({ name: "Alice" }));
    // company_number, vat_number, etc. are absent from the row above.
    expect(params).toContain(null);
  });
});
