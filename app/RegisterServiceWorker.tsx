"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js on mount. A no-op component (renders nothing) so
 * it can sit in the root layout without affecting layout or hydration.
 * Registration failures are swallowed deliberately — an unsupported browser
 * (or, during local dev over http://, none at all: Service Worker requires
 * a secure context) should degrade to "not installable," never break the app.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline-read support just doesn't activate this session.
    });
  }, []);

  return null;
}
