# Phase 3 — Desktop: local-first architecture

**26–28 Aug 2026.** Design decisions before code, per the same discipline the
Phase 1 schema and the tax module got. Answers the architectural gap flagged
in `PLAN.md` §4.3: Tauri-as-thin-shell gives Keychain and notifications but
not offline; genuine local-first is a real subsystem. This is that subsystem.

## 1. Why this can't just be the existing Next.js app in a Tauri window

The web app (`app/`) is built on React Server Components and Server Actions —
`app/(app)/page.tsx` is `async` and calls `lib/db/queries.ts`, which needs a
live server process and a network round-trip to Neon for every render. A
Tauri window pointing at that app with no network shows nothing: there is no
server to render it and no data to read.

Two ways to get real offline:

1. **Bundle a Node/Next server inside the Tauri app** (a "sidecar" binary)
   and keep talking to Postgres through it. Heavy, and it still needs
   Postgres reachable — bundling the server doesn't remove the network
   dependency, it just moves where the HTTP call originates from.
2. **A client-only frontend backed by local SQLite**, synced to Neon in the
   background when a network exists. The window renders from a database
   sitting on disk; network is an input to that database, not a rendering
   dependency.

(2) is what "local-first" means and is what's built here. It means the
desktop app is architecturally a different data layer from the web app, not
a repackaging of it — they can share pure logic (`lib/money.ts`,
`lib/dates.ts`, `lib/tax-company/*`) but not `lib/db/queries.ts` or
`lib/db/actions.ts`, which are server-coupled by design (session cookies,
`next/headers`).

## 2. Scope of this pass

Full UI parity across all eleven web-app screens in a new frontend framework
is not attempted here — that's real, separate effort once the plumbing is
proven. This phase builds and verifies the plumbing end-to-end for one
representative slice (time entries — the newest, most write-heavy table),
so the pattern is provably correct before it's repeated for every table:

- A Tauri v2 shell that boots (`desktop/`).
- A local SQLite schema (`desktop/src-tauri/migrations/0001_local.sql`) for
  the tables that matter most for "opens with no network and shows me
  everything useful": clients, projects, invoices, expenses, recurring
  costs, tasks, time entries. Meetings, work artefacts, match rules and tax
  obligations stay server-only for now — Granola sync (Phase 4) and
  screenshot storage don't have an offline case worth solving yet.
- A sync engine, as **pure TypeScript with no Tauri or Supabase import** —
  see §4 — unit-testable the same way `lib/db/costs.ts` is.
- Tauri commands bridging the local SQLite database to the frontend.
- Session storage via a Keychain-backed Tauri plugin.

## 3. What's actually verified here, and what needs Joe's Mac

This container is Linux with no macOS SDK, no Xcode, no Keychain. Honestly:

| Claim | Verified how | Confidence |
|---|---|---|
| The local SQLite schema is valid and behaves correctly (constraints, triggers) | Ran against `node:sqlite` — same discipline as the Postgres migrations | High |
| The sync engine's conflict resolution and outbox logic is correct | Pure-function unit tests, no I/O | High |
| The Rust compiles AND links | `cargo build` (not just `check`) on Linux, producing a real linked ELF binary — after `vite build` produced real frontend assets for it to embed | High for Linux; still Medium for macOS specifically — a Linux link succeeding says nothing about macOS-only dependencies (Keychain, Cocoa) linking cleanly there |
| Tauri commands are wired correctly | Rust unit tests + `cargo check`/`clippy`/`test`, all passing (5 Rust tests over `db.rs`); the generated `gen/schemas/acl-manifests.json` was inspected directly and confirms app-level commands (`db_query` etc.) carry no ACL entries of their own — `core:default` in `capabilities/default.json` is what actually reaches them, not a guessed permission string | High for compiling and the SQL bridge logic; still not a live invoke() round-trip |
| Keychain storage actually works | **Not verified** — no Keychain on Linux | **None — needs a Mac** |
| The app actually launches as a window, renders, and is usable | **Not verified** — Tauri's runtime needs a display and a macOS (or Linux desktop) target build | **None — needs a Mac or a GUI Linux box** |
| Code signing / notarization / a distributable `.app` | Out of scope entirely from here | **None — needs a Mac + an Apple developer account** |
| `capture_screen` (§6, `xcap` crate) compiles and links | `cargo build`/`test`/`clippy` on Linux, after installing `libpipewire-0.3-dev` + `libgbm-dev` (not previously required) for xcap's Linux backend | High for compiling; **none for actually capturing** — no display server here at all, and macOS uses a completely different backend (ScreenCaptureKit/CGDisplayCreateImage) that this never exercises |
| macOS Screen Recording permission flow | **Not verified** — this container has no macOS to prompt for it, and the prompt/relaunch behaviour is Apple's, not this code's | **None — needs a Mac** |
| The Anthropic API call (session-summary.ts) | Real HTTP request to `api.anthropic.com` with a deliberately invalid key — got a clean 401, confirming the endpoint is reachable and the request body is well-formed (a malformed request would 400, not 401). Mocked-fetch unit tests cover the request/response shape. | Medium — connectivity and shape confirmed; no valid API key was available here to see a real model response or judge its quality |

