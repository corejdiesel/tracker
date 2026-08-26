# Freelance OS — response to the Claude Code brief

**26 Aug 2026 · answers §9 (1–4) · no code written**

> Supersedes the earlier draft in this repo, which was written before the brief
> was available and assumed a multi-tenant commercial product. That premise was
> wrong; this document replaces it.

---

## 1. Audit of getsorted.tax

Repo state: 551 TS/TSX files, ~75k lines, 62 migrations, 36 tables, 69 test files.
Next 16.2.7 / React 19.2 / Supabase / Tailwind v4.

### 1.1 Where the tax logic lives, and how cleanly it separates

Cleanly. This is the good news and it is better than I expected.

The calculation layer is **pure functions over plain objects**. It never sees a
`user_id`, never imports an auth helper, and has no multi-tenancy awareness at all —
callers fetch rows and hand it arrays. Supabase coupling by directory:

| Module | Files | Touch Supabase |
|---|---|---|
| `lib/cis` | 4 | **0** |
| `lib/deductions` | 3 | **0** |
| `lib/mileage` | 2 | **0** |
| `lib/expenses` | 2 | **0** |
| `lib/reports` | 3 | **0** |
| `lib/tax` | 5 | 1 |
| `lib/vat` | 8 | 1 |
| `lib/hmrc` | 24 | 5 |
| `lib/mtd` | 10 | 2 |

The seam is real, and it falls exactly where you'd want: **calculation is clean,
filing is coupled.** `lib/hmrc` and `lib/mtd` are the HMRC transport layer — OAuth
tokens, fraud headers, obligations, submission state — and they belong to Get Sorted,
not to a shared package.

The piece to protect is `lib/tax/amounts.ts`: four functions (`grossIncome`,
`claimableExpense`, `capitalAllowanceClaim`, `cisDeducted`) that every total in the
app funnels through, so a 50%-business phone bill, a CIS-deducted payment, a capital
asset and a disallowable are treated identically on every screen. That invariant is
the thing that makes the numbers agree with each other. Keep it.

Also worth preserving verbatim: `lib/utils/dates.ts` handles tax-year boundaries by
**lexicographic string comparison of `YYYY-MM-DD`**, never `Date` objects, specifically
to avoid an off-by-one at the 6 April boundary for anyone not on UTC. That is a
subtle bug someone already paid for. Don't reimplement it.

### 1.2 What it actually supports

**Supported:**
- Sole-trader Self Assessment: income tax, Class 4 NI, personal-allowance taper above
  £100k, trading allowance, student loan plans 1/2/4/5 + postgrad, Annual Investment
  Allowance, mixed-use splits, disallowables.
- Marginal stacking on PAYE employment income you *receive* (`tax(salary + profit) − tax(salary)`).
- UK property income, correctly excluded from Class 4.
- CIS detection and statements.
- VAT nine-box return — but feature-flagged **off** (`NEXT_PUBLIC_FEATURE_VAT_SUBMIT`) and sandbox-only.
- MTD ITSA quarterly cumulative updates and final declaration — in the *filing* layer.

**Not supported, at all:**
- **Corporation tax / CT600.** `grep` for `corporation|ct600` across the repo returns nothing.
- **Dividends.** Nothing. `lib/expenses/categories.ts:127` lists "Dividends (you're not
  a company)" under *not allowed*. The engine is built on the explicit assumption that
  the user is not a limited company.
- **Payroll / PAYE as an employer.** PAYE appears only as income you receive.

This is the finding that matters most, and §4.1 below is about it.

### 1.3 Tax years modelled: exactly one

`lib/tax/calculations.ts` hardcodes **2025-26** thresholds as module-level `const`s:

```ts
const PERSONAL_ALLOWANCE = BigInt(1257000);   // £12,570
const BASIC_RATE_BAND    = BigInt(3770000);   // £37,700
// 2025-26 thresholds (Plans 1/2/4 were uprated in April 2025)
plan2: { threshold: BigInt(2847000), rate: BigInt(9) },
```

**No calculation function takes a tax year.** `taxYear` appears only in
`sa103-summary.ts`, and there it selects a *date range*, not a *rate set*.

Two consequences:

1. The engine cannot compute a prior or future year at all. Your brief mandates
   "fixture cases per tax year". Today the engine has one year and no way to express a
   second. **This is the single blocker to extraction.**
