import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Next 16 renamed the Middleware convention to Proxy; the exported function is
 * `proxy`. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
 *
 * One job now, not two: bounce anonymous requests away from the app. There
 * is no session-refresh step to do here any more — the JWT session cookie
 * is a flat 30-day token (see lib/auth/session.ts), not a rotating one, so
 * unlike the Supabase-era version of this file there's no cookie write to
 * perform on every request. This is an optimistic check for routing only —
 * every query is still enforced by Postgres RLS, which is the actual
 * boundary; a forged or expired token here just means an extra redirect,
 * not a data leak, since app_user_id() would resolve to nothing useful
 * from a token that fails verification. `jose`'s jwtVerify runs on Web
 * Crypto, not Node's crypto module, which is what makes it usable in the
 * Edge runtime proxy.ts executes under.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");

  if (!userId && !isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    // Remember where they were headed so login can return them there.
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (userId && isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return NextResponse.next();
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