Anything in the bottom five rows goes back to the Notion action list as
"needs your Mac (or your own Anthropic key) to verify," not silently
claimed as done.

## 4. The sync engine

### 4.1 Data model

Every synced table gains, locally, what it already has server-side —
`updated_at`, `deleted_at` — plus two bookkeeping tables that exist ONLY
locally, never synced themselves:

```sql
-- One row per pending local write, replayed against Supabase when online.
-- op is the whole write, not a diff — simpler to reason about, and every
-- table here is small enough that whole-row upserts are cheap.
create table outbox (
  id          text primary key,      -- uuid, generated locally
  table_name  text not null,
  row_id      text not null,         -- the uuid of the row being changed
  op          text not null check (op in ('upsert','delete')),
  -- ALWAYS present, even for a delete — see §4.1's note below. An earlier
  -- draft of this table let payload be null for a delete; that shipped as a
  -- real bug (a delete had nothing to actually write deleted_at from) and
  -- was caught by a unit test, not by review. Fixed here and in the SQL.
  payload     text not null,         -- JSON of the row's full current state
  created_at  text not null,         -- ISO 8601 — when queued, for ordering
  attempts    integer not null default 0
);

-- One row per table, tracking how far a pull has progressed.
create table sync_cursor (
  table_name  text primary key,
  last_synced_at text not null       -- server updated_at watermark
);
```

### 4.1a A "delete" is a soft-delete upsert, not a distinct write

This app soft-deletes everywhere — Postgres and the local SQLite schema both
use `deleted_at`, never a real `DELETE`. So on the wire, a delete IS an
upsert: the outbox payload for one already has `deleted_at` set, and pushing
it is the exact same `writeRemoteRow` call as any other upsert. `op` is kept
on the outbox row only so a local store can show the user "you deleted this"
in its own UI; the sync engine itself does not branch on it.

### 4.2 Conflict resolution: last-write-wins on `updated_at`

Chosen over a CRDT or operational-transform approach deliberately — this is
a **single operator** on at most two devices (a laptop and a desktop, say),
never two people editing the same row concurrently. The failure mode LWW is
bad at (silently discarding a concurrent edit) essentially cannot happen
here; the failure mode it's good at (simple, auditable, no merge UI) is
worth having. Revisit if multi-device concurrent editing becomes real.

Rule: on both push and pull, the row with the later `updated_at` wins.
`deleted_at` is just another column under this rule — a delete is a write
like any other and last-write-wins applies to it the same way, so an edit
after a delete on another device correctly un-deletes the row, and a delete
after an edit correctly wins.

### 4.3 Push (local → server)

1. Read all `outbox` rows, oldest first.
2. For each: fetch the current server row (if any) by id.
3. If the server row is missing, or the outbox row's `updated_at` (inside
   its JSON payload) is later than the server row's — push it (upsert or
   delete). Otherwise, the server already has a later write; drop the
   outbox entry without pushing (the eventual pull will bring the newer
   server version down).
4. On success, delete the outbox row. On failure (network, auth), leave it
   and increment `attempts` — retried on the next sync tick, not immediately
   in a tight loop.

### 4.4 Pull (server → local)

1. For each synced table, read `sync_cursor.last_synced_at`.
2. Fetch server rows with `updated_at > cursor`, ordered by `updated_at`.
3. For each: if the local row is missing, or the server row's `updated_at`
   is later than the local row's — write it locally. Otherwise skip (local
   has an un-pushed newer edit sitting in the outbox; pushing that later
   will bring the server up to date without this pull overwriting it first).
4. Advance the cursor to the latest `updated_at` seen.

### 4.5 Why pure TypeScript, not Rust

The sync engine takes a `LocalStore` and `RemoteStore` interface — small,
injectable, mockable — rather than talking to `better-sqlite3` or Neon
directly. That is what makes §4.3/§4.4 testable with plain Vitest, the same
suite that already covers the tax and money logic, with no Tauri runtime,
no real SQLite file, and no network. The Tauri command layer (Rust) is a
thin adapter satisfying `LocalStore` (`desktop/src/bridge/local-store.ts`);
`@neondatabase/serverless` satisfies `RemoteStore`
(`desktop/src/bridge/remote-store.ts`). Correctness of the *policy*
(§4.2–4.4) is proven independently of correctness of the *plumbing*.

