-- Private storage for work artefacts.
--
-- Split from 0002 because it touches Supabase's `storage` schema, which does
-- not exist in a plain Postgres instance — 0002 can be verified locally, this
-- cannot. Run it against Supabase only.
--
-- The bucket is PRIVATE. Screenshots of client work are the most sensitive
-- data this app holds; they are read through short-lived signed URLs, never a
-- public path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-artefacts', 'work-artefacts', false,
  20971520,  -- 20 MB; a screenshot that exceeds this wants compressing first
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf']
)
on conflict (id) do nothing;

-- Objects are namespaced by owner: `{owner_id}/{project_id}/{uuid}.png`.
-- Every policy checks the first path segment against the caller, so one user's
-- artefacts are unreachable by another even with a guessed path.
create policy "work_artefacts_read_own" on storage.objects for select
  using (bucket_id = 'work-artefacts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "work_artefacts_insert_own" on storage.objects for insert
  with check (bucket_id = 'work-artefacts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "work_artefacts_delete_own" on storage.objects for delete
  using (bucket_id = 'work-artefacts' and (storage.foldername(name))[1] = auth.uid()::text);
