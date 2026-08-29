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
 * erroring. Same single-operator-only caveat as VITE_NEON_DSN: this key is
 * bundled into the built app, which is fine only because Joe builds and
 * runs it himself.
 */
export function readAnthropicApiKey(): string | null {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || null;
}