2. There is a live correctness question in Get Sorted right now. `getCurrentTaxYear()`
   returns 2026-2027 today, but the constants are 2025-26. Income tax happens to survive
   this — the PA and basic-rate band are frozen — but **student loan Plan 1/2/4
   thresholds are uprated each April** and are therefore stale for 2026-27. Worth
   checking against current HMRC figures before it shows a user a wrong number.

### 1.4 HMRC credentials and registered APIs

Registered on the Developer Hub — `.env.example` carries `HMRC_CLIENT_ID`,
`HMRC_CLIENT_SECRET`, `HMRC_USE_SANDBOX`, a pinned static egress IP
(`HMRC_VENDOR_PUBLIC_IP` + Fixie proxy, required because fraud headers must match the
IP HMRC actually sees), and webhook secrets.

**Production credentials: not held.** `docs/hmrc-itsa-production-readiness.md` is
unambiguous — status is "ready to move into the evidence-and-sign-off phase **before
applying** for production credentials". Sandbox end-to-end was verified 2026-07-22 via
`/api/hmrc/sandbox-selftest`.

APIs implemented and wired: Business Details, Obligations, Self-Employment Business
(cumulative), UK Property Business (cumulative), Individual Calculations v8.0
(trigger → retrieve → final declaration). VAT (MTD) client exists, flagged off, and the
doc explicitly says it must not be represented as live.

⚠️ **Act on this one first — see §4.5.**

### 1.5 Data model

`transactions`: `amount_pence bigint` (signed — positive income, negative expense),
`transaction_date date`, `category`, `hmrc_category`, `is_business`,
`business_percent`, `is_capital_asset`, `disallowable`, `cis_deduction_pence`,
`deleted_at`. Money is bigint pence throughout, never floats. Soft deletes throughout.

`invoices`: `subtotal_pence`, `vat_pence`, `total_pence` as a **generated stored
column**, `issue_date`, `due_date`, `status`. This maps almost 1:1 onto the brief's
Invoice entity — direct reuse.

Categories: `lib/expenses/categories.ts`, 669 lines, ~15 categories each with
`hmrcBox`, allowed/not-allowed lists, tips, keywords for auto-categorisation. The
`hmrcBox` values are **SA103 box numbers** — the self-employment supplementary page.
Not CT600. More evidence for §4.1.

### 1.6 Test coverage on the calculation layer specifically

You asked about this layer specifically, so: **the core band arithmetic has no
dedicated test file.**

```
lib/tax/
  amounts.ts          ← 14 cases (amounts.test.ts)
  calculations.ts     ← no calculations.test.ts
  sa103-summary.ts    ← no test
  combined-tax.test.ts   7 cases
```

`calculateIncomeTax`, `calculateClass4NI`, `calculateStudentLoan` and the PA taper are
exercised only *indirectly*, through 7 combined-tax cases. Elsewhere coverage is
genuinely good — `lib/mtd` 104 cases, `lib/hmrc/cumulative` 22, `lib/vat` 36, `lib/cis`
21 — which makes the gap at the centre more conspicuous, not less.

Given "wrong answers here have financial consequences", this is the first thing to fix,
and it must be fixed **before** the code becomes a versioned package other things depend on.

---

## 2. Extraction strategy

**Your preference is right — `@getsorted/tax-engine` over a fork — and the code shape
cooperates.** The calculation layer is already dependency-free. But do it in this order,
and not in Phase 5.

**Step 1 — Parameterise the tax year (in Get Sorted, before extraction).**
Replace module constants with a rate table keyed by year:

```ts
export type TaxYear = `${number}-${number}`;
export interface TaxYearRates {
  personalAllowance: bigint; basicRateBand: bigint; additionalRateThreshold: bigint;
  class4: { lower: bigint; upper: bigint; mainRate: bigint; upperRate: bigint };
  studentLoan: Record<Exclude<StudentLoanPlan,"none">, { threshold: bigint; rate: bigint }>;
}
const RATES: Record<TaxYear, TaxYearRates> = { "2025-26": {…}, "2026-27": {…} };

export function calculateIncomeTax(profit: bigint, year: TaxYear): bigint
```

This breaks every call site in Get Sorted. That is exactly why it should happen once,
in one repo, *before* there are two consumers — doing it after extraction means doing
it twice and reconciling.

**Step 2 — Write `calculations.test.ts` with fixture cases per year.** Table-driven,
one fixture file per tax year, sourced from HMRC's published figures with the source
cited in a comment. This is the artefact that makes the package trustworthy.

