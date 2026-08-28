-- Local SQLite schema — the offline mirror of the Phase 1/2 Postgres schema
-- for the tables that matter for "opens with no network and shows me
-- everything useful". See docs/desktop-architecture.md for what's in and out
-- of scope and why.
--
-- Deliberately NOT identical to the Postgres schema:
--   * No RLS — this file IS one user's data; there's nothing to isolate from.
--   * No `owner_id` — same reason.
--   * Money and boolean columns use SQLite's native types (INTEGER for both
--     pence and 0/1 booleans) rather than bigint/boolean, since SQLite has
--     no distinct boolean type and its INTEGER is already 64-bit.
--   * Every table needs `updated_at` for the sync engine's last-write-wins
--     rule (§4.2 of the architecture doc) even where Postgres has it purely
--     for bookkeeping — that column is now load-bearing, not incidental.
--   * Foreign keys are declared but SQLite does not enforce them unless
--     `PRAGMA foreign_keys = ON` is set per-connection — the app must set it
--     on every connection it opens; this file only declares the intent.

pragma foreign_keys = on;

create table clients (
  id                      text primary key,
  name                    text not null,
  company_number          text,
  vat_number              text,
  default_day_rate_pence  integer,
  payment_terms_days      integer not null default 30,
  vat_treatment           text not null default 'standard'
                            check (vat_treatment in ('standard','reverse_charge','exempt','outside_scope')),
  notes                   text,
  created_at              text not null,
  updated_at              text not null,
  deleted_at              text
);

create table projects (
  id              text primary key,
  client_id       text not null references clients(id),
  name            text not null,
  status          text not null default 'pitching'
                    check (status in ('pitching','won','active','delivered','invoiced','paid','dead')),
  fee_structure   text not null default 'fixed'
                    check (fee_structure in ('fixed','day_rate','retainer')),
  fee_pence       integer,
  day_rate_pence  integer,
  estimated_days  real,
  probability     integer,
  starts_on       text,
  ends_on         text,
  notes           text,
  created_at      text not null,
  updated_at      text not null,
  deleted_at      text
);
create index projects_client_idx on projects (client_id) where deleted_at is null;

create table invoices (
  id             text primary key,
  client_id      text not null references clients(id),
  project_id     text references projects(id),
  number         text not null,
  issue_date     text not null,
  due_date       text not null,
  subtotal_pence integer not null default 0,
  vat_pence      integer not null default 0,
  -- Not a generated column here (SQLite's STORED GENERATED needs the
  -- expression on every read path to agree, and the sync engine writes whole
  -- rows from server JSON) — total is written explicitly on every upsert,
  -- computed the same way `total_pence` is server-side.
  total_pence    integer not null default 0,
  status         text not null default 'draft'
                   check (status in ('draft','scheduled','sent','paid','overdue','written_off')),
  paid_on        text,
  notes          text,
  created_at     text not null,
  updated_at     text not null,
  deleted_at     text
);
create index invoices_client_idx on invoices (client_id) where deleted_at is null;

create table expenses (
  id                text primary key,
  spent_on          text not null,
  vendor            text not null,
  net_pence         integer not null default 0,
  vat_pence         integer not null default 0,
  gross_pence       integer not null default 0,  -- written explicitly, see invoices.total_pence note
  category_slug     text not null,
  entity            text not null default 'company' check (entity in ('company','personal')),
  business_percent  integer not null default 100,
  is_capital_asset  integer not null default 0,
  disallowable      integer not null default 0,
  project_id        text references projects(id),
  recurring_cost_id text,
  attachment_path   text,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text
);
create index expenses_spent_on_idx on expenses (spent_on) where deleted_at is null;

create table recurring_costs (
  id               text primary key,
  vendor           text not null,
  amount_pence     integer not null,
  cadence          text not null check (cadence in ('monthly','quarterly','annual')),
  next_charge_on   text not null,
  category_slug    text not null,
  cancel_by        text,
  dependency       text not null default 'discretionary' check (dependency in ('hard','discretionary')),
  last_reviewed_on text,
  active           integer not null default 1,
  created_at       text not null,
  updated_at       text not null,
  deleted_at       text
);

create table tasks (
  id                    text primary key,
  project_id            text references projects(id),
  engagement_window_id  text,
  title                 text not null,
  due_on                text,
  estimate_hours        real,
  status                text not null default 'open' check (status in ('open','doing','done','dropped')),
  source                text not null default 'manual',
  created_at            text not null,
  updated_at            text not null,
  deleted_at            text
);
create index tasks_project_idx on tasks (project_id) where deleted_at is null;

create table time_entries (
  id          text primary key,
  project_id  text not null references projects(id),
  task_id     text references tasks(id),
  worked_on   text not null,
  minutes     integer not null check (minutes > 0 and minutes <= 1440),
  note        text,
  billable    integer not null default 1,
  source      text not null default 'manual',
  created_at  text not null,
  updated_at  text not null,
  deleted_at  text
);
create index time_entries_worked_on_idx on time_entries (worked_on) where deleted_at is null;

-- ─── Sync bookkeeping — local only, never themselves synced ──────────────────

-- `payload` is the row's full current state and is ALWAYS present, even
-- for a delete: this app soft-deletes everywhere (deleted_at, never a real
-- DELETE), so a "delete" is just an upsert whose payload has deleted_at
-- set. An earlier version of this table allowed payload to be null for a
-- delete, which meant a push had nothing to actually write deleted_at
-- from — see lib/sync/engine.test.ts for the regression test that exists
-- because that bug shipped once already.
create table outbox (
  id          text primary key,
  table_name  text not null,
  row_id      text not null,
  op          text not null check (op in ('upsert','delete')),
  payload     text not null,
  created_at  text not null,
  attempts    integer not null default 0
);
create index outbox_order_idx on outbox (created_at);

create table sync_cursor (
  table_name      text primary key,
  last_synced_at  text not null
);
