/**
 * Placeholder shell — proves the Tauri window boots, can reach the local
 * database, and (when configured) syncs against Neon. Not a port of the
 * eleven web-app screens. See docs/desktop-architecture.md §2 for what this
 * pass is and isn't.
 */
import { useEffect, useState } from "react";
import { dbQuery } from "./bridge/local-db";
import { createLocalStore } from "./bridge/local-store";
import { createRemoteStore } from "./bridge/remote-store";
import { readSyncConfig } from "./config";
import { startSyncLoop, type Scheduler, type SyncTickResult } from "./sync/scheduler";

const SYNC_INTERVAL_MS = 30_000;

type SyncStatus =
  | { kind: "not-configured" }
  | { kind: "idle" }
  | { kind: "ok"; result: SyncTickResult; at: Date }
  | { kind: "error"; error: unknown; at: Date };

export function App() {
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ kind: "idle" });

  useEffect(() => {
    dbQuery<{ n: number }>("select count(*) as n from clients where deleted_at is null", [])
      .then((rows) => setClientCount(rows[0]?.n ?? 0))
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    const config = readSyncConfig();
    if (!config) {
      setSync({ kind: "not-configured" });
      return;
    }

    let scheduler: Scheduler | undefined;
    scheduler = startSyncLoop({
      local: createLocalStore(),
      remote: createRemoteStore(config.dsn, config.userId),
      intervalMs: SYNC_INTERVAL_MS,
      onResult: (result) => setSync({ kind: "ok", result, at: new Date() }),
      onError: (err) => setSync({ kind: "error", error: err, at: new Date() }),
    });

    return () => scheduler?.stop();
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Freelance OS</h1>
      <p>Local-first shell — proving the plumbing, not the UI.</p>
      {error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : (
        <p>Clients in the local database: {clientCount ?? "…"}</p>
      )}
      <p style={{ fontSize: 13, color: sync.kind === "error" ? "crimson" : "#555" }}>
        {syncStatusText(sync)}
      </p>
    </main>
  );
}

function syncStatusText(sync: SyncStatus): string {
  switch (sync.kind) {
    case "not-configured":
      return "Sync: not configured — set VITE_NEON_DSN and VITE_USER_ID in desktop/.env.local (see .env.example).";
    case "idle":
      return "Sync: starting…";
    case "ok":
      return `Sync: last ran ${sync.at.toLocaleTimeString()} — pushed ${sync.result.push.pushed}, pulled ${totalPulled(sync.result)} row(s).`;
    case "error":
      return `Sync: failed at ${sync.at.toLocaleTimeString()} — ${String(sync.error)}`;
  }
}

function totalPulled(result: SyncTickResult): number {
  return Object.values(result.pulls).reduce((sum, p) => sum + p.written, 0);
}
