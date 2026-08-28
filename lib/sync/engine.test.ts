import { describe, expect, it } from "vitest";
import { pullTable, pushOutbox, syncOnce } from "./engine";
import { createFakeLocalStore, createFakeRemoteStore } from "./test-fakes";
import type { SyncedRow } from "./types";

const row = (over: Partial<SyncedRow>): SyncedRow => ({
  id: "r1",
  updated_at: "2026-08-28T10:00:00.000Z",
  deleted_at: null,
  name: "test",
  ...over,
});

describe("pushOutbox", () => {
  it("pushes a new row that doesn't exist on the server yet", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({}), createdAt: "2026-08-28T10:00:00.000Z",
    });

    const result = await pushOutbox(local, remote);

    expect(result).toEqual({ pushed: 1, supersededByServer: 0, failed: 0 });
    expect(remote.rows.get("clients:r1")?.name).toBe("test");
    expect(local.outbox.size).toBe(0);
  });

  it("pushes a local edit that is newer than the server's copy", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z", name: "old" }));
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({ updated_at: "2026-08-28T10:00:00.000Z", name: "new" }),
      createdAt: "2026-08-28T10:00:00.000Z",
    });

    const result = await pushOutbox(local, remote);

    expect(result.pushed).toBe(1);
    expect(remote.rows.get("clients:r1")?.name).toBe("new");
  });

  it("drops (does not push) a queued edit the server already has a later write for", async () => {
    // The classic two-device race: this device queued an edit at 09:00 while
    // offline, but another device already pushed a 10:00 edit in the
    // meantime. Pushing the stale 09:00 edit would silently regress the row.
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z", name: "newer-elsewhere" }));
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({ updated_at: "2026-08-28T09:00:00.000Z", name: "stale" }),
      createdAt: "2026-08-28T09:00:00.000Z",
    });

    const result = await pushOutbox(local, remote);

    expect(result).toEqual({ pushed: 0, supersededByServer: 1, failed: 0 });
    // The server row is untouched — not overwritten with the stale value.
    expect(remote.rows.get("clients:r1")?.name).toBe("newer-elsewhere");
    // The outbox entry is cleared either way — the next pull brings the
    // correct (newer) version down; retrying this push forever would be wrong.
    expect(local.outbox.size).toBe(0);
  });

  it("pushes a delete as a soft-delete write — the whole point of this app never hard-deleting", async () => {
    // A delete's payload already carries deleted_at set, matching the
    // soft-delete convention everywhere else in this app. An earlier
    // version of this engine made a delete's payload null, which meant
    // there was nothing to actually write deleted_at from — this test
    // exists specifically because that bug shipped once already.
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z", deleted_at: null }));
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "delete",
      payload: row({ updated_at: "2026-08-28T10:00:00.000Z", deleted_at: "2026-08-28T10:00:00.000Z" }),
      createdAt: "2026-08-28T10:00:00.000Z",
    });

    await pushOutbox(local, remote);
    expect(remote.rows.get("clients:r1")?.deleted_at).toBe("2026-08-28T10:00:00.000Z");
  });

  it("drops a delete the server already has a later write for, same as an upsert", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z", name: "newer-elsewhere" }));
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "delete",
      payload: row({ updated_at: "2026-08-28T09:00:00.000Z", deleted_at: "2026-08-28T09:00:00.000Z" }),
      createdAt: "2026-08-28T09:00:00.000Z",
    });

    const result = await pushOutbox(local, remote);
    expect(result).toEqual({ pushed: 0, supersededByServer: 1, failed: 0 });
    expect(remote.rows.get("clients:r1")?.deleted_at).toBeNull();
  });

  it("leaves a failed push in the outbox for retry rather than dropping it", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.failWritesFor.add("clients");
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({}), createdAt: "2026-08-28T10:00:00.000Z",
    });

    const result = await pushOutbox(local, remote);

    expect(result).toEqual({ pushed: 0, supersededByServer: 0, failed: 1 });
    expect(local.outbox.size).toBe(1); // still there, will retry next tick
  });

  it("processes the outbox oldest-first, so two edits to one row settle on the last one written", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    // Both queued while offline: first "draft", then "final" a minute later.
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({ updated_at: "2026-08-28T10:00:00.000Z", name: "draft" }),
      createdAt: "2026-08-28T10:00:00.000Z",
    });
    local.outbox.set("o2", {
      id: "o2", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({ updated_at: "2026-08-28T10:01:00.000Z", name: "final" }),
      createdAt: "2026-08-28T10:01:00.000Z",
    });

    await pushOutbox(local, remote);

    expect(remote.rows.get("clients:r1")?.name).toBe("final");
  });
});

