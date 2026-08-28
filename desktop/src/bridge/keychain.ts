import { invoke } from "@tauri-apps/api/core";

/** The Supabase refresh token is the only secret stored here — see
 * docs/desktop-architecture.md §3 for what's unverified about this on this
 * (Linux, no Keychain) container. */
export const SESSION_ACCOUNT = "supabase-session";

export const keychainSet = (account: string, secret: string): Promise<void> =>
  invoke("keychain_set", { account, secret });

export const keychainGet = (account: string): Promise<string | null> =>
  invoke("keychain_get", { account });

export const keychainDelete = (account: string): Promise<void> =>
  invoke("keychain_delete", { account });
