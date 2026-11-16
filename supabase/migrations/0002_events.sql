-- SportsHunt v2, migration 2: events with categories, courts and match times,
-- organiser-added entries (walk-ins, clubs, seeds) and referee invite links.
-- Replaces the single-draw tables from 0001. Keeps profiles, teams and team_members.
-- WARNING: deletes any existing tournaments, entries and matches.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- ---------- remove the 0001 tournament tables and the functions that used them ----------
drop view if exists public.entry_names;
drop table if exists public.reports, public.officials, public.matches, public.entries, public.tournaments cascade;
drop function if exists public.can_manage(uuid), public.can_score(uuid), public.is_visible(uuid),
  public.register_entry(uuid, uuid), public.withdraw_entry(uuid), public.send_to(uuid, text, text, uuid),
  public.settle_byes(uuid), public.save_fixtures(uuid, jsonb), public.update_score(uuid, int, int),
  public.finish_match(uuid) cascade;

-- ---------- tables ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 90),
  organiser_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(trim(title)) between 4 and 120),
  sport public.sport not null,
  venue text not null check (length(trim(venue)) between 1 and 120),
  area text not null default '' check (length(area) <= 120),
  starts_at timestamptz not null,
  reg_closes_at timestamptz not null,
  prize text not null default '' check (length(prize) <= 200),
  rules text[] not null default '{}',
  match_minutes int not null default 30 check (match_minutes between 5 and 240),
  break_minutes int not null default 5 check (break_minutes between 0 and 60),
  status public.t_status not null default 'open',
  created_at timestamptz not null default now(),
  check (reg_closes_at <= starts_at)
);

-- A category is one draw inside an event: "Men's Singles", "U13 Boys", "Open".
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  format public.t_format not null,
  group_count int check (group_count between 2 and 8),
  entry_type text not null check (entry_type in ('team', 'solo')),
  team_size int not null default 1 check (team_size between 1 and 30),
  max_entries int not null check (max_entries between 2 and 128),
  entry_fee int not null default 0 check (entry_fee between 0 and 1000000),
  status public.t_status not null default 'open',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check ((format = 'groups_knockout') = (group_count is not null)),
  unique (event_id, name)
);
create index categories_event on public.categories (event_id);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort int not null default 0,
  unique (event_id, name)
);

-- An entry is a registered player, a registered team, or a name the organiser typed in (walk-ins).
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  team_id uuid references public.teams (id),
  user_id uuid references public.profiles (id),
  display_name text check (length(trim(display_name)) between 1 and 80),
  club text not null default '' check (length(club) <= 80),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'withdrawn')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'unpaid', 'paid', 'refunded')),
  seed int check (seed between 1 and 999),
  added_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(team_id, user_id, display_name) = 1),
  unique (category_id, team_id),
  unique (category_id, user_id)
);
create index entries_category on public.entries (category_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  key text not null,
  stage public.stage_kind not null,
  grp text,
  round int not null,
  slot int not null,
  entry_a uuid references public.entries (id),
  entry_b uuid references public.entries (id),
  a_bye boolean not null default false,
  b_bye boolean not null default false,
  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  status public.match_status not null default 'scheduled',
  walkover boolean not null default false,
  winner_entry uuid references public.entries (id),
  next_key text,
  next_side text check (next_side in ('a', 'b')),
  loser_next_key text,
  loser_next_side text check (loser_next_side in ('a', 'b')),
  court_id uuid references public.courts (id) on delete set null,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (category_id, key)
);
create index matches_event on public.matches (event_id);

-- Referees score one court (court_id) or every court (null). Co-organisers manage the whole event.
create table public.officials (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('referee', 'co_organiser')),
  court_id uuid references public.courts (id) on delete cascade,
  primary key (event_id, user_id)
);

-- Secret links the organiser shares with referees. Only managers can read them.
create table public.referee_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  event_id uuid not null references public.events (id) on delete cascade,
  court_id uuid references public.courts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id),
  reason text not null check (length(trim(reason)) between 5 and 1000),
  created_at timestamptz not null default now()
);

create view public.entry_names with (security_invoker = true) as
select e.id, e.category_id, e.status, e.payment_status, e.seed, e.club, e.created_at,
       coalesce(e.display_name, t.name, p.name) as name
from public.entries e
left join public.teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id;

