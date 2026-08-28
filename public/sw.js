/**
 * Minimal hand-rolled service worker — not next-pwa or Serwist. Both are
 * webpack plugins; Next 16 defaults to Turbopack for both `dev` and `build`,
 * and Next's own PWA guide says Serwist "currently requires webpack
 * configuration" (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md
 * §"Extending your PWA"). A webpack-only plugin silently does nothing under
 * Turbopack, so a hand-rolled worker — plain JS, no bundler involvement — is
 * the choice that's actually compatible with this app's build, not a
 * downgrade from the "real" option.
 *
 * Scope, deliberately: "installable, offline READ of cached data" per the
 * brief's PWA row — not offline writes. Writes still need the network (a
 * Server Action round-trip); that gap is what the Tauri desktop app's local
 * SQLite + sync engine (../desktop, ../lib/sync) exists to close instead of
 * solving twice.
 */

const CACHE_NAME = "freelance-os-v1";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable; never intercept a Server Action POST — that
  // would risk replaying a write, which is the one thing this file must
  // never do silently.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        // Only cache a successful, real response — never an opaque or
        // error one, which would poison the offline fallback with a
        // redirect-to-login page cached under the original URL.
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // No cached copy and no network — for a navigation, this is the
        // honest answer; the browser's own offline page takes over.
        throw new Error("offline and not cached");
      }
    })()
  );
});
