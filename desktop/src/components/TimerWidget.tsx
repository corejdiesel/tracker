/**
 * Top-right billing timer. Talks straight to bridge/timer.ts (Neon, not the
 * local-first sync engine — see that file for why). Polls every 15s to
 * notice a start/stop from elsewhere (the web app, say), and ticks its own
 * display every second in between so the number doesn't visibly stall.
 *
 * Extension point for periodic-screenshot capture: that feature should hook
 * into handleStart/handleStop here (start the capture interval alongside
 * the timer, stop it when the timer stops) — not built yet, this is just
 * where it plugs in.
 */
import { useEffect, useState } from "react";
import type { ActiveProject, RunningTimer, TimerClient } from "../bridge/timer";

const POLL_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;

function formatElapsed(startedAt: string, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export { formatElapsed };

export function TimerWidget({ client }: { client: TimerClient | null }) {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [projects, setProjects] = useState<ActiveProject[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const activeClient = client;
    let cancelled = false;

    async function poll() {
      try {
        const t = await activeClient.getRunningTimer();
        if (!cancelled) {
          setTimer(t);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client]);

  useEffect(() => {
    if (!client || timer) return;
    let cancelled = false;
    client
      .listActiveProjects()
      .then((p) => {
        if (!cancelled) setProjects(p);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, timer]);

  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [timer]);

  if (!client) return null;

  async function handleStart() {
    if (!selectedProject || !client) return;
    setBusy(true);
    setError(null);
    try {
      await client.startTimer(selectedProject);
      setTimer(await client.getRunningTimer());
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await client.stopTimer();
      setTimer(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
        fontFamily: "system-ui",
        fontSize: 13,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        minWidth: 160,
      }}
    >
      {timer ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 16 }}>
              {formatElapsed(timer.startedAt, now)}
            </span>
            <button onClick={() => void handleStop()} disabled={busy} style={{ fontSize: 11 }}>
              {busy ? "…" : "Stop"}
            </button>
          </div>
          <span style={{ color: "#666", textAlign: "right" }}>
            {timer.clientName ? `${timer.clientName} — ` : ""}
            {timer.projectName}
          </span>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{ fontSize: 12 }}
          >
            <option value="">Start billing…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clientName ? `${p.clientName} — ` : ""}
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={() => void handleStart()} disabled={busy || !selectedProject} style={{ fontSize: 11 }}>
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      )}
      {error ? <span style={{ color: "crimson", fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}
