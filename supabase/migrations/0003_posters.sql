-- SportsHunt v2, migration 3: fix publishing, add event posters.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run on existing data.

-- Fix: creating an event inserts a draft and reads it back. The old read rule looked the event up through
-- can_manage(), which can't see a row inserted by the same statement, so publishing failed with an RLS error.
-- Checking organiser_id on the row itself works for new rows too.
drop policy if exists "published events are public" on public.events;
create policy "published events are public" on public.events for select
  using (status <> 'draft' or organiser_id = auth.uid() or public.can_manage(id));

-- Posters: one image per event, public to view, uploaded by the event's managers.
alter table public.events add column if not exists poster_url text check (poster_url is null or length(poster_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live at posters/<event id>/<file>. Only that event's managers may add, replace or delete them.
create or replace function public.poster_event(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.poster_event(text) to anon, authenticated;

drop policy if exists "posters are public" on storage.objects;
drop policy if exists "managers upload posters" on storage.objects;
drop policy if exists "managers replace posters" on storage.objects;
drop policy if exists "managers delete posters" on storage.objects;
create policy "posters are public" on storage.objects for select using (bucket_id = 'posters');
create policy "managers upload posters" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and public.can_manage(public.poster_event(name)));
create policy "managers replace posters" on storage.objects for update to authenticated
  using (bucket_id = 'posters' and public.can_manage(public.poster_event(name)))
  with check (bucket_id = 'posters' and public.can_manage(public.poster_event(name)));
create policy "managers delete posters" on storage.objects for delete to authenticated
  using (bucket_id = 'posters' and public.can_manage(public.poster_event(name)));
