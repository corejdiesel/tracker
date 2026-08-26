# Freelance OS

A single-operator freelance operations app: work, money and tax in one place.
See [`PLAN.md`](./PLAN.md) for the audit, integration findings and open questions
behind the build.

**Phase 1 — Foundation.** Manual CRUD over clients, projects, invoices and
recurring costs, with the timetable and money-in views working off that data.
Done when the business can be run off it by hand.

## Running it

```bash
pnpm install
cp .env.example .env.local        # fill in your Supabase URL and anon key
pnpm dev
```

Apply the schema to a Supabase project:

```bash
supabase db push                  # or run supabase/migrations/0001_initial_schema.sql
```

## Checks

```bash
pnpm test        # vitest — the money, date and forecast logic
pnpm typecheck   # tsc --noEmit, strict
pnpm lint        # eslint
pnpm build       # next build (Turbopack)
```

## Conventions

**Money is `bigint` pence.** Never a float, never `numeric`. This matches the
getsorted.tax engine so figures cross the boundary without conversion. Reads go
through `toPence()`; writes send a string so a large value never round-trips
through a lossy JS number. Nothing renders a bare number — `formatMoney()` or a
`<Money>` element, always, and a figure that could be read as net or gross says
which.

**Soft deletes only.** Every table has `deleted_at`; every read filters
`deleted_at is null`. Nothing is hard-deleted.

**Dates are ISO strings, compared as strings.** A stored date has no time or
zone, but `new Date()` reads local time — comparing the two puts an off-by-one
at the 6 April tax-year boundary for anyone outside UTC. `lib/dates.ts`
classifies by lexicographic comparison and constructs `Date` only in UTC.

**Automated records show their working.** Anything created by an extraction
carries `source`, `source_ref` and `confidence`, so the UI can always separate
what the machine decided from what was entered by hand.

**Never invent a tax number.** If a figure cannot be computed confidently, the
app says so and names what is missing. The safe-to-spend card on Today is the
worked example.

## Layout

```
app/(auth)/login      Sign in
app/(app)             Today, timetable, clients, projects, invoices, costs
components/ui         Design-system primitives — no default shadcn
lib/money.ts          bigint-pence handling and formatting
lib/dates.ts          UK tax year and timezone-safe date maths
lib/db                Row types, queries, server actions, forecast logic
supabase/migrations   Schema. 0001 verified against Postgres 16.
proxy.ts              Session refresh and route protection (Next 16 convention)
```

`AGENTS.md` points coding agents at the version-matched Next.js docs bundled in
`node_modules/next/dist/docs/` — read those rather than relying on training data.
