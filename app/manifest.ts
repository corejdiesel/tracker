import type { MetadataRoute } from "next";

/**
 * The web app manifest — Next 16's native `app/manifest.ts` convention,
 * auto-linked into every page's <head>, no service-worker library needed
 * for this part. This alone is what makes Chrome/Edge/Safari offer "Install
 * app"; the actual offline-read caching is `public/sw.js` + `RegisterServiceWorker`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Freelance OS",
    short_name: "Freelance OS",
    description: "Work, money and tax in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#1d9e75",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