-- ---------- permission helpers ----------
create function public.can_manage(e uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
    or exists (select 1 from public.events where id = e and organiser_id = auth.uid())
    or exists (select 1 from public.officials where event_id = e and user_id = auth.uid() and role = 'co_organiser')
$$;

create function public.is_visible(e uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = e and status <> 'draft') or public.can_manage(e)
$$;

create function public.category_event(c uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select event_id from public.categories where id = c
$$;

-- Managers score anything; referees score matches on their court (or any court if theirs is null).
create function public.can_score_match(p_match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match
      and (public.can_manage(m.event_id)
           or exists (select 1 from public.officials o
                      where o.event_id = m.event_id and o.user_id = auth.uid() and o.role = 'referee'
                        and (o.court_id is null or o.court_id = m.court_id)))
  )
$$;

-- ---------- row level security ----------
alter table public.events enable row level security;
alter table public.categories enable row level security;
alter table public.courts enable row level security;
alter table public.entries enable row level security;
alter table public.matches enable row level security;
alter table public.officials enable row level security;
alter table public.referee_links enable row level security;
alter table public.reports enable row level security;

create policy "published events are public" on public.events for select using (status <> 'draft' or public.can_manage(id));
create policy "signed-in users create events" on public.events for insert to authenticated
  with check (
    organiser_id = auth.uid() and status in ('draft', 'open')
    and not coalesce((select banned from public.profiles where id = auth.uid()), true)
  );
create policy "managers edit events" on public.events for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));
create policy "organisers delete drafts" on public.events for delete to authenticated
  using (organiser_id = auth.uid() and status = 'draft');

create policy "categories follow event" on public.categories for select using (public.is_visible(event_id));
create policy "managers add categories" on public.categories for insert to authenticated with check (public.can_manage(event_id));
create policy "managers edit categories" on public.categories for update to authenticated
  using (public.can_manage(event_id)) with check (public.can_manage(event_id));
create policy "managers delete open categories" on public.categories for delete to authenticated
  using (public.can_manage(event_id) and status = 'open');

create policy "courts follow event" on public.courts for select using (public.is_visible(event_id));
create policy "managers add courts" on public.courts for insert to authenticated with check (public.can_manage(event_id));
create policy "managers edit courts" on public.courts for update to authenticated
  using (public.can_manage(event_id)) with check (public.can_manage(event_id));
create policy "managers delete courts" on public.courts for delete to authenticated using (public.can_manage(event_id));

create policy "entries follow event" on public.entries for select using (public.is_visible(public.category_event(category_id)));
create policy "managers edit entries" on public.entries for update to authenticated
  using (public.can_manage(public.category_event(category_id))) with check (public.can_manage(public.category_event(category_id)));
create policy "managers remove entries before the draw" on public.entries for delete to authenticated
  using (public.can_manage(public.category_event(category_id))
         and exists (select 1 from public.categories c where c.id = category_id and c.status = 'open'));

create policy "matches follow event" on public.matches for select using (public.is_visible(event_id));

create policy "officials follow event" on public.officials for select using (public.is_visible(event_id));
create policy "managers add officials" on public.officials for insert to authenticated with check (public.can_manage(event_id));
create policy "managers remove officials" on public.officials for delete to authenticated using (public.can_manage(event_id));

create policy "managers see referee links" on public.referee_links for select to authenticated using (public.can_manage(event_id));
create policy "managers create referee links" on public.referee_links for insert to authenticated with check (public.can_manage(event_id));
create policy "managers delete referee links" on public.referee_links for delete to authenticated using (public.can_manage(event_id));

create policy "anyone signed in can report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());

