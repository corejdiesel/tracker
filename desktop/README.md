# Freelance OS — desktop shell

Local-first Tauri v2 app. See `../docs/desktop-architecture.md` for the full
design (why this can't just be the Next.js web app in a window, the sync
protocol, and — importantly — a table of exactly what has and hasn't been
verified, since this was built without access to a Mac).

**Current scope:** the plumbing, not the UI. One placeholder screen
(`src/App.tsx`) proves the Tauri window can read the local SQLite database
through the Rust bridge. The sync engine (`../lib/sync/`) is fully built and
tested but not yet wired to a running Supabase adapter or a scheduler — see
the TODO at the bottom.

## Running it

Needs the Rust toolchain and, on Linux, the GTK/WebKitGTK dev packages
(`libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
librsvg2-dev libsoup-3.0-dev`) — already the case if you're reading this
inside the container this was built in. On macOS you need Xcode's command
line tools instead; nothing else.

```bash
pnpm install
pnpm tauri dev     # opens a window, hot-reloads the frontend
```

`pnpm tauri build` produces a distributable — but **do not expect a signed,
notarized macOS `.app` from a build run outside macOS**. This project has
only ever been built and tested for a Linux target; a macOS build needs to
happen on an actual Mac (or macOS CI) and needs Apple developer signing
credentials this environment has no access to.

## Verifying without a GUI

What you can check without a display, which is everything CI can do:

```bash
cargo check && cargo clippy && cargo test   # in src-tauri/
pnpm exec tsc --noEmit && pnpm exec vite build
node ../scripts/verify-local-schema.mjs     # the local SQLite schema, for real
pnpm -C .. test                             # the sync engine, lib/sync/
```

## What's next (not done in this pass)

- **A `RemoteStore` adapter over `@supabase/supabase-js`**, satisfying the
  interface in `../lib/sync/types.ts`.
- **A `LocalStore` adapter over the Tauri bridge** (`src/bridge/local-db.ts`),
  satisfying the same interface on the other side.
- **A scheduler** — call `syncOnce()` from `../lib/sync/engine.ts` on an
  interval and on reconnect, surfacing failures rather than swallowing them.
- **The outbox itself needs writing to** — every local mutation (creating an
  invoice, logging time, …) has to insert an `outbox` row alongside its
  actual table write, in the same SQLite transaction. Nothing does that yet.
- **The other ten screens.** This pass proves one vertical slice end-to-end;
  repeating it for clients/projects/invoices/expenses/etc. is mechanical
  once the adapters above exist, but it's real work, not automatic.
- **Everything in the Keychain/window/signing rows of the architecture
  doc's verification table** — needs Joe's Mac, not more code from here.
