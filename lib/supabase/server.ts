import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Server-side Supabase client. `cookies()` is async in this version of Next,
 * so this must be awaited.
 *
 * The `setAll` catch is deliberate: cookies cannot be written from a Server
 * Component render. Session refresh happens in `proxy.ts`, which can write,
 * so swallowing the error here is safe rather than silently losing a session.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy.ts refreshes the session.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null. Uses `getUser()` rather than `getSession()`
 * because only `getUser()` revalidates the token against Supabase — a session
 * read from a cookie is attacker-controllable and must never gate access.
 */
export async function getUser() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
