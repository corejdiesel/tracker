# Tracker — Build Plan

**Status:** draft for review · 26 Aug 2026
**Decisions taken:** standalone commercial product · forked from Get Sorted · closed source

> **Source note.** The Notion link supplied (`app.notion.com/markdown-preview?previewId=…`)
> is an ephemeral client-side preview, not a page — it returns an empty shell to both
> the Notion API and a plain fetch. This plan is therefore built from the Get Sorted
> codebase, an OSS survey, and the three scoping answers above. Paste the doc's contents
> and I'll reconcile this against it.

---

## 1. What Tracker is

A Monday-style work OS for UK small businesses where **the work and the money are the
same object**. You track a job on a board; the board knows what the job was quoted at,
what it has cost, what has been invoiced, what is still owed, and what tax it will
generate. Monday can't do the money. Xero can't do the work. Nobody credibly does both
for a 3–20 person UK trade or agency.

The moat is not the boards — boards are a solved, commoditised UI problem. The moat is
Get Sorted's tax engine sitting under them: ~10,000 lines of HMRC-correct, unit-tested
UK tax maths that a Monday competitor would need years and an accountant to reproduce.

**Build order follows the moat:** boards are the cheapest part and go in first only
because everything else hangs off them.

---

## 2. What the fork buys, and what it costs

Get Sorted today: 551 TS/TSX files, ~75k lines, 62 migrations, 36 tables, 69 test files.
Next 16.2.7 / React 19.2 / Supabase / Tailwind v4.

### Take as-is — the finance core

These are **pure functions over plain objects** with no Supabase coupling. They port by
copying the directory. This is the valuable half of the fork.

| Module | Files | DB-coupled | What it does |
|---|---|---|---|
| `lib/tax` | 5 | 1 | Income tax, Class 2/4 NI, PA taper, trading allowance, SA103 summary |
| `lib/expenses` | 2 | 0 | 669-line HMRC expense category taxonomy |
| `lib/reports` | 3 | 0 | P&L over arbitrary ranges, agrees with the tax engine by construction |
| `lib/cis` | 4 | 0 | CIS detection + statements (essential for trades) |
| `lib/deductions` | 3 | 0 | Deduction finder |
| `lib/mileage` | 2 | 0 | HMRC mileage rates |
| `lib/vat` | 8 | 1 | Nine-box VAT return, periods, aggregation |
| `lib/utils/money` | 1 | 0 | bigint-pence money handling |

`lib/tax/amounts.ts` is the piece to protect: mixed-use splits, CIS gross-up, capital
assets vs revenue expenses, disallowables — all funnelled through four functions that
every total in the app goes through. Keep that invariant in Tracker.

### Take with rework

- `lib/invoices`, `lib/quotes`, `contacts`/`bills` from `0127_money_suite` — the sales
  ledger. Needs re-pointing at workspaces and at board items.
- `components/ui` (13 primitives), auth flow, Stripe client, Resend email, PostHog.
- Design tokens — but Tracker needs its own palette. Get Sorted's teal/cream reads as a
  consumer tax app, not a team tool.

### Leave behind

- **`lib/hmrc` (24 files) and `lib/mtd` (10 files)** — MTD quarterly submission, fraud
  prevention headers, obligations, penalty points. This is Get Sorted's regulatory
  surface, and it is the single largest source of ongoing compliance burden in the
  codebase. Tracker needs *tax calculation*, not *tax filing*. See §7.
- Accountant marketplace, WhatsApp, receipt inbound channels, PWA/push, onboarding tour,
  demo mode, waitlist, marketing site.

Realistically the fork starts by **deleting ~60% of the app** and keeping the money spine.

---

## 3. The one hard problem: tenancy

Get Sorted is single-user by construction. Every RLS policy across 62 migrations is a
variant of:

