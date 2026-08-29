import { describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above these imports by vitest's transform, so the
// fakes it returns must be created inside vi.hoisted() — a plain `const`
// here would still be in its temporal dead zone when the hoisted mock
// factory runs.
const { dbExecuteBatch, dbExecute, dbQuery } = vi.hoisted(() => ({
  dbExecuteBatch: vi.fn().mockResolvedValue(undefined),
  dbExecute: vi.fn().mockResolvedValue(0),
  dbQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock("./local-db", () => ({ dbExecuteBatch, dbExecute, dbQuery }));

const { writeLocalMutation } = await import("./local-store");

describe("writeLocalMutation", () => {
  it("writes the row and queues an outbox entry in one batch, not two separate calls", async () => {
    await writeLocalMutation(
      "clients",
      "upsert",
      { id: "c1", updated_at: "2026-08-28T10:00:00.000Z", deleted_at: null, name: "Alice" },
      "outbox-1"
    );

    expect(dbExecuteBatch).toHaveBeenCalledTimes(1);
    expect(dbExecute).not.toHaveBeenCalled(); // not two round trips

    const [statements] = dbExecuteBatch.mock.calls[0] as [Array<[string, unknown[]]>];
    expect(statements).toHaveLength(2);

    const [upsertSql] = statements[0]!;
    expect(upsertSql).toContain("insert into clients");

    const [outboxSql, outboxParams] = statements[1]!;
    expect(outboxSql).toContain("insert into outbox");
    expect(outboxParams).toEqual([
      "outbox-1", "clients", "c1", "upsert",
      JSON.stringify({ id: "c1", updated_at: "2026-08-28T10:00:00.000Z", deleted_at: null, name: "Alice" }),
      "2026-08-28T10:00:00.000Z",
    ]);
  });

  it("rejects a table name that isn't in the synced set before touching the database", async () => {
    await expect(
      writeLocalMutation("users", "upsert", { id: "x", updated_at: "now", deleted_at: null }, "o2")
    ).rejects.toThrow('"users" is not a synced table');
  });
});