describe("pullTable", () => {
  it("writes a server row that doesn't exist locally yet", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:r1", row({}));

    const result = await pullTable(local, remote, "clients");

    expect(result).toEqual({ written: 1, skippedLocalNewer: 0 });
    expect(local.rows.get("clients:r1")?.name).toBe("test");
  });

  it("overwrites the local row when the server's is newer", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z", name: "old" }));
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z", name: "new" }));

    const result = await pullTable(local, remote, "clients");

    expect(result.written).toBe(1);
    expect(local.rows.get("clients:r1")?.name).toBe("new");
  });

  it("does NOT overwrite a local row with a not-yet-pushed newer edit", async () => {
    // The mirror image of the outbox-supersede test: the local device has an
    // edit the server hasn't seen yet. A pull happening before that edit is
    // pushed must not clobber it with the older server value.
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z", name: "un-pushed-edit" }));
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z", name: "stale-on-server" }));

    const result = await pullTable(local, remote, "clients");

    expect(result).toEqual({ written: 0, skippedLocalNewer: 1 });
    expect(local.rows.get("clients:r1")?.name).toBe("un-pushed-edit");
  });

  it("advances the cursor past a skipped row, not just applied ones", async () => {
    // If the cursor only advanced on writes, the skipped row above would be
    // re-fetched every single sync forever, since it's always > any earlier
    // cursor. The cursor tracks pull progress, not application.
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z" }));
    remote.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z" }));

    await pullTable(local, remote, "clients");

    expect(local.cursors.get("clients")).toBe("2026-08-28T09:00:00.000Z");
  });

  it("only fetches changes after the cursor, and advances it to the latest seen", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.cursors.set("clients", "2026-08-28T09:00:00.000Z");
    remote.rows.set("clients:old", row({ id: "old", updated_at: "2026-08-28T08:00:00.000Z" }));
    remote.rows.set("clients:new", row({ id: "new", updated_at: "2026-08-28T10:00:00.000Z" }));

    const result = await pullTable(local, remote, "clients");

    expect(result.written).toBe(1); // only "new" — "old" is before the cursor
    expect(local.rows.has("clients:old")).toBe(false);
    expect(local.cursors.get("clients")).toBe("2026-08-28T10:00:00.000Z");
  });

  it("treats a delete as an ordinary write — a later delete wins over an earlier edit", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.rows.set("clients:r1", row({ updated_at: "2026-08-28T09:00:00.000Z", deleted_at: null }));
    remote.rows.set(
      "clients:r1",
      row({ updated_at: "2026-08-28T10:00:00.000Z", deleted_at: "2026-08-28T10:00:00.000Z" })
    );

    await pullTable(local, remote, "clients");

    expect(local.rows.get("clients:r1")?.deleted_at).toBe("2026-08-28T10:00:00.000Z");
  });

  it("does not touch the cursor when there is nothing new", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.cursors.set("clients", "2026-08-28T09:00:00.000Z");

    await pullTable(local, remote, "clients");

    expect(local.cursors.get("clients")).toBe("2026-08-28T09:00:00.000Z");
  });
});

describe("syncOnce", () => {
  it("pushes before pulling, so a local edit isn't raced by its own pull", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    local.rows.set("clients:r1", row({ updated_at: "2026-08-28T10:00:00.000Z", name: "local-edit" }));
    local.outbox.set("o1", {
      id: "o1", tableName: "clients", rowId: "r1", op: "upsert",
      payload: row({ updated_at: "2026-08-28T10:00:00.000Z", name: "local-edit" }),
      createdAt: "2026-08-28T10:00:00.000Z",
    });

    const { push, pulls } = await syncOnce(local, remote);

    expect(push.pushed).toBe(1);
    // Having just been pushed, the pull for "clients" sees this row on the
    // server at the same updated_at as local — not newer, so not re-applied.
    expect(pulls.clients.written).toBe(0);
    expect(local.rows.get("clients:r1")?.name).toBe("local-edit");
  });

  it("pulls every synced table, not just the one that had outbox activity", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("time_entries:t1", row({ id: "t1" }));

    const { pulls } = await syncOnce(local, remote);

    expect(pulls.time_entries.written).toBe(1);
    expect(Object.keys(pulls)).toContain("expenses");
    expect(Object.keys(pulls)).toContain("invoices");
  });
});