```sql
create policy "…_own" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Tracker is a **team** product. Every row belongs to a workspace, and access is decided by
membership and role. This is not a find-and-replace; it is the load-bearing change, and
doing it late is what kills forks like this.

### Do it on day one, and squash the migrations

Tracker has no production data. Do **not** carry 62 migrations across. Write one
`0001_initial_schema.sql` that is Get Sorted's final schema, workspace-scoped from the
start. This is a one-time opportunity that closes the moment you have a paying customer.

```sql
create table workspaces (id uuid primary key, name text not null, …);
create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','member','guest')),
  primary key (workspace_id, user_id)
);
create index on workspace_members (user_id, workspace_id);
```

Every domain table gains `workspace_id uuid not null`, and policies become:

```sql
create policy "…_member" on public.jobs
  for all using (public.is_member(workspace_id))
       with check (public.is_member(workspace_id));
```

**Two traps to avoid:**

1. **RLS recursion.** A policy that inlines `exists (select 1 from workspace_members …)`
   evaluates against a table that itself has RLS. Use a `security definer` helper with a
   pinned `search_path`, marked `stable`, so Postgres caches it per statement:

   ```sql
   create function public.is_member(ws uuid) returns boolean
     language sql stable security definer set search_path = public as $$
       select exists (select 1 from workspace_members
                      where workspace_id = ws and user_id = auth.uid());
     $$;
   ```

2. **Guest scoping.** Client-facing guests must see one board, not the workspace. Model
   that as a separate `board_members` grant checked *in addition to* workspace
   membership — retrofitting it later means revisiting every policy again.

### Also new: realtime

Get Sorted has **zero** Supabase Realtime usage (`grep` for `.channel(` returns nothing).
A Monday-like product needs live cell updates and presence. This is genuinely new
surface, not ported — budget for it and decide early between Supabase Realtime (cheap,
fits the stack) and a dedicated presence layer.

---

## 4. What to borrow from open source

### Full-app forks are out

The obvious candidates are all licensed in ways that are incompatible with a closed
commercial product:

| Project | Stars | Licence | Verdict |
|---|---|---|---|
| makeplane/plane | 58.3k | **AGPL-3.0** | Out — Jira/Linear/Monday alternative, but AGPL |
| twentyhq/twenty | 55.6k | AGPL-3.0 | Out |
| nocodb/nocodb | 64.7k | Other (open-core) | Out |
| baserow/baserow | 5.7k | Other (open-core) | Out |
| mattermost-community/focalboard | 26.4k | Other (source-available) | Out — verify before even reading |

AGPL's network clause bites precisely because Tracker is a hosted SaaS. **Read Plane's
board UX for ideas; don't read its source.**

### The one exception worth a look

**[usekaneo/kaneo](https://github.com/usekaneo/kaneo)** — 8.5k stars, **MIT**, TypeScript,
React + Hono. The only substantial board app in the survey that is genuinely MIT and so
legally minable for a closed product. Different backend (Hono, not Next/Supabase) so it
won't drop in, but its board/task/project data model and DnD board are worth studying.

### Compose the board from MIT components

This is the real answer. A Monday-grade UI is four well-chosen libraries, not a fork:

| Need | Library | Licence |
|---|---|---|
| Kanban + row reordering | **@dnd-kit** (17.6k) | MIT |
| ↳ alternative | atlassian/pragmatic-drag-and-drop (12.7k) | Apache-2.0 per LICENSE — GitHub reports "Other"; verify |
| Table view: sort/filter/group/pin | **@tanstack/react-table** (28.4k) | MIT |
| Spreadsheet-grade cell editing at scale | **glide-data-grid** (5.3k) | MIT |
| Row virtualisation | @tanstack/virtual | MIT |
| Dashboard widget layout | react-grid-layout (22.4k) | MIT |
| Rich text in item detail / docs | tiptap (38.2k) | MIT |

Already in `package.json` and reusable: `motion`, `zustand`, `sonner`, `react-hook-form`,
`zod`, `@react-pdf/renderer`, `@number-flow/react`.

Gantt/timeline is the one gap with no strong MIT option — build it on dnd-kit over a
date-scaled flex track rather than taking a commercial dependency.

---

## 5. Board data model — the key design call

The instinct is full Airtable-style EAV: `boards → columns → items → cell_values(jsonb)`,
everything user-defined. **Don't do that, or don't do only that.**

If money lives in a jsonb cell, the tax engine can't index it, `SUM(amount_pence)` becomes
a table scan, and `lib/tax/amounts.ts` — which expects typed `bigint` pence — has to be
rewritten. You'd be trading away the moat for column flexibility.

**Hybrid model:**

```
boards          (workspace_id, name, kind)
board_groups    (board_id, name, position)        -- Monday's coloured groups
board_columns   (board_id, key, type, config)     -- user-defined columns
items           (board_id, group_id, position,
                 title, status, owner_id, due_date,
                 value_pence bigint,              -- ← typed, indexed, tax-legible
                 cost_pence  bigint,
                 custom jsonb)                    -- ← everything user-defined
item_links      (item_id, entity_type, entity_id) -- → quotes, invoices, bills, txns
```

Fixed typed columns for anything the finance side reads. `custom jsonb` for the
Monday-style configurability. `item_links` is the join that makes a job know its money.

Money stays **bigint pence** everywhere, per Get Sorted's rule. Soft deletes everywhere
(`deleted_at`), per Get Sorted's rule.

---

## 6. Phases

**P0 — Fork and gut (week 1).** Clone Get Sorted. Delete marketing, accountants, MTD,
WhatsApp, PWA, receipts-inbound, tour, demo. Squash to one workspace-scoped migration.
Keep auth, Stripe, email, `components/ui`, and the whole finance core. Ships: an empty
app that logs in, bills, and has a green test suite.

**P1 — Board core (weeks 2–4).** Schema above. Table view first (TanStack Table), then
kanban (dnd-kit). Workspace/member/invite flows. Realtime cell updates. Ships: a usable
Monday clone with nothing financial in it.

**P2 — Money spine (weeks 5–7).** Port contacts, quotes, invoices, bills. `item_links`.
Per-job P&L via `lib/reports/pnl.ts` scoped to an item. Ships: **job profitability** —
the first thing Monday cannot do.

**P3 — Tax layer (weeks 8–10).** Wire `lib/tax` + `lib/cis` + `lib/expenses` to workspace
totals. Live tax estimate, CIS handling, VAT nine-box. Ships: **the differentiator.**

**P4 — Monday parity (weeks 11+).** Timeline/Gantt, automations, dashboard widgets
(react-grid-layout), notifications, guest access, saved views.

**P5 — MTD, conditionally.** Only if the ICP turns out to include sole traders. See below.

Phases 2 and 3 are where the product becomes defensible. Resist spending week 11 on a
nicer kanban.

---

## 7. Open questions

1. **Paste the Notion doc.** Everything above is inference from three multiple-choice
   answers. If the doc names a specific ICP, feature set, or timeline, it overrides this.

2. **Who is the customer — and does that drag MTD back in?** A 3–20 person limited
   company needs corporation tax, payroll and Companies House — *not* what `lib/tax`
   computes. `lib/tax` computes **sole trader income tax and Class 4 NI**. If Tracker's
   ICP is limited companies, the tax engine is a much weaker fit than it looks and this
   plan's central premise needs re-testing before P3. If the ICP is sole traders and
   small partnerships, the fit is excellent and MTD (P5) becomes a real requirement
   rather than dead weight.

3. **Does Tracker cannibalise Get Sorted?** If a sole trader can get boards *and* tax in
   Tracker, why buy Get Sorted? Worth deciding deliberately: two products, or one
   product with a cheaper tier.

4. **Tax rates go stale every April.** Forking means two copies of `PERSONAL_ALLOWANCE`
   drifting apart. Mitigation: keep `lib/tax`, `lib/cis`, `lib/expenses` byte-identical
   across both repos with a CI check that fails on divergence, so a rate change is one
   patch applied twice rather than a silent bug in whichever product you touched last.

5. **Get Sorted's own pre-launch debt.** `BACKLOG.md` lists unrun items — the
   `0127_money_suite` migration has never been applied to a real database, and its RLS
   isolation is unverified. Tracker would be forking the money suite in that state.
   Verify it against real Postgres before P2 depends on it.
