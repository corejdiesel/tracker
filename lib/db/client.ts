import { neon, type NeonQueryInTransaction } from "@neondatabase/serverless";

function dsn(): string {
  const value = process.env.NEON_DSN;
  if (!value) {
    throw new Error(
      "Missing NEON_DSN. Copy .env.example to .env.local and fill it in — see README."
    );
  }
  return value;
}

/**
 * The one thing every RLS policy in every migration checks: app_user_id()
 * reads this back via current_setting('app.user_id', true). Postgres's SET
 * statement doesn't accept a bind parameter ($1) — confirmed empirically,
 * "syntax error at or near $1" — so this goes through set_config(), which
 * is an ordinary function call and takes one normally. The third argument
 * (`true`) makes it SET LOCAL-scoped: it applies only for the transaction
 * it's set within and is gone the instant that transaction ends, so it can
 * never leak onto a connection some other request reuses.
 */
const SET_USER_CONTEXT = "select set_config('app.user_id', $1, true)";

/**
 * All database access for one authenticated user. `userId` is the ONLY
 * thing that makes a query see that user's rows — it comes from a verified
 * session (see lib/auth/session.ts), never from a client-supplied value,
 * so there's no path from "request says I'm user X" to "database believes
 * it" that skips session verification.
 *
 * query() and transaction() both run through sql.transaction() — a single,
 * non-interactive Postgres transaction over one HTTP round trip (confirmed
 * against @neondatabase/serverless's own type declarations before relying
 * on it) — with the user-context SET LOCAL as the first statement, so RLS
 * is in effect for everything after it in the same call.
 */
export function withUser(userId: string) {
  const sql = neon(dsn());

  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const results = await sql.transaction((txn) => [
        txn.query(SET_USER_CONTEXT, [userId]),
        txn.query(text, params),
      ]);
      return results[1] as T[];
    },

    /**
     * Several statements as one atomic unit under the same user context —
     * for the handful of actions that need more than one write to succeed
     * or fail together (e.g. resolving a mail thread also writes a
     * match_rules row). `build` receives a bound query function and returns
     * an array of queries; results come back in the same order, alignable
     * by index.
     */
    async transaction(
      build: (q: (text: string, params?: unknown[]) => NeonQueryInTransaction) => NeonQueryInTransaction[]
    ): Promise<unknown[]> {
      const results = await sql.transaction((txn) => [
        txn.query(SET_USER_CONTEXT, [userId]),
        ...build((text, params = []) => txn.query(text, params)),
      ]);
      return results.slice(1);
    },
  };
}

/** For the one legitimate no-session case: looking a user up by email
 * during sign-in, before any userId exists to scope a session to. Talks
 * directly to the `users` table, which deliberately carries no RLS — see
 * the comment in db/migrations/0000_users.sql for why that's safe here. */
export function withoutUser() {
  const sql = neon(dsn());
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      return (await sql.query(text, params)) as T[];
    },
  };
}
