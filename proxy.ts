import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Next 16 renamed the Middleware convention to Proxy; the exported function is
 * `proxy`. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
 *
 * Two jobs: refresh the Supabase session cookie (a Server Component cannot
 * write cookies, so it has to happen here), and bounce anonymous requests away
 * from the app. This is an optimistic check for routing only — every query is
 * still enforced by RLS in Postgres, which is the actual boundary.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Same accessors as the rest of the app, so a missing env var produces one
  // actionable error rather than an opaque failure inside the Supabase client.
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");

  if (!user && !isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    // Remember where they were headed so login can return them there.
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation, and the PWA
    // files (manifest.webmanifest, sw.js) — a browser fetches those
    // unauthenticated to decide installability and to register the worker,
    // so redirecting them to /login breaks both: the manifest fetch gets an
    // HTML login page instead of JSON (installability just silently fails),
    // and registering a service worker from a redirected non-JS response is
    // rejected outright, not degraded. Caught by actually curling these
    // routes, not by inspection — see the commit this fix shipped in.
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
