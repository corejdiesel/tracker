/**
 * Top-right billing timer. Talks straight to bridge/timer.ts (Neon, not the
 * local-first sync engine — see that file for why). Polls every 15s to
 * notice a start/stop from elsewhere (the web app, say), and ticks its own
 * display every second in between so the number doesn't visibly stall.
 *
 * When VITE_OLLAMA_VISION_MODEL is set (see ../config.ts), starting the
 * timer also starts periodic screen capture: every CAPTURE_INTERVAL_MS,
 * grab a frame (bridge/screen-capture.ts), describe it with a local Ollama
 * vision model (ai/session-summary.ts), and keep only that one sentence —
 * the frame itself never touches disk and is discarded the moment the
 * description comes back, per the "not necessarily looked back at" brief.
 * Deliberately local-only (no cloud fallback if Ollama isn't running) since
 * frames can show client work or HMRC/MTD screens. At Stop, the
 * accumulated sentences are combined into one draft work-log note, shown
 * for review/edit before anything is actually saved — same "estimate,
 * never an asserted fact" rule as everywhere else in this app.
 *
 * KNOWN LIMITATION: the running_timers row in Postgres isn't cleared until
 * the review step's Save is clicked, so closing the app (or just not
 * finishing the review) mid-review leaves the timer running there — the
 * elapsed time shown on the eventual save reflects whenever stopTimer()
 * actually runs, not the moment Stop was first clicked. Acceptable for a
 * single-operator tool; a real "pending stop" would need a new column this
 * schema doesn't have.
 */
import { useEffect, useState } from "react";
import { describeFrame, synthesizeSessionNote, type FrameNote } from "../ai/session-summary";
import { captureScreen } from "../bridge/screen-capture";
import type { ActiveProject, RunningTimer, TimerClient } from "../bridge/timer";

const POLL_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;
const CAPTURE_INTERVAL_MS = 5 * 60_000;

function formatElapsed(startedAt: string, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export { formatElapsed };

export function TimerWidget({
  client,
  ollamaVisionModel,
}: {
  client: TimerClient | null;
  ollamaVisionModel: string | null;
}) {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [projects, setProjects] = useState<ActiveProject[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [frames, setFrames] = useState<FrameNote[]>([]);
  const [captureStatus, setCaptureStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);

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

  // Periodic screen capture, only while a timer we started this session is
  // running and a local Ollama vision model is configured. Each frame's
  // description is appended and the image itself is dropped immediately
  // after — if Ollama isn't running, this just fails per-frame below.
  useEffect(() => {
    if (!timer || !ollamaVisionModel) return;
    let cancelled = false;

    async function captureOnce() {
      setCaptureStatus("capturing");
      try {
        const imageBase64 = await captureScreen();
        const text = await describeFrame(ollamaVisionModel!, imageBase64);
        if (!cancelled && text) {
          setFrames((prev) => [...prev, { at: new Date().toLocaleTimeString(), text }]);
          setCaptureStatus("idle");
        }
      } catch {
        // A single missed frame isn't worth surfacing loudly — the session
        // note just has one less data point. Repeated failures still show
        // as the "error" capture status so it's not silently broken.
        if (!cancelled) setCaptureStatus("error");
      }
    }

    const id = setInterval(() => void captureOnce(), CAPTURE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [timer, ollamaVisionModel]);

  if (!client) return null;

  async function handleStart() {
    if (!selectedProject || !client) return;
    setBusy(true);
    setError(null);
    setFrames([]);
    try {
      await client.startTimer(selectedProject);
      setTimer(await client.getRunningTimer());
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStopClick() {
    if (!client) return;
    if (frames.length === 0 || !ollamaVisionModel) {
      // Nothing to summarize — stop immediately, same as before this feature.
      setBusy(true);
      try {
        await client.stopTimer();
        setTimer(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    setSynthesizing(true);
    try {
      const draft = await synthesizeSessionNote(ollamaVisionModel, frames);
      setReviewNote(draft);
    } catch (err) {
      // Summarization failing shouldn't block ending the session — fall
      // back to an empty draft the user can fill in by hand.
      setError(`Session summary failed: ${String(err)}`);
      setReviewNote("");
    } finally {
      setSynthesizing(false);
    }
  }

  async function handleConfirmStop() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await client.stopTimer(reviewNote ?? "");
      setTimer(null);
      setReviewNote(null);
      setFrames([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (reviewNote !== null) {
    return (
      <div style={panelStyle}>
        <p style={{ margin: 0, fontWeight: 600 }}>Session note</p>
        <p style={{ margin: 0, color: "#666", fontSize: 11 }}>
          Drafted from {frames.length} screen snapshot{frames.length === 1 ? "" : "s"} taken while timing — review
          before saving.
        </p>
        <textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          rows={4}
          style={{ fontSize: 12, width: 220, fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => void handleConfirmStop()} disabled={busy} style={{ fontSize: 11 }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {error ? <span style={{ color: "crimson", fontSize: 11 }}>{error}</span> : null}
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {timer ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 16 }}>
              {formatElapsed(timer.startedAt, now)}
            </span>
            <button onClick={() => void handleStopClick()} disabled={busy || synthesizing} style={{ fontSize: 11 }}>
              {synthesizing ? "Summarizing…" : busy ? "…" : "Stop"}
            </button>
          </div>
          <span style={{ color: "#666", textAlign: "right" }}>
            {timer.clientName ? `${timer.clientName} — ` : ""}
            {timer.projectName}
          </span>
          {ollamaVisionModel ? (
            <span style={{ fontSize: 10, color: captureStatus === "error" ? "crimson" : "#999" }}>
              {captureStatus === "error"
                ? "Last capture failed"
                : `📸 ${frames.length} snapshot${frames.length === 1 ? "" : "s"}`}
            </span>
          ) : null}
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

const panelStyle: React.CSSProperties = {
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
};
