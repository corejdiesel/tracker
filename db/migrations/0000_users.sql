-- Freelance OS's own auth store, replacing Supabase's auth.users/auth.uid()
-- now that the app targets plain Neon Postgres. Password hashing (Node's
-- built-in scrypt) and session issuing (signed JWT cookies via `jose`)
-- happen in application code — see lib/auth/*.ts — this table just holds
-- what a credentials-based auth needs: an email and a hash, nothing else.
--
-- No signup UI exists, deliberately (unchanged from the Supabase-era
-- decision) — this is a single-operator app, so the one account is created
-- once via `scripts/create-user.mjs` run directly against the database,
-- not a form built for a single use.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Deliberately NO row level security on this table, unlike every other
-- table in the schema — a login attempt has to look a user up BY EMAIL
-- before any session (and therefore any app.user_id) exists, so it can't
-- be gated by app_user_id() the way owner-scoped data is. This is safe
-- specifically because this database is never reachable from the browser:
-- the connection string lives only in server-side environment variables,
-- never shipped to a client, unlike Supabase's PostgREST setup where the
-- whole database sits behind a public API and RLS is the only thing
-- standing between an anonymous request and every table.

-- The RLS identity function every policy in every other migration calls.
-- Reads a session-local Postgres setting rather than a JWT the database
-- parses itself: the app authenticates the request (verifying the signed
-- session cookie) BEFORE it ever opens a database connection, then sets
-- this once per request/transaction. `true` as the second argument to
-- current_setting makes a missing setting return NULL rather than error —
-- so a connection nobody has authenticated for simply sees no rows,
-- rather than every policy check throwing.
create or replace function public.app_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
