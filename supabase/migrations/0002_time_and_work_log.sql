-- Time tracking and the session work log.
--
-- These are one concept, not two: a session is a block of time on a project,
-- what was done in it, and the evidence of what came out. Splitting "hours"
-- from "a log of what I did" would mean two things to keep in step and two
-- places to look.
--
-- Time is stored as a DATE plus whole MINUTES, not a start/end timestamp pair.
-- A freelancer logs "Tuesday, 3½ hours on the Medello homepage" — the wall
-- clock instants are not the fact being recorded, and storing them invites the
-- same timezone class of bug the date helpers exist to avoid. A running timer
-- is a separate, transient thing (see running_timers) and resolves to minutes
-- when it stops.

-- ─── Completed sessions ──────────────────────────────────────────────────────

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  worked_on   date not null,
  minutes     int not null check (minutes > 0 and minutes <= 1440),
  -- What was done. This is the log entry; keeping it on the same row as the
  -- hours is what makes the hours reviewable a month later.
  note        text,
  -- Non-billable time is still tracked: it is the difference between the fee
  -- and what the work actually cost, which is the whole point of the
  -- effective-rate figure.
  billable    boolean not null default true,
  source      text not null default 'manual'
                check (source in ('manual','timer','granola')),
  source_ref  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index time_entries_worked_on_idx
  on public.time_entries (owner_id, worked_on desc) where deleted_at is null;
create index time_entries_project_idx
  on public.time_entries (project_id, worked_on) where deleted_at is null;

-- ─── The running timer ───────────────────────────────────────────────────────
-- owner_id is the PRIMARY KEY, which is what enforces "one timer at a time"
-- — the database refuses a second start rather than the UI trying to.

create table public.running_timers (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  note       text
);

-- ─── Work artefacts: the visual record of a session ─────────────────────────
-- A screenshot, an export, a link. Attached to the session it came out of, and
-- denormalised onto the project so a project's whole visual trail is one query
-- rather than a join through every session.

create table public.work_artefacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  time_entry_id uuid references public.time_entries(id) on delete set null,
  kind          text not null default 'screenshot'
                  check (kind in ('screenshot','file','link')),
  -- Path within the private `work-artefacts` storage bucket, or the URL for a
  -- 'link'. Exactly one applies, enforced below.
  storage_path  text,
  url           text,
  caption       text,
  captured_at   timestamptz not null default now(),
  byte_size     bigint check (byte_size is null or byte_size >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint work_artefacts_location check (
    (kind = 'link' and url is not null and storage_path is null) or
    (kind <> 'link' and storage_path is not null and url is null)
  )
);

create index work_artefacts_project_idx
  on public.work_artefacts (project_id, captured_at desc) where deleted_at is null;
create index work_artefacts_session_idx
  on public.work_artefacts (time_entry_id) where deleted_at is null;

-- ─── updated_at + RLS ────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['time_entries','work_artefacts'] loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
  end loop;

  foreach t in array array['time_entries','running_timers','work_artefacts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all
         using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
      t || '_owner', t);
  end loop;
end $$;
