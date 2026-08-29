import { invoke } from "@tauri-apps/api/core";

/**
 * Not wired to anything yet — there's no login screen to populate it (see
 * config.ts, which reads sync credentials from a Vite env var instead, for
 * now). Kept here as the account name a future real login flow would use to
 * store a session in the OS Keychain. See docs/desktop-architecture.md §3
 * for what's unverified about Keychain itself on this (Linux) container.
 */
export const SESSION_ACCOUNT = "session";

export const keychainSet = (account: string, secret: string): Promise<void> =>
  invoke("keychain_set", { account, secret });

export const keychainGet = (account: string): Promise<string | null> =>
  invoke("keychain_get", { account });

export const keychainDelete = (account: string): Promise<void> =>
  invoke("keychain_delete", { account });