**Step 3 — Extract.** `pnpm-workspace.yaml` exists but has no `packages:` key today, so
Get Sorted is not yet a monorepo — adding one is a small change.

*In the package:* `lib/tax`, `lib/expenses`, `lib/cis`, `lib/deductions`, `lib/mileage`,
`lib/reports`, `lib/utils/money`, `lib/utils/dates`, and the pure parts of `lib/vat`.
*Out:* anything importing Supabase, and all of `lib/hmrc` / `lib/mtd`.

*Versioning:* strict semver. A rate change for a new year is a **minor**. A correction
to existing arithmetic is a **patch** and needs a note in the changelog saying which
figures move. An API change is a **major**. Both consumers pin exact versions — you do
not want Get Sorted silently picking up a rate change.

---

## 3. Proposed Phase 1 schema

Single user, but keyed so multi-tenancy isn't designed out. RLS on from the start.

```sql
-- Every table below carries: id uuid pk, created_at, updated_at, deleted_at (soft delete),
-- owner_id uuid not null references auth.users(id), and an RLS policy
--   using (auth.uid() = owner_id) with check (auth.uid() = owner_id)

create table clients (
  name text not null, company_number text, vat_number text,
  default_day_rate_pence bigint, payment_terms_days int not null default 30,
  vat_treatment text not null default 'standard'
    check (vat_treatment in ('standard','reverse_charge','exempt','outside_scope'))
);

create table contacts (
  client_id uuid references clients(id) on delete cascade,
  name text not null, email citext, role text
);
create index on contacts (lower(split_part(email::text,'@',2)));  -- domain matching

create table projects (
  client_id uuid not null references clients(id),
  name text not null,
  status text not null check (status in
    ('pitching','won','active','delivered','invoiced','paid','dead')),
  fee_structure text not null check (fee_structure in ('fixed','day_rate','retainer')),
  fee_pence bigint, day_rate_pence bigint, estimated_days numeric(5,1),
  probability int check (probability between 0 and 100),   -- pipeline weighting
  starts_on date, ends_on date
);

create table engagement_windows (
  project_id uuid not null references projects(id) on delete cascade,
  starts_on date not null, ends_on date not null,
  days_committed numeric(5,1) not null,
  constraint window_order check (ends_on >= starts_on)
);

create table tasks (
  project_id uuid references projects(id) on delete cascade,
  engagement_window_id uuid references engagement_windows(id) on delete set null,
  title text not null, due_on date, estimate_hours numeric(5,1),
  status text not null default 'open',
  source text not null default 'manual'
    check (source in ('manual','granola','email')),
  source_ref text, confidence numeric(3,2)
);

create table invoices (
  project_id uuid references projects(id),
  client_id  uuid not null references clients(id),
  number text not null, issue_date date not null, due_date date not null,
  subtotal_pence bigint not null default 0,
  vat_pence      bigint not null default 0,
  total_pence    bigint generated always as (subtotal_pence + vat_pence) stored,
  status text not null default 'draft'
    check (status in ('draft','scheduled','sent','paid','overdue','written_off')),
  paid_on date,
  unique (owner_id, number)
);

create table expenses (
  spent_on date not null, vendor text not null,
  net_pence bigint not null, vat_pence bigint not null default 0,
  category_slug text not null,          -- FK in spirit to the engine's taxonomy
  entity text not null check (entity in ('company','personal')),
  business_percent int not null default 100 check (business_percent between 1 and 100),
  is_capital_asset boolean not null default false,
  disallowable boolean not null default false,
  recurring_cost_id uuid references recurring_costs(id),
  attachment_path text,
  source text not null default 'manual' check (source in ('manual','email','bank')),
  source_ref text, confidence numeric(3,2)
);

create table recurring_costs (
  vendor text not null, amount_pence bigint not null,
  cadence text not null check (cadence in ('monthly','quarterly','annual')),
  next_charge_on date not null, category_slug text not null,
  cancel_by date, dependency text not null default 'discretionary'
    check (dependency in ('hard','discretionary')),
  last_reviewed_on date, active boolean not null default true
);

create table tax_obligations (
  kind text not null check (kind in
    ('vat_return','mtd_quarterly','ct600','ct_payment','self_assessment',
     'payment_on_account','paye')),
  period_start date not null, period_end date not null, deadline date not null,
  estimated_pence bigint,
  status text not null default 'upcoming'
    check (status in ('upcoming','prepared','filed','paid')),
  unique (owner_id, kind, period_start, period_end)
);

create table meetings (               -- Phase 4, but define the shape now
  external_id text not null, source text not null default 'granola',
  client_id uuid references clients(id), project_id uuid references projects(id),
  title text not null, held_at timestamptz not null,
  summary text, transcript_ref text,
  search tsvector generated always as (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(summary,''))) stored,
  matched_by text check (matched_by in ('domain','title','manual','unmatched')),
  unique (owner_id, source, external_id)
);
create index on meetings using gin (search);

create table match_rules (            -- "I resolved it once, remember it"
  pattern text not null, kind text not null check (kind in ('email_domain','address','subject')),
  client_id uuid references clients(id), project_id uuid references projects(id)
);
```

