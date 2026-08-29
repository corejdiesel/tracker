/**
 * Calls `syncOnce()` on an interval and immediately on reconnect — see
 * desktop/README.md's TODO: "call syncOnce() from lib/sync/engine.ts on an
 * interval and on reconnect, surfacing failures rather than swallowing
 * them." One tick runs at a time: `navigator.onLine` flapping or a slow
 * network response can't stack overlapping syncs on top of each other.
 */
import { syncOnce, type PullResult, type PushResult, type SyncedTable } from "../../../lib/sync/engine";
import type { LocalStore, RemoteStore } from "../../../lib/sync/types";

export interface SyncTickResult {
  push: PushResult;
  pulls: Record<SyncedTable, PullResult>;
}

export interface SchedulerOptions {
  local: LocalStore;
  remote: RemoteStore;
  intervalMs: number;
  onResult?: (result: SyncTickResult) => void;
  onError?: (error: unknown) => void;
  /** Injectable for tests — defaults to the real globals. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  addEventListenerFn?: typeof window.addEventListener;
  removeEventListenerFn?: typeof window.removeEventListener;
}

export interface Scheduler {
  /** Runs one sync tick immediately, outside the interval — used for the
   * initial sync on startup and the reconnect listener. Safe to call while
   * a tick is already running: it's a no-op in that case, not a second
   * concurrent sync. */
  runNow: () => Promise<void>;
  stop: () => void;
}

export function startSyncLoop(options: SchedulerOptions): Scheduler {
  const {
    local, remote, intervalMs, onResult, onError,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    addEventListenerFn = window.addEventListener.bind(window),
    removeEventListenerFn = window.removeEventListener.bind(window),
  } = options;

  let inFlight = false;

  const runNow = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await syncOnce(local, remote);
      onResult?.(result);
    } catch (error) {
      onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const handle = setIntervalFn(() => void runNow(), intervalMs);
  const onOnline = () => void runNow();
  addEventListenerFn("online", onOnline);
  void runNow(); // don't wait for the first tick to sync on startup

  return {
    runNow,
    stop() {
      clearIntervalFn(handle);
      removeEventListenerFn("online", onOnline);
    },
  };
}
