-- Freelance OS — Phase 1 foundation schema.
--
-- Conventions, enforced everywhere below:
--   * Money is `bigint` PENCE. Never numeric, never float. This matches the
--     getsorted.tax engine, so figures cross the boundary without conversion.
--   * Soft deletes only. Every table has `deleted_at`; every read filters
--     `deleted_at is null`. Nothing is ever hard-deleted.
--   * Single operator today, but every row is keyed by `owner_id` and guarded
--     by RLS, so multi-tenancy is not designed out.
--   * Records created by an automated extraction carry `source`, `source_ref`
--     and `confidence` so the UI can always show what the machine decided
--     versus what was entered by hand, and offer a revert.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- ─── Clients and contacts ────────────────────────────────────────────────────

create table public.clients (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  company_number        text,
  vat_number            text,
  default_day_rate_pence bigint check (default_day_rate_pence is null or default_day_rate_pence >= 0),
  payment_terms_days    int not null default 30 check (payment_terms_days >= 0),
  vat_treatment         text not null default 'standard'
                          check (vat_treatment in ('standard','reverse_charge','exempt','outside_scope')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  client_id  uuid references public.clients(id) on delete cascade,
  name       text not null,
  email      citext,
  role       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Thread- and meeting-matching walks the email DOMAIN, so index it directly.
create index contacts_email_domain_idx
  on public.contacts (lower(split_part(email::text, '@', 2)))
  where deleted_at is null and email is not null;

-- ─── Projects, engagement windows, tasks ─────────────────────────────────────

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete restrict,
  name            text not null,
  status          text not null default 'pitching'
                    check (status in ('pitching','won','active','delivered','invoiced','paid','dead')),
  fee_structure   text not null default 'fixed'
                    check (fee_structure in ('fixed','day_rate','retainer')),
  fee_pence       bigint check (fee_pence is null or fee_pence >= 0),
  day_rate_pence  bigint check (day_rate_pence is null or day_rate_pence >= 0),
  estimated_days  numeric(6,1) check (estimated_days is null or estimated_days >= 0),
  -- Pipeline weighting: "if nothing new comes in, when do I run out of work?"
  probability     int check (probability is null or probability between 0 and 100),
  starts_on       date,
  ends_on         date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint projects_date_order check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index projects_live_idx on public.projects (owner_id, status) where deleted_at is null;
create index projects_client_idx on public.projects (client_id) where deleted_at is null;

-- The actual booked time on a project. This — not the project date range —
-- is what drives the timetable and the capacity calculation. A project can
-- have several windows (a pitch week in May, delivery in July).
create table public.engagement_windows (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  starts_on       date not null,
  ends_on         date not null,
  days_committed  numeric(6,1) not null check (days_committed >= 0),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint engagement_window_date_order check (ends_on >= starts_on)
);

create index engagement_windows_range_idx
  on public.engagement_windows (owner_id, starts_on, ends_on) where deleted_at is null;

create table public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  project_id           uuid references public.projects(id) on delete cascade,
  engagement_window_id uuid references public.engagement_windows(id) on delete set null,
  title                text not null,
  due_on               date,
  estimate_hours       numeric(5,1) check (estimate_hours is null or estimate_hours >= 0),
  status               text not null default 'open'
                         check (status in ('open','doing','done','dropped')),
  source               text not null default 'manual'
                         check (source in ('manual','granola','email')),
  source_ref           text,
  confidence           numeric(3,2) check (confidence is null or confidence between 0 and 1),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index tasks_due_idx on public.tasks (owner_id, due_on)
  where deleted_at is null and status in ('open','doing');

-- ─── Money out: recurring costs, then expenses ───────────────────────────────

create table public.recurring_costs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  vendor           text not null,
  amount_pence     bigint not null check (amount_pence >= 0),
  cadence          text not null check (cadence in ('monthly','quarterly','annual')),
  next_charge_on   date not null,
  category_slug    text not null,
  -- "Cancel by" watchlist: the date after which renewal is automatic.
  cancel_by        date,
  dependency       text not null default 'discretionary'
                     check (dependency in ('hard','discretionary')),
  last_reviewed_on date,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index recurring_costs_next_charge_idx
  on public.recurring_costs (owner_id, next_charge_on) where deleted_at is null and active;

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  spent_on          date not null,
  vendor            text not null,
  net_pence         bigint not null check (net_pence >= 0),
  vat_pence         bigint not null default 0 check (vat_pence >= 0),
  gross_pence       bigint generated always as (net_pence + vat_pence) stored,
  category_slug     text not null,
  -- A company cost and a personal one land in different tax regimes. This
  -- column is load-bearing for anything the tax module computes later.
  entity            text not null default 'company' check (entity in ('company','personal')),
  business_percent  int not null default 100 check (business_percent between 1 and 100),
  is_capital_asset  boolean not null default false,
  disallowable      boolean not null default false,
  project_id        uuid references public.projects(id) on delete set null,
  recurring_cost_id uuid references public.recurring_costs(id) on delete set null,
  attachment_path   text,
  source            text not null default 'manual'
                      check (source in ('manual','email','bank')),
  source_ref        text,
  confidence        numeric(3,2) check (confidence is null or confidence between 0 and 1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index expenses_spent_on_idx on public.expenses (owner_id, spent_on) where deleted_at is null;
create index expenses_category_idx on public.expenses (owner_id, category_slug) where deleted_at is null;

-- ─── Money in: invoices ──────────────────────────────────────────────────────

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete restrict,
  project_id     uuid references public.projects(id) on delete set null,
  number         text not null,
  issue_date     date not null,
  due_date       date not null,
  subtotal_pence bigint not null default 0 check (subtotal_pence >= 0),
  vat_pence      bigint not null default 0 check (vat_pence >= 0),
  total_pence    bigint generated always as (subtotal_pence + vat_pence) stored,
  -- 'scheduled' is a future-dated invoice that has not been sent. It must be
  -- included in the cash forecast and excluded from anything owed today.
  status         text not null default 'draft'
                   check (status in ('draft','scheduled','sent','paid','overdue','written_off')),
  paid_on        date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint invoices_date_order check (due_date >= issue_date),
  constraint invoices_paid_consistency check (
    (status = 'paid' and paid_on is not null) or (status <> 'paid' and paid_on is null)
  )
);

create unique index invoices_number_idx on public.invoices (owner_id, number) where deleted_at is null;
create index invoices_due_idx on public.invoices (owner_id, due_date)
  where deleted_at is null and status in ('sent','overdue','scheduled');

create table public.invoice_line_items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  invoice_id     uuid not null references public.invoices(id) on delete cascade,
  description    text not null,
  quantity       numeric(8,2) not null default 1 check (quantity > 0),
  unit_price_pence bigint not null check (unit_price_pence >= 0),
  vat_rate       numeric(5,2) not null default 0 check (vat_rate between 0 and 100),
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id) where deleted_at is null;

-- ─── Tax obligations ─────────────────────────────────────────────────────────
-- Deliberately regime-agnostic. What Freelance OS is responsible for
-- COMPUTING (company vs personal) is still an open question — see PLAN.md
-- §4.1 — so this table records the obligation and its deadline without
-- assuming which engine produces the estimate.

create table public.tax_obligations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in (
                     'vat_return','mtd_quarterly','ct600','ct_payment',
                     'self_assessment','payment_on_account','paye')),
  period_start     date not null,
  period_end       date not null,
  deadline         date not null,
  estimated_pence  bigint,
  -- 'filed' means submitted to HMRC by some route. Nothing in Phase 1 files
  -- anything, so this is set by hand. The UI must never imply otherwise.
  status           text not null default 'upcoming'
                     check (status in ('upcoming','prepared','filed','paid')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint tax_obligations_period_order check (period_end >= period_start)
);

