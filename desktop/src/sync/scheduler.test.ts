import { describe, expect, it, vi } from "vitest";
import { startSyncLoop } from "./scheduler";
import { createFakeLocalStore, createFakeRemoteStore } from "../../../lib/sync/test-fakes";

/** A no-op fake for window's on/off — startSyncLoop takes these injectable
 * so its reconnect wiring is testable without a real `window`. */
function fakeWindowEvents() {
  const listeners = new Map<string, () => void>();
  return {
    add: vi.fn((event: string, handler: () => void) => listeners.set(event, handler)),
    remove: vi.fn((event: string) => listeners.delete(event)),
    fire(event: string) {
      listeners.get(event)?.();
    },
  };
}

describe("startSyncLoop", () => {
  it("runs one sync immediately on startup, without waiting for the first interval", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    remote.rows.set("clients:c1", {
      id: "c1", updated_at: "2026-08-28T10:00:00.000Z", deleted_at: null, name: "Alice",
    });
    const onResult = vi.fn();
    const events = fakeWindowEvents();

    const scheduler = startSyncLoop({
      local, remote, intervalMs: 60_000, onResult,
      setIntervalFn: vi.fn().mockReturnValue(1) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn(),
      addEventListenerFn: events.add as unknown as typeof window.addEventListener,
      removeEventListenerFn: events.remove as unknown as typeof window.removeEventListener,
    });

    // The startup run is fire-and-forget (not awaited internally) — give its
    // microtasks a turn.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(local.rows.get("clients:c1")?.name).toBe("Alice");
    scheduler.stop();
  });

  it("syncs again on a browser 'online' event, not just on the interval", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    const onResult = vi.fn();
    const events = fakeWindowEvents();

    const scheduler = startSyncLoop({
      local, remote, intervalMs: 60_000, onResult,
      setIntervalFn: vi.fn().mockReturnValue(1) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn(),
      addEventListenerFn: events.add as unknown as typeof window.addEventListener,
      removeEventListenerFn: events.remove as unknown as typeof window.removeEventListener,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResult).toHaveBeenCalledTimes(1);

    events.fire("online");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onResult).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("reports a failure via onError instead of throwing, and doesn't get stuck", async () => {
    const local = createFakeLocalStore();
    const remote = createFakeRemoteStore();
    const onResult = vi.fn();
    const onError = vi.fn();
    const events = fakeWindowEvents();

    // A rejected push (network, auth) is caught inside pushOutbox itself and
    // shows up as `failed` in a normal PushResult — see lib/sync/engine.ts —
    // so it exercises onResult, not onError. pullTable has no such
    // try/catch, so a rejected readRemoteChanges is what actually reaches
    // syncOnce uncaught, which is what this scheduler is meant to catch.
    const throwingRemote = {
      ...remote,
      readRemoteChanges: () => Promise.reject(new Error("network down")),
    };

    startSyncLoop({
      local, remote: throwingRemote, intervalMs: 60_000, onResult, onError,
      setIntervalFn: vi.fn().mockReturnValue(1) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn(),
      addEventListenerFn: events.add as unknown as typeof window.addEventListener,
      removeEventListenerFn: events.remove as unknown as typeof window.removeEventListener,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("does not overlap a second run while one is already in flight", async () => {
    const local = createFakeLocalStore();
    let resolveFirstRead: () => void = () => {};
    const remote = createFakeRemoteStore();
    let readCount = 0;
    const slowRemote = {
      ...remote,
      readRemoteChanges: async (tableName: string, since: string | null) => {
        readCount++;
        if (readCount === 1) {
          await new Promise<void>((resolve) => { resolveFirstRead = resolve; });
        }
        return remote.readRemoteChanges(tableName, since);
      },
    };
    const events = fakeWindowEvents();

    const scheduler = startSyncLoop({
      local, remote: slowRemote, intervalMs: 60_000,
      setIntervalFn: vi.fn().mockReturnValue(1) as unknown as typeof setInterval,
      clearIntervalFn: vi.fn(),
      addEventListenerFn: events.add as unknown as typeof window.addEventListener,
      removeEventListenerFn: events.remove as unknown as typeof window.removeEventListener,
    });

    // Let the startup run progress until it blocks on the slow read.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readCount).toBe(1);

    // A second call while a run is already in flight must be a no-op, not a
    // second concurrent pull.
    await scheduler.runNow();
    expect(readCount).toBe(1);

    resolveFirstRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.stop();
  });
});
