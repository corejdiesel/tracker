/**
 * The SET LOCAL app.user_id pattern, shared by every desktop module that
 * talks to Neon directly (remote-store.ts for the sync engine, timer.ts for
 * the live running timer). Factored out so the two don't duplicate the
 * one thing that actually matters for correctness here: `SET LOCAL` only
 * applies for the transaction it's set within, so the user context can
 * never leak onto a connection some other request reuses. See
 * remote-store.ts's own comment for why this isn't just lib/db/client.ts
 * reused verbatim (that one reads `process.env.NEON_DSN`, which doesn't
 * exist in a Tauri webview).
 */
import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";

const SET_USER_CONTEXT = "select set_config('app.user_id', $1, true)";

export interface NeonConnection {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction(
    build: (q: (text: string, params?: unknown[]) => NeonQueryInTransaction) => NeonQueryInTransaction[]
  ): Promise<unknown[]>;
}

export function connectAsUser(dsn: string, userId: string): NeonConnection {
  const sql = neon(dsn);

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const results = await sql.transaction((txn) => [
        txn.query(SET_USER_CONTEXT, [userId]),
        txn.query(text, params),
      ]);
      return results[1] as T[];
    },

    async transaction(build) {
      const results = await sql.transaction((txn) => [
        txn.query(SET_USER_CONTEXT, [userId]),
        ...build((text, params = []) => txn.query(text, params)),
      ]);
      return results.slice(1);
    },
  };
}