create unique index tax_obligations_period_idx
  on public.tax_obligations (owner_id, kind, period_start, period_end) where deleted_at is null;

-- ─── Meetings (Phase 4 shape, defined now) ───────────────────────────────────

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  source        text not null default 'granola' check (source in ('granola')),
  external_id   text not null,
  client_id     uuid references public.clients(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  title         text not null,
  held_at       timestamptz not null,
  summary       text,
  transcript_ref text,
  matched_by    text not null default 'unmatched'
                  check (matched_by in ('domain','title','manual','unmatched')),
  search        tsvector generated always as (
                  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,''))
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index meetings_external_idx on public.meetings (owner_id, source, external_id);
create index meetings_search_idx on public.meetings using gin (search);
create index meetings_triage_idx on public.meetings (owner_id, held_at)
  where deleted_at is null and matched_by = 'unmatched';

-- Resolve a triage item once, and the match is remembered. Shared by the
-- Granola and the mail triage queues — one table, two consumers.
create table public.match_rules (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('email_domain','address','subject')),
  pattern    citext not null,
  client_id  uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint match_rules_target check (client_id is not null or project_id is not null)
);

create unique index match_rules_pattern_idx on public.match_rules (owner_id, kind, pattern)
  where deleted_at is null;

-- ─── updated_at maintenance ──────────────────────────────────────────────────

create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','projects','engagement_windows','tasks',
    'recurring_costs','expenses','invoices','invoice_line_items',
    'tax_obligations','meetings','match_rules'
  ] loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Single owner-scoped policy per table. Written as a loop so a new table
-- cannot be added later with the policy accidentally omitted — add it to the
-- array and the policy comes with it.

do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','projects','engagement_windows','tasks',
    'recurring_costs','expenses','invoices','invoice_line_items',
    'tax_obligations','meetings','match_rules'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all
         using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
      t || '_owner', t);
  end loop;
end $$;
