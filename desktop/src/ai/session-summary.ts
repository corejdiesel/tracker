/**
 * Turns periodic screenshots into a work-log note, via Anthropic's API
 * called directly from the desktop app (see ../config.ts for
 * VITE_ANTHROPIC_API_KEY — same single-operator-only caveat as
 * VITE_NEON_DSN: fine because Joe builds and runs this himself, never for
 * a build distributed to anyone else).
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

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

async function callAnthropic(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as AnthropicMessageResponse;
  return (data.content.find((block) => block.type === "text")?.text ?? "").trim();
}

/** One short, factual sentence describing what's visibly being worked on. */
export async function describeFrame(apiKey: string, imageBase64Png: string): Promise<string> {
  return callAnthropic(apiKey, {
    model: MODEL,
    max_tokens: 60,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: imageBase64Png } },
          {
            type: "text",
            text: "One short factual sentence: what work is visibly being done in this screenshot? No preamble, don't guess at anything not visible on screen.",
          },
        ],
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
export async function synthesizeSessionNote(apiKey: string, frames: FrameNote[]): Promise<string> {
  if (frames.length === 0) return "";
  const list = frames.map((f) => `- ${f.at}: ${f.text}`).join("\n");
  return callAnthropic(apiKey, {
    model: MODEL,
    max_tokens: 150,
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
