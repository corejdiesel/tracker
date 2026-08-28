import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See src-tauri/tauri.conf.json — devUrl and frontendDist must agree with
// this file's server.port and build.outDir.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist" },
});