-- ---------- functions: entries ----------
create function public.register_entry(p_category uuid, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  e public.events;
  v_count int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Log in to register'; end if;
  if (select banned from public.profiles where id = auth.uid()) then raise exception 'This account cannot register'; end if;
  -- lock the category so two last-minute entries can't both take the final spot
  select * into c from public.categories where id = p_category for update;
  select * into e from public.events where id = c.event_id;
  if c.id is null or e.status <> 'open' or c.status <> 'open' then raise exception 'Registration is closed'; end if;
  if now() > e.reg_closes_at then raise exception 'Registration has closed'; end if;
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count >= c.max_entries then raise exception 'This category is full'; end if;

  if c.entry_type = 'team' then
    if p_team is null or not exists (select 1 from public.teams where id = p_team and captain_id = auth.uid()) then
      raise exception 'Only the team captain can register a team';
    end if;
  end if;
  insert into public.entries (category_id, team_id, user_id, status, payment_status)
  values (c.id,
          case when c.entry_type = 'team' then p_team end,
          case when c.entry_type = 'solo' then auth.uid() end,
          case when c.entry_fee > 0 then 'pending' else 'confirmed' end,
          case when c.entry_fee > 0 then 'unpaid' else 'not_required' end)
  returning id into v_id;
  return v_id;
end $$;

-- Organiser adds walk-ins or a pasted list: [{"name": "...", "club": "..."}]. Added in order, so order = seeding.
create function public.add_entries(p_category uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  v_count int;
  v_new int;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only the organiser can add entries'; end if;
  if c.status <> 'open' then raise exception 'Entries are closed for this category'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to add'; end if;
  v_new := jsonb_array_length(p_rows);
  if v_new = 0 then raise exception 'Nothing to add'; end if;
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count + v_new > c.max_entries then
    raise exception 'Only % spots left in this category', greatest(c.max_entries - v_count, 0);
  end if;
  insert into public.entries (category_id, display_name, club, status, payment_status)
  select c.id, trim(r ->> 'name'), coalesce(trim(r ->> 'club'), ''), 'confirmed', 'not_required'
  from jsonb_array_elements(p_rows) r;
  return v_new;
end $$;

create function public.withdraw_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.entries e set status = 'withdrawn'
  where e.id = p_entry
    and (e.user_id = auth.uid() or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid()))
    and exists (select 1 from public.categories where id = e.category_id and status = 'open');
  if not found then raise exception 'You can only withdraw your own entry before the draw'; end if;
end $$;

create function public.join_referee(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.referee_links;
begin
  if auth.uid() is null then raise exception 'Log in to referee'; end if;
  select * into l from public.referee_links where token = p_token;
  if l.token is null then raise exception 'This referee link is not valid'; end if;
  insert into public.officials (event_id, user_id, role, court_id) values (l.event_id, auth.uid(), 'referee', l.court_id)
  on conflict (event_id, user_id) do update set court_id = excluded.court_id where public.officials.role = 'referee';
  return l.event_id;
end $$;

-- ---------- functions: fixtures, schedule and scoring ----------
create function public.send_to(p_category uuid, p_key text, p_side text, p_entry uuid) returns void
language sql security definer set search_path = '' as $$
  update public.matches set
    entry_a = case when p_side = 'a' then p_entry else entry_a end,
    a_bye = case when p_side = 'a' then p_entry is null else a_bye end,
    entry_b = case when p_side = 'b' then p_entry else entry_b end,
    b_bye = case when p_side = 'b' then p_entry is null else b_bye end,
    updated_at = now()
  where category_id = p_category and key = p_key
$$;

-- Resolves matches with a bye on a side, repeatedly, so byes ripple through. Mirrors advance() in TS.
create function public.settle_byes(p_category uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_win uuid;
begin
  loop
    select * into m from public.matches
    where category_id = p_category and status = 'scheduled'
      and (a_bye or b_bye)
      and (a_bye or entry_a is not null) and (b_bye or entry_b is not null)
    limit 1;
    exit when m.id is null;
    v_win := case when m.a_bye then m.entry_b else m.entry_a end; -- null when both sides are byes
    update public.matches set status = 'done', walkover = true, winner_entry = v_win, finished_at = now(), updated_at = now()
    where id = m.id;
    if m.next_key is not null then perform public.send_to(p_category, m.next_key, m.next_side, v_win); end if;
    if m.loser_next_key is not null then perform public.send_to(p_category, m.loser_next_key, m.loser_next_side, null); end if;
  end loop;
end $$;

-- Replaces a category's fixtures for the given stages with what the app's fixture engine generated.
-- p_matches: [{key, stage, group, round, slot, a, b, next:{key,side}, loserNext:{key,side}}], a/b = entry id | "BYE" | null.
create function public.save_fixtures(p_category uuid, p_matches jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  v_stages public.stage_kind[];
  v_bad int;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only the organiser can draw fixtures'; end if;
  if c.status not in ('open', 'locked', 'live') then raise exception 'This category has finished'; end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 or jsonb_array_length(p_matches) > 1000 then
    raise exception 'No fixtures to save';
  end if;
  select array_agg(distinct (m ->> 'stage')::public.stage_kind) into v_stages from jsonb_array_elements(p_matches) m;

  if exists (select 1 from public.matches where category_id = c.id and stage = any (v_stages)
             and status <> 'scheduled' and not walkover) then
    raise exception 'Matches have already started. Fixtures can no longer be redrawn';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_matches) m, lateral (values (m ->> 'a'), (m ->> 'b')) s(v)
  where s.v is not null and s.v <> 'BYE'
    and not exists (select 1 from public.entries e where e.id::text = s.v and e.category_id = c.id and e.status = 'confirmed');
  if v_bad > 0 then raise exception 'Fixtures include entries that are not confirmed in this category'; end if;

  delete from public.matches where category_id = c.id and stage = any (v_stages);
  insert into public.matches (event_id, category_id, key, stage, grp, round, slot, entry_a, entry_b, a_bye, b_bye,
                              next_key, next_side, loser_next_key, loser_next_side)
  select c.event_id, c.id, m ->> 'key', (m ->> 'stage')::public.stage_kind, nullif(m ->> 'group', ''),
         (m ->> 'round')::int, (m ->> 'slot')::int,
         nullif(m ->> 'a', 'BYE')::uuid, nullif(m ->> 'b', 'BYE')::uuid,
         coalesce(m ->> 'a' = 'BYE', false), coalesce(m ->> 'b' = 'BYE', false),
         m -> 'next' ->> 'key', m -> 'next' ->> 'side', m -> 'loserNext' ->> 'key', m -> 'loserNext' ->> 'side'
  from jsonb_array_elements(p_matches) m;

  update public.categories set status = 'live' where id = c.id;
  update public.events set status = 'live' where id = c.event_id and status = 'open';
  perform public.settle_byes(c.id);
end $$;

-- Organiser saves court and time for each match: [{"id": match, "court": court id, "at": timestamptz}].
create function public.save_schedule(p_event uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.can_manage(p_event) then raise exception 'Only the organiser can schedule matches'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
             where r ->> 'court' is not null
               and not exists (select 1 from public.courts where id = (r ->> 'court')::uuid and event_id = p_event)) then
    raise exception 'Schedule uses a court from another event';
  end if;
  update public.matches m set court_id = (r ->> 'court')::uuid, scheduled_at = (r ->> 'at')::timestamptz, updated_at = now()
  from jsonb_array_elements(p_rows) r
  where m.id = (r ->> 'id')::uuid and m.event_id = p_event and m.status <> 'done';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public.update_score(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You are not a referee for this match'; end if;
  if m.status = 'done' then raise exception 'This match has finished'; end if;
  if m.entry_a is null or m.entry_b is null then raise exception 'Both sides must be known before scoring'; end if;
  if p_a < 0 or p_b < 0 then raise exception 'Scores cannot be negative'; end if;
  update public.matches set score_a = p_a, score_b = p_b, status = 'live',
    started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_match;
end $$;

create function public.finish_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  c public.categories;
  v_win uuid; v_lose uuid;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You are not a referee for this match'; end if;
  if m.status <> 'live' or m.score_a is null or m.score_b is null then raise exception 'Enter a score before ending the match'; end if;
  if m.score_a = m.score_b and m.stage not in ('league', 'group') then
    raise exception 'Knockout matches need a winner. Play the tiebreak, then add it to the score';
  end if;

  v_win := case when m.score_a > m.score_b then m.entry_a when m.score_b > m.score_a then m.entry_b end;
  v_lose := case when v_win = m.entry_a then m.entry_b when v_win = m.entry_b then m.entry_a end;
  update public.matches set status = 'done', winner_entry = v_win, finished_at = now(), updated_at = now() where id = m.id;
  if v_win is not null and m.next_key is not null then perform public.send_to(m.category_id, m.next_key, m.next_side, v_win); end if;
  if v_lose is not null and m.loser_next_key is not null then
    perform public.send_to(m.category_id, m.loser_next_key, m.loser_next_side, v_lose);
  end if;
  perform public.settle_byes(m.category_id);

  select * into c from public.categories where id = m.category_id;
  if not exists (select 1 from public.matches where category_id = c.id and status <> 'done')
     and (c.format <> 'groups_knockout' or exists (select 1 from public.matches where category_id = c.id and stage = 'knockout')) then
    update public.categories set status = 'completed' where id = c.id;
    if not exists (select 1 from public.categories where event_id = c.event_id and status <> 'completed') then
      update public.events set status = 'completed' where id = c.event_id;
    end if;
  end if;
end $$;

-- ---------- function permissions ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.can_manage(uuid), public.is_visible(uuid), public.category_event(uuid),
  public.can_score_match(uuid) to anon, authenticated;
grant execute on function public.my_team_invite(uuid), public.join_team(text), public.register_entry(uuid, uuid),
  public.add_entries(uuid, jsonb), public.withdraw_entry(uuid), public.join_referee(text), public.save_fixtures(uuid, jsonb),
  public.save_schedule(uuid, jsonb), public.update_score(uuid, int, int), public.finish_match(uuid) to authenticated;

alter publication supabase_realtime add table public.matches;
