-- A second, low-privilege Postgres role for the app to connect as — the
-- Neon equivalent of Supabase never letting PostgREST connect as the table
-- owner.
--
-- Why this exists: `FORCE ROW LEVEL SECURITY` (see 0001/0002's comments)
-- stops a table's OWNER from being exempt from RLS by default. It does NOT
-- stop a role with the separate `BYPASSRLS` attribute, which skips row
-- security entirely regardless of FORCE — and Neon's default project role
-- (`neondb_owner`, what NEON_DSN pointed at through the initial Supabase→
-- Neon migration) has BYPASSRLS set. Confirmed on the live database, not
-- assumed: inserted a row as one user, read it back as a different user
-- through neondb_owner, and RLS did not filter it — despite FORCE being on
-- and `app_user_id()` correctly resolving to the second user's id at query
-- time. `neondb_owner` cannot even strip its own BYPASSRLS (Neon rejects
-- `ALTER ROLE ... NOBYPASSRLS` on it) — the fix has to be a role that never
-- had the attribute to begin with.
--
-- `app_user` is that role: normal login, no BYPASSRLS, no ownership, and
-- only the privileges the running app actually needs (no DDL, no CREATE).
-- NEON_DSN (both the web app's .env.local and the desktop app's
-- VITE_NEON_DSN) should point at `app_user`, never at the project owner —
-- see scripts/set-app-role-password.mjs to set its password. The migration
-- and user-creation scripts (migrate-neon.mjs, create-user.mjs, whoami.mjs)
-- keep using the owner credential directly, since they run DDL and admin
-- operations app_user deliberately cannot.
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    -- A random, immediately-rotated placeholder — nobody should ever sign
    -- in with this literal value. Real use requires running
    -- scripts/set-app-role-password.mjs once, which ALTERs it to something
    -- generated and never stored in this repo.
    create role app_user with login nosuperuser nocreatedb nocreaterole nobypassrls
      password 'placeholder-run-scripts-slash-set-app-role-password-dot-mjs';
  end if;
end
$$;

grant usage on schema public to app_user;

-- `users` has no RLS by design (see 0000_users.sql) — app_user needs read
-- access for the sign-in lookup, but never writes it directly (account
-- creation is create-user.mjs, run with owner credentials, by design: no
-- signup UI).
grant select on public.users to app_user;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','contacts','projects','engagement_windows','tasks',
    'recurring_costs','expenses','invoices','invoice_line_items',
    'tax_obligations','meetings','match_rules',
    'time_entries','running_timers','work_artefacts'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
  end loop;
end
$$;
