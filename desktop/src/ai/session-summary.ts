/**
 * Turns periodic screenshots into a work-log note, via a local Ollama
 * server (http://localhost:11434) — not a cloud API. See ../config.ts for
 * VITE_OLLAMA_VISION_MODEL: unset means capture is simply off.
 *
 * Deliberately local-only, no cloud fallback: the whole point of this
 * feature is that screenshots (which may show client work, invoices, or
 * HMRC/MTD screens) never leave the machine. If Ollama isn't running, a
 * capture just fails — same "error" capture status TimerWidget already
 * shows for any failed frame — rather than silently falling back to a
 * cloud call.
 *
 * Deliberately two small calls, not one: describeFrame() runs once per
 * captured frame (vision, cheap, terse) and never touches disk — the
 * caller passes it the base64 PNG straight from capture_screen and only
 * keeps the returned sentence, matching the intent that screenshots
 * themselves are not meant to be kept or reviewed, only what an AI
 * reads off them. synthesizeSessionNote() runs once, at Stop, turning the
 * accumulated per-frame sentences into one work-log note — text-only, no
 * image data by that point.
 */

const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";

interface OllamaChatResponse {
  message?: { role: string; content: string };
}

async function callOllama(model: string, body: Record<string, unknown>): Promise<string> {
  let res: Response;
  try {
    res = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, ...body }),
    });
  } catch (err) {
    throw new Error(`Ollama not reachable at ${OLLAMA_CHAT_URL} — is \`ollama serve\` running? (${String(err)})`);
  }
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as OllamaChatResponse;
  return (data.message?.content ?? "").trim();
}

/** One short, factual sentence describing what's visibly being worked on. */
export async function describeFrame(model: string, imageBase64Png: string): Promise<string> {
  return callOllama(model, {
    messages: [
      {
        role: "user",
        content:
          "One short factual sentence: what work is visibly being done in this screenshot? No preamble, don't guess at anything not visible on screen.",
        images: [imageBase64Png],
      },
    ],
  });
}

export interface FrameNote {
  /** HH:MM, local to when the frame was captured — for ordering context
   * in the prompt, not stored anywhere. */
  at: string;
  text: string;
}

/**
 * Combines timestamped per-frame descriptions into one work-log note, in
 * the freelancer's own voice — a draft, always shown to the user for
 * review/edit before it's saved as the actual time_entries.note, same as
 * every other "estimate, not an asserted fact" in this app.
 */
export async function synthesizeSessionNote(model: string, frames: FrameNote[]): Promise<string> {
  if (frames.length === 0) return "";
  const list = frames.map((f) => `- ${f.at}: ${f.text}`).join("\n");
  return callOllama(model, {
    messages: [
      {
        role: "user",
        content:
          `Timestamped snapshots of what was on screen during one work session, oldest first:\n\n${list}\n\n` +
          "Write one or two plain sentences describing what was worked on, as a freelancer's own time-log note. " +
          'No preamble, no bullet points, and don’t mention "screenshots" or "snapshots" — just describe the work.',
      },
    ],
  });
}
