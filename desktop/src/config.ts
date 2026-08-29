/**
 * Sync configuration, from Vite env vars (`.env.local`, gitignored — see
 * `.env.example`). Not Keychain: there's no login screen yet to populate it
 * (see docs/desktop-architecture.md §2's "not full UI parity" scope), so for
 * now this is set once at build/dev time, same as the web app's NEON_DSN.
 * A real login flow would replace this with Keychain-backed session storage
 * — the bridge for that (`bridge/keychain.ts`) already exists and is ready
 * to be wired to it.
 */
export interface SyncConfig {
  dsn: string;
  userId: string;
}

export function readSyncConfig(): SyncConfig | null {
  const dsn = import.meta.env.VITE_NEON_DSN;
  const userId = import.meta.env.VITE_USER_ID;
  if (!dsn || !userId) return null;
  return { dsn, userId };
}

/**
 * Optional — periodic-screenshot session summarization (see
 * ../ai/session-summary.ts) is simply off if this isn't set, rather than
 * erroring. Deliberately a local Ollama model name, not a cloud API key:
 * screenshots never leave the machine. Value is an Ollama model tag you've
 * already pulled (`ollama pull moondream`), e.g. "moondream" or
 * "qwen2-vl:2b" — see .env.example for the RAM tradeoff between them.
 */
export function readOllamaVisionModel(): string | null {
  return import.meta.env.VITE_OLLAMA_VISION_MODEL || null;
}
