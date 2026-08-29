-- Phase 4 — Mail. Email threads and the triage queue that matches them to a
-- client/project, sharing the pattern already built for meetings (Phase 5,
-- Granola) rather than inventing a second one: `matched_by` and the existing
-- `match_rules` table (0001) are reused as-is — match_rules was written with
-- kind in ('email_domain','address','subject') specifically so mail could
-- consume it without a schema change, and it does here unmodified.

create table public.email_threads (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  external_id   text not null,             -- Gmail thread id
  client_id     uuid references public.clients(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  subject       text not null,
  from_name     text,
  from_address  citext not null,
  snippet       text,
  -- What kind of thing this looks like, surfaced so the triage queue can be
  -- worked by type rather than strict chronological order. Detected by
  -- lib/mail/classify.ts, never by the LLM inventing a category silently —
  -- see that module's tests for exactly which signals set which kind.
  kind          text not null default 'other'
                  check (kind in (
                    'enquiry','scope_change','invoice_reply','payment_confirmation',
                    'receipt','subscription_charge','other'
                  )),
  matched_by    text not null default 'unmatched'
                  check (matched_by in ('domain','address','subject','manual','unmatched')),
  received_at   timestamptz not null,
  search        tsvector generated always as (
                  to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(snippet,''))
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index email_threads_external_idx on public.email_threads (owner_id, external_id);
create index email_threads_search_idx on public.email_threads using gin (search);
create index email_threads_triage_idx on public.email_threads (owner_id, received_at desc)
  where deleted_at is null and matched_by = 'unmatched';
create index email_threads_from_domain_idx
  on public.email_threads (owner_id, (lower(split_part(from_address::text, '@', 2))))
  where deleted_at is null;

-- ─── Suggestions extracted from a thread ─────────────────────────────────────
-- One row per candidate action a thread produced — a draft expense from a
-- receipt, a deadline spotted in client copy, a proposed invoice chaser. NOT
-- applied to the real table (expenses, tasks, …) until accepted; §8's
-- non-negotiable is explicit that nothing acts on Joe's behalf without his
-- confirmation, and a suggestion row existing is not that confirmation.
create table public.mail_suggestions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users(id) on delete cascade,
  email_thread_id uuid not null references public.email_threads(id) on delete cascade,
  kind            text not null check (kind in ('expense','deadline','invoice_chaser')),
  -- The proposal itself, shaped per `kind` — a draft expense's fields, a
  -- deadline date + label, or a chaser's subject/body. Kept as JSONB rather
  -- than three parallel nullable-column sets, since only one kind ever
  -- applies per row and the three shapes share almost nothing.
  payload         jsonb not null,
  -- The exact source sentence/snippet the suggestion was drawn from —
  -- shown next to the suggestion so Joe can see what the machine saw,
  -- not just what it concluded. Distinct from mail_suggestions itself
  -- being "the source" — this is the quote, not the row.
  source_quote    text,
  status          text not null default 'pending'
                    check (status in ('pending','accepted','dismissed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index mail_suggestions_pending_idx on public.mail_suggestions (owner_id, created_at)
  where deleted_at is null and status = 'pending';
create index mail_suggestions_thread_idx on public.mail_suggestions (email_thread_id)
  where deleted_at is null;

-- ─── updated_at + RLS, same loop pattern as 0001/0002 ────────────────────────

do $$
declare t text;
begin
  foreach t in array array['email_threads','mail_suggestions'] loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    -- Without FORCE, Postgres exempts the TABLE OWNER from every RLS policy
    -- on it. Neon has no PostgREST-style separate low-privilege role the way
    -- Supabase does — the connection role the app authenticates with is the
    -- same role that created these tables, so without this every policy
    -- below would be a silent no-op for that exact role. Confirmed on a real
    -- Neon database, not assumed: the table owner saw every row before this
    -- was added, with the policies already in place.
    --
    -- FORCE alone is still not the whole story: Neon's default owner role
    -- also has BYPASSRLS, which skips row security regardless of FORCE —
    -- also confirmed live, separately from the above. See
    -- 0004_app_role.sql's app_user role, which is what NEON_DSN must
    -- actually point at for these policies to do anything.
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all
         using (public.app_user_id() = owner_id) with check (public.app_user_id() = owner_id)',
      t || '_owner', t);
  end loop;
end $$;