## 5. Both ends wired (29 Aug 2026)

`RemoteStore` and `LocalStore` are both implemented now (not the interfaces
above — the actual adapters), plus a scheduler
(`desktop/src/sync/scheduler.ts`, syncs on startup/interval/reconnect) and
`writeLocalMutation()` for the outbox-write half. `desktop/src/sync/columns.ts`
holds the one genuinely fiddly part: Postgres and the local SQLite schema
are kept column-identical by convention, except two columns Postgres
computes itself (`invoices.total_pence`, `expenses.gross_pence`, both
`generated always as (...) stored`) which must never be sent on a write
there, and a handful of columns that are `boolean` in Postgres but SQLite
INTEGER 0/1 locally, which need explicit coercion on the push direction
(the pull direction needs none — `db.rs`'s `json_to_sql` already normalises
a JSON boolean to SQLite's 0/1 on the way in).

**A second RLS finding, found while verifying this against the live
database**: `FORCE ROW LEVEL SECURITY` (§0001's fix) stops a table's *owner*
being exempt from RLS, but Neon's default project role (`neondb_owner`) also
carries the separate `BYPASSRLS` attribute, which skips row security
regardless of FORCE. Confirmed live: inserted a row as one user, read it
back as a different user through `neondb_owner`, and RLS did not filter it
— even though `app_user_id()` correctly resolved to the second user's id at
query time. `neondb_owner` cannot strip its own `BYPASSRLS` (Neon rejects
the `ALTER ROLE`), so the fix is a second role that never had it:
`db/migrations/0004_app_role.sql` creates `app_user` (`NOBYPASSRLS`, no
ownership, only the grants the app needs), and `NEON_DSN` — both the web
app's and the desktop app's `VITE_NEON_DSN` — now points at that role, not
the project owner. Re-verified the same way afterward: isolation held.
`scripts/create-user.mjs`, `scripts/migrate-neon.mjs`, and
`scripts/set-app-role-password.mjs` still need the owner credential (DDL,
role creation) — only the *running app's* connection changed.

## 6. The billing timer and periodic-screenshot session summary (29 Aug 2026)

The desktop app is now where the app's actual focus is shifting — the two
features below are native-capability-first, which is the reason a desktop
shell exists at all rather than just the PWA.

**Billing timer** (`src/components/TimerWidget.tsx`, `src/bridge/timer.ts`):
`running_timers` is deliberately not in `lib/sync/engine.ts`'s
`SYNCED_TABLES` (§4.1) — it's single-source-of-truth transient state, not
something with a sensible last-write-wins merge story. So the timer talks
straight to Neon, same connection pattern as `RemoteStore`
(`src/bridge/neon-connection.ts`, factored out of `remote-store.ts` so the
two share it), and mirrors `lib/db/actions.ts`'s `startTimer`/`stopTimer`
exactly — a timer started on desktop and stopped on web behaves
identically. The widget itself polls every 15s (to notice a start/stop
from elsewhere) and ticks its own display every second in between.

**Periodic screenshots → an AI-drafted session note**
(`src-tauri/src/capture.rs`, `src/ai/session-summary.ts`): while the timer
runs and `VITE_ANTHROPIC_API_KEY` is set, every 5 minutes a screenshot is
taken (`xcap` crate, base64-PNG over Tauri's IPC — never written to disk),
described by Claude Haiku in one short sentence, and the image is discarded
immediately — only the sentence is kept in memory. At Stop, the accumulated
sentences go through one more Claude call that writes a short work-log
note in the freelancer's own voice, shown for review/edit before it's
saved as the actual `time_entries.note` — never silently written, same
"estimate, not an asserted fact" rule as the rest of this app (the Tax
page's profit default, the VAT threshold check, all of it).

Both `VITE_NEON_DSN`-style secrets and `VITE_ANTHROPIC_API_KEY` are bundled
into the built app at compile time, which is the same single-operator-only
tradeoff already made for the Neon connection string: acceptable because
Joe builds and runs this himself, never something to ship to anyone else.

**Known limitation, not yet solved**: the `running_timers` row isn't
cleared until the review panel's Save is clicked, so the elapsed time
actually recorded reflects whenever `stopTimer()` runs, not the moment
Stop was first clicked — closing the app mid-review (or just taking a
while over it) leaves the timer running in Postgres. A real fix needs a
new column this schema doesn't have (an intended-stop timestamp, captured
at Stop and reconciled later); accepted as a tradeoff for now rather than
built speculatively.
