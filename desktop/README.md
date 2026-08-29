# Freelance OS — desktop shell

Local-first Tauri v2 app. See `../docs/desktop-architecture.md` for the full
design (why this can't just be the Next.js web app in a window, the sync
protocol, and — importantly — a table of exactly what has and hasn't been
verified, since this was built without access to a Mac).

**Current scope:** the plumbing, not the UI — with two real exceptions now.
`src/App.tsx` proves the Tauri window can read the local SQLite database
through the Rust bridge and, when `.env.local` is configured (see
`.env.example`), that it syncs against Neon on an interval and on
reconnect. The sync engine (`../lib/sync/`) is fully built and tested, with
both ends wired: a `RemoteStore` over Neon (`src/bridge/remote-store.ts`)
and a `LocalStore` over the Tauri bridge (`src/bridge/local-store.ts`).

On top of that, this is now where the app's actual focus is shifting:

- **A top-right billing timer** (`src/components/TimerWidget.tsx`) —
  start/stop against the real `running_timers` table (`src/bridge/timer.ts`,
  talks straight to Neon — that table is deliberately not part of the synced
  set, see that file's comment), with a live ticking display.
- **Periodic screen capture + AI session summary**
  (`src-tauri/src/capture.rs`, `src/ai/session-summary.ts`) — while the
  timer runs and `VITE_ANTHROPIC_API_KEY` is set, a screenshot every 5
  minutes gets described by Claude and immediately discarded (only the
  sentence is kept), and at Stop those sentences become a draft work-log
  note you review before saving. **The macOS side of this — the Screen
  Recording permission prompt, whether capture actually works from a dev
  build — is completely unverified from here; see the TODO below.**

See the TODO at the bottom for what's still not done.

## Running it

Needs the Rust toolchain and, on Linux, the GTK/WebKitGTK dev packages
(`libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
librsvg2-dev libsoup-3.0-dev`), plus — since screen capture (`xcap`) was
added — `libpipewire-0.3-dev libgbm-dev` for its Linux backend. On macOS
you need Xcode's command line tools instead; nothing else, and the
Screen Recording permission macOS itself prompts for on first capture.

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

- ~~A `RemoteStore` adapter~~ — done: `src/bridge/remote-store.ts`, over
  `@neondatabase/serverless` (not Supabase — see `../docs/desktop-architecture.md`).
- ~~A `LocalStore` adapter over the Tauri bridge~~ — done: `src/bridge/local-store.ts`.
- ~~A scheduler~~ — done: `src/sync/scheduler.ts`, wired into `App.tsx`. Runs
  on startup, on an interval, and on the browser `online` event; failures
  surface in the placeholder UI rather than being swallowed.
- ~~The outbox itself needs writing to~~ — `writeLocalMutation()` in
  `src/bridge/local-store.ts` upserts a row and queues its outbox entry in
  one SQLite transaction. Nothing calls it yet, though — no mutation screen
  exists to call it from (see the next point).
- **The other ten screens.** This pass proves the plumbing end-to-end for
  reads and for sync; every create/edit/delete screen still needs building,
  and each one is what will actually call `writeLocalMutation()`.
- **A real login screen.** Sync credentials come from `.env.local`
  (`VITE_NEON_DSN`, `VITE_USER_ID` — see `.env.example`) for now, not
  Keychain — there's no UI yet to populate Keychain from. `src/bridge/keychain.ts`
  is ready for when one exists.
- **Screen capture on macOS, for real.** `capture_screen` (Rust, via the
  `xcap` crate) builds and links on Linux with `libpipewire`/`libgbm`
  installed — that's the only thing this container can prove. Everything
  that actually matters is unverified: whether macOS's Screen Recording
  permission prompt appears and works from an unsigned `pnpm tauri dev`
  build, whether a capture succeeds or silently returns nothing before
  permission is granted, and whether the app needs relaunching after
  granting it (a known macOS quirk for this class of permission, not
  something this code controls).
- **The Anthropic API call itself, past a bare connectivity check.** Got a
  clean 401 from `api.anthropic.com` with a deliberately invalid key,
  confirming the request reaches the endpoint and the body shape is
  well-formed — but no valid API key was available here to see a real
  response, so response quality (is the frame description actually useful?
  is the synthesized note actually good?) is unverified.
- **Everything in the Keychain/window/signing rows of the architecture
  doc's verification table** — needs Joe's Mac, not more code from here.