Notes on choices:
- **Money is `bigint` pence everywhere**, matching the engine. Never `numeric`, never float.
- `source` + `confidence` on `tasks`, `expenses`, `meetings` — your audit requirement.
  `source_ref` holds the quoted sentence or message id so the UI can show provenance.
- `entity` on `expenses` (`company` | `personal`) is load-bearing given §4.1: a company
  expense and a personal one land in different tax regimes.
- `match_rules` implements the "resolve it once, it's remembered" pattern that both the
  Granola and mail triage queues need. One table, two consumers.
- No `payments` table in Phase 1 — `invoices.paid_on` is enough until reconciliation exists.

---

## 4. Where I think the brief is wrong

You asked for pushback. Five substantive ones and two small.

### 4.1 The engine computes the wrong regime for your company — this is the big one

The brief's premise is that reusing the getsorted.tax engine gives Freelance OS its tax
brain. It gives you **part of one**, and less than the framing implies.

You invoice through W Technologies Ltd. Your tax position, as you describe it in §1, is
corporation tax + VAT + PAYE/dividends + personal SA. What `lib/tax` computes is **sole
trader income tax and Class 4 National Insurance**, with an expense taxonomy mapped to
**SA103 boxes**. Corporation tax: not modelled. Dividends: not modelled — the categories
file literally lists "Dividends (you're not a company)" as a not-allowed item.

What genuinely transfers: the VAT nine-box logic, the expense taxonomy (still broadly
correct for what is and isn't an allowable business cost), the money primitives, the
tax-year date handling, the split/capital/disallowable rules, and the P&L builder.
That is real and worth having.

What does not: the actual computation of what you will owe. Your headline
**"safe to spend"** number needs corporation tax with marginal relief, the dividend
allowance and dividend rates, and director's salary — all new code, none of it in the
engine, and all of it in the category of "wrong answers have financial consequences".

**I am not saying don't share the engine.** I'm saying Phase 5 is not "wire up an
existing engine"; it is "write the limited-company tax logic, and reuse the plumbing".
Budget it accordingly, and let's agree the exact rates and reliefs against HMRC's
published figures before I write a line of it — per your §0.4, I'm not going to guess
at any of those numbers.

### 4.2 The phase order buries the reason the app exists

§1 says the app must answer "what will I owe HMRC, when, and how much of what's in the
account is actually mine?" — and §5 makes **"safe to spend"** the headline figure. That
arrives in **Phase 5 of 6**, behind the two hardest and least certain integrations.

Meanwhile: safe-to-spend needs cash in, committed costs out, and tax set aside. Phase 1
already gives you invoices and recurring costs by manual entry. The tax layer is the
only missing input, and it doesn't need Gmail or Granola to work.

**Proposed reorder:** 1 Foundation → **2 Tax** → 3 Desktop → 4 Mail → 5 Granola → 6 HMRC.

Applying your own design principle — "if a feature doesn't change what I do this week,
it goes in the backlog" — Granola action-item extraction is delightful but doesn't change
your week. A number telling you how much of your bank balance isn't yours does.

### 4.3 "Phase 2 — Desktop" is the most under-scoped item in the brief

You've specified Tauri v2 (agreed — Keychain access and binary size both argue for it
over Electron) and **"local-first is a hard requirement: the Mac app must open and show
me everything useful with no network."**

Those two things plus Next.js App Router do not compose cheaply. Server Components
render on a server. In a Tauri bundle you get one of:

- **(a) Tauri as a thin shell** pointing at the hosted app. Gives you Keychain and native
  notifications. Gives you **no offline** — which fails your hard requirement.
- **(b) Genuine local-first**: a local SQLite replica, a sync engine with conflict
  resolution, and the UI reading local state. Meets the requirement. It is a multi-week
  subsystem in its own right, not a shell.

