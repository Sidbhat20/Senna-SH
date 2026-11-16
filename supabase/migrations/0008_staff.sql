-- SportsHunt v2, migration 8: staff invites (P0.5).
-- The owner invites co-organisers with single-use links that expire in 7 days. Co-organisers run the event but can't
-- delete it, transfer it, or invite/remove other co-organisers. Referees keep using referee_links.
-- Staff rows now change only through these functions (before, any manager could insert any user as staff).

create or replace function public.is_owner(e uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (select 1 from public.events where id = e and organiser_id = auth.uid())
$$;

create table public.staff_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null default 'co_organiser' check (role = 'co_organiser'),
  note text not null default '' check (length(note) <= 80),     -- who it's for, so the owner can tell links apart
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  redeemed_by uuid references public.profiles (id),
  redeemed_at timestamptz,
  revoked_at timestamptz
);
alter table public.staff_invites enable row level security;
create policy "owners see their invites" on public.staff_invites for select to authenticated using (public.is_owner(event_id));
revoke insert, update, delete on public.staff_invites from anon, authenticated;

-- Staff changes go through the functions below.
revoke insert, update, delete on public.officials from anon, authenticated;

create or replace function public.create_staff_invite(p_event uuid, p_note text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_token text;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.is_owner(e.id) then raise exception 'Only the tournament''s owner can invite co-organisers'; end if;
  if e.status in ('completed', 'cancelled') then raise exception 'This tournament is %', e.status; end if;
  insert into public.staff_invites (event_id, note) values (e.id, left(trim(coalesce(p_note, '')), 80)) returning token into v_token;
  return v_token;
end $$;

create or replace function public.revoke_staff_invite(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.staff_invites;
begin
  select * into i from public.staff_invites where token = p_token;
  if i.token is null or not public.is_owner(i.event_id) then raise exception 'Only the tournament''s owner can withdraw invites'; end if;
  update public.staff_invites set revoked_at = now() where token = p_token and revoked_at is null and redeemed_at is null;
end $$;

create or replace function public.join_staff(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.staff_invites;
begin
  if auth.uid() is null then raise exception 'Log in to accept the invite'; end if;
  select * into i from public.staff_invites where token = p_token for update;
  if i.token is null then raise exception 'This invite link is not valid'; end if;
  if i.revoked_at is not null or i.redeemed_at is not null or i.expires_at <= now() then
    raise exception 'This invite has been used or has expired. Ask the organiser for a new one';
  end if;
  if exists (select 1 from public.events where id = i.event_id and organiser_id = auth.uid()) then
    raise exception 'You already own this tournament';
  end if;
  insert into public.officials (event_id, user_id, role, court_id) values (i.event_id, auth.uid(), 'co_organiser', null)
  on conflict (event_id, user_id) do update set role = 'co_organiser', court_id = null;
  update public.staff_invites set redeemed_by = auth.uid(), redeemed_at = now() where token = p_token;
  return i.event_id;
end $$;

-- The owner removes anyone; a co-organiser removes referees, or steps down themselves. Takes effect at once:
-- can_manage and can_score_match read officials on every call.
create or replace function public.remove_official(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.officials;
begin
  select * into o from public.officials where event_id = p_event and user_id = p_user;
  if o.user_id is null then raise exception 'That person isn''t on this tournament''s staff'; end if;
  if not (public.is_owner(p_event)
          or p_user = auth.uid()
          or (o.role = 'referee' and public.can_manage(p_event))) then
    raise exception 'Only the tournament''s owner can remove co-organisers';
  end if;
  delete from public.officials where event_id = p_event and user_id = p_user;
end $$;

revoke execute on function public.is_owner(uuid), public.create_staff_invite(uuid, text), public.revoke_staff_invite(text),
  public.join_staff(text), public.remove_official(uuid, uuid) from public, anon;
grant execute on function public.is_owner(uuid), public.create_staff_invite(uuid, text), public.revoke_staff_invite(text),
  public.join_staff(text), public.remove_official(uuid, uuid) to authenticated;
