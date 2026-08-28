/**
 * The app's own routes, as a value. `typedRoutes` checks `<Link href>` and
 * `redirect()` against the real route tree at build time, so a redirect target
 * that comes from a query string has to be narrowed back to a known route
 * before it can be used.
 *
 * That narrowing is also the open-redirect defence: an unrecognised `?next=`
 * falls back to the dashboard rather than being followed.
 */
export const APP_ROUTES = [
  "/",
  "/timetable",
  "/time",
  "/clients",
  "/contacts",
  "/projects",
  "/invoices",
  "/costs",
  "/expenses",
  "/tasks",
  "/tax",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export function isAppRoute(value: string | undefined | null): value is AppRoute {
  return typeof value === "string" && (APP_ROUTES as readonly string[]).includes(value);
}

/** A safe post-login destination: the requested route, or the dashboard. */
export function safeNext(value: string | undefined | null): AppRoute {
  return isAppRoute(value) ? value : "/";
}