The brief reads as though (a) delivers (b). It doesn't. My recommendation: build Phase 1
web-only, ship (a) early for Keychain and notifications, and treat true local-first as
its own phase with its own decision — including the honest option of "read-only offline
on desktop too", which is what you already accepted for the PWA and which is 80% of the
value for 20% of the work.

### 4.4 Granola is in better shape than the brief assumes — drop the local-cache plan

Your §4.1 lists three routes in order of preference. **Route 1 exists.** Granola shipped
a public REST API at `https://public-api.granola.ai/v1` (first released Feb 2026,
v1.2.0 as of May 2026): read-only access to notes, transcripts, summaries and folders,
authenticated with a Bearer key prefixed `grn_`, generated from the desktop app.

That matters architecturally: a plain REST API is callable from a **Supabase scheduled
function**, so the nightly sync runs server-side and doesn't depend on your Mac being
awake. Caveat to verify on your account: reporting indicates key creation requires a
Business plan.

Route 2 is also confirmed working — I queried the Granola MCP server live in this
session. It returned your account (`connect@joedurr.com`, "Joe's workspace") and the
last 7 meetings with **attendee email addresses and domains** (`lou@therealco.com`,
`eliza@therealco.com`), titles, timestamps and stable UUIDs — precisely the keys your
domain-matching logic needs. So there's a proven fallback.

**Route 3 — reading `~/Library/Application Support/Granola/` — should be deleted from
the plan.** It's brittle, desktop-only, and now unnecessary. Keep the interface seam you
proposed; just don't build that implementation.

### 4.5 Go and check Get Sorted's HMRC position this week

Not a criticism of the brief — a finding that outranks it.

Get Sorted does **not** hold production credentials; its own readiness doc puts it at
"ready to move into the evidence-and-sign-off phase before applying", with sandbox
verification dated 22 Jul 2026. Meanwhile public reporting states HMRC **has stopped
accepting production access requests for new 2026-27 quarterly update products** —
the same closure your brief anticipated.

If that's accurate, the window may have shut on Get Sorted while it was assembling
evidence. That is a much bigger problem for Get Sorted than for Freelance OS, and it
should be verified against the Developer Hub directly before either project moves.

For Freelance OS the consequence is clean and matches what you already wrote: **build
for prepare-don't-file.** Sandbox integration, a complete reviewed submission package,
prefilled figures, and an export your accountant can work from. The UI must never imply
anything has been submitted. Phase 6 stays last, and may stay permanently unshipped —
which is fine, because it isn't what makes the app useful.

### 4.6 Two small ones

**"Today" shouldn't be optional or last.** You describe it as "the thing I open the app
for". Build it as the Phase 1 shell even if it starts as three cards over manual data.
The default landing view being the timetable is a reasonable second choice, but the
brief hedges between them — pick one now.

**Tests before packaging.** §1.6: the band arithmetic has no dedicated test file.
Publishing a versioned tax engine whose core is only indirectly tested through 7 cases
is the wrong order, and your §8 already says fixture cases per tax year are mandatory.
That work lands in extraction Step 2, before anything imports it.

---

## 5. What I need from you before Phase 1

1. **Confirm the reordering in §4.2** (tax to Phase 2), or tell me to keep the brief's order.
2. **Confirm the desktop posture in §4.3** — thin shell early, or commit to real local-first.
3. **Granola plan check** — do you have a Business plan / can you generate a `grn_` API key?
4. **§4.1 is the one that changes scope.** Once you've read it, we should agree what
   Freelance OS's tax module is actually responsible for computing — company, personal,
   or both — before I design it. I won't guess at CT or dividend figures.
5. **Check the HMRC production window** (§4.5). Nothing here blocks on it, but Get Sorted might.

Nothing above blocks starting Phase 1 schema work today.

---

### Sources

- [Granola API docs](https://docs.granola.ai/introduction) · [Granola MCP vs API (Scalekit)](https://www.scalekit.com/blog/granola-mcp-vs-api)
- [HMRC MTD for Income Tax end-to-end service guide](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/) · [ICAEW TAXguide 04/25](https://www.icaew.com/technical/tax/tax-faculty/taxguides/2025/taxguide-04-25) · [Easy MTD — approval delay](https://easymtd.com/news/easy-mtd-income-tax-approval-delay)
- getsorted.tax repo at `1e3468e`; `docs/hmrc-itsa-production-readiness.md`
