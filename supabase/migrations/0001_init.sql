-- SportsHunt v2: tournaments schema, row level security and match logic.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- All writes to entries and matches go through the functions at the bottom, so the rules live in one place.

-- ---------- types ----------
create type public.sport as enum (
  'badminton', 'basketball', 'box_cricket', 'cricket', 'football',
  'futsal', 'pickleball', 'table_tennis', 'tennis', 'volleyball'
);
create type public.t_format as enum ('knockout', 'league', 'groups_knockout', 'double_elim');
create type public.t_status as enum ('draft', 'open', 'locked', 'live', 'completed', 'cancelled');
create type public.stage_kind as enum ('league', 'group', 'knockout', 'winners', 'losers', 'grand_final');
create type public.match_status as enum ('scheduled', 'live', 'done');

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 80),
  avatar_url text,
  city text not null default 'Bangalore',
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 90),
  organiser_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(trim(title)) between 4 and 120),
  sport public.sport not null,
  format public.t_format not null,
  group_count int check (group_count between 2 and 8),
  entry_type text not null check (entry_type in ('team', 'solo')),
  team_size int not null default 1 check (team_size between 1 and 30),
  max_entries int not null check (max_entries between 2 and 128),
  venue text not null check (length(trim(venue)) between 1 and 120),
  area text not null default '' check (length(area) <= 120),
  starts_at timestamptz not null,
  reg_closes_at timestamptz not null,
  entry_fee int not null default 0 check (entry_fee between 0 and 1000000),
  prize text not null default '' check (length(prize) <= 120),
  rules text[] not null default '{}',
  status public.t_status not null default 'draft',
  created_at timestamptz not null default now(),
  check (reg_closes_at <= starts_at),
  check ((format = 'groups_knockout') = (group_count is not null))
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  captain_id uuid not null default auth.uid() references public.profiles (id),
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid references public.teams (id),
  user_id uuid references public.profiles (id),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'withdrawn')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'unpaid', 'paid', 'refunded')),
  seed int,
  created_at timestamptz not null default now(),
  check ((team_id is null) <> (user_id is null)),
  unique (tournament_id, team_id),
  unique (tournament_id, user_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
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
  scheduled_at timestamptz,
  court text,
  updated_at timestamptz not null default now(),
  unique (tournament_id, key)
);
create index matches_tournament on public.matches (tournament_id);

create table public.officials (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('referee', 'co_organiser')),
  primary key (tournament_id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id),
  reason text not null check (length(trim(reason)) between 5 and 1000),
  created_at timestamptz not null default now()
);

-- Display names for entries (team name or player name), readable by everyone who can see the entry.
create view public.entry_names with (security_invoker = true) as
select e.id, e.tournament_id, e.status, e.seed, e.created_at, coalesce(t.name, p.name) as name
from public.entries e
left join public.teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id;

-- ---------- new users get a profile ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Captains are members of their own team.
create function public.add_captain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_members (team_id, user_id) values (new.id, new.captain_id);
  return new;
end $$;
create trigger on_team_created after insert on public.teams
for each row execute function public.add_captain();

-- ---------- permission helpers ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.can_manage(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
    or exists (select 1 from public.tournaments where id = t and organiser_id = auth.uid())
    or exists (select 1 from public.officials where tournament_id = t and user_id = auth.uid() and role = 'co_organiser')
$$;

create function public.can_score(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_manage(t)
    or exists (select 1 from public.officials where tournament_id = t and user_id = auth.uid() and role = 'referee')
$$;

create function public.is_visible(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments where id = t and status <> 'draft') or public.can_manage(t)
$$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.entries enable row level security;
alter table public.matches enable row level security;
alter table public.officials enable row level security;
alter table public.reports enable row level security;

-- Profiles: names are public; users edit only their own name/avatar/city (never is_admin or banned).
create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name, avatar_url, city) on public.profiles to authenticated;

-- Tournaments: public once published; organisers and co-organisers manage.
create policy "published tournaments are public" on public.tournaments for select
  using (status <> 'draft' or public.can_manage(id));
create policy "signed-in users create tournaments" on public.tournaments for insert to authenticated
  with check (
    organiser_id = auth.uid() and status in ('draft', 'open')
    and not coalesce((select banned from public.profiles where id = auth.uid()), true)
  );
create policy "managers edit tournaments" on public.tournaments for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));
create policy "organisers delete drafts" on public.tournaments for delete to authenticated
  using (organiser_id = auth.uid() and status = 'draft');

-- Teams: names public; invite tokens hidden from everyone but the captain (see my_team_invite()).
create policy "teams are public" on public.teams for select using (true);
create policy "create own team" on public.teams for insert to authenticated with check (captain_id = auth.uid());
create policy "captain renames team" on public.teams for update to authenticated
  using (captain_id = auth.uid()) with check (captain_id = auth.uid());
revoke select on public.teams from anon, authenticated;
grant select (id, name, captain_id, created_at) on public.teams to anon, authenticated;

create policy "rosters are public" on public.team_members for select using (true);
create policy "captain removes or member leaves" on public.team_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.teams where id = team_id and captain_id = auth.uid()));

-- Entries, matches: readable when the tournament is; written only through functions below.
create policy "entries follow tournament" on public.entries for select using (public.is_visible(tournament_id));
create policy "managers approve entries" on public.entries for update to authenticated
  using (public.can_manage(tournament_id)) with check (public.can_manage(tournament_id));
create policy "matches follow tournament" on public.matches for select using (public.is_visible(tournament_id));

create policy "officials are public" on public.officials for select using (public.is_visible(tournament_id));
create policy "managers add officials" on public.officials for insert to authenticated with check (public.can_manage(tournament_id));
create policy "managers remove officials" on public.officials for delete to authenticated using (public.can_manage(tournament_id));

create policy "anyone signed in can report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "admins read reports" on public.reports for select to authenticated using (public.is_admin());

-- ---------- functions: teams and registration ----------
create function public.my_team_invite(p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select invite_token from public.teams where id = p_team and captain_id = auth.uid()
$$;

create function public.join_team(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  if auth.uid() is null then raise exception 'Log in to join a team'; end if;
  select id into v_team from public.teams where invite_token = p_token;
  if v_team is null then raise exception 'This invite link is not valid'; end if;
  insert into public.team_members (team_id, user_id) values (v_team, auth.uid()) on conflict do nothing;
  return v_team;
end $$;

create function public.register_entry(p_tournament uuid, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  v_count int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Log in to register'; end if;
  if (select banned from public.profiles where id = auth.uid()) then raise exception 'This account cannot register'; end if;
  -- lock the tournament row so two last-minute entries can't both take the final spot
  select * into t from public.tournaments where id = p_tournament for update;
  if t.id is null or t.status <> 'open' then raise exception 'Registration is closed'; end if;
  if now() > t.reg_closes_at then raise exception 'Registration has closed'; end if;
  select count(*) into v_count from public.entries where tournament_id = t.id and status <> 'withdrawn';
  if v_count >= t.max_entries then raise exception 'This tournament is full'; end if;

  if t.entry_type = 'team' then
    if p_team is null or not exists (select 1 from public.teams where id = p_team and captain_id = auth.uid()) then
      raise exception 'Only the team captain can register a team';
    end if;
    insert into public.entries (tournament_id, team_id, status, payment_status)
    values (t.id, p_team, case when t.entry_fee > 0 then 'pending' else 'confirmed' end,
            case when t.entry_fee > 0 then 'unpaid' else 'not_required' end)
    returning id into v_id;
  else
    insert into public.entries (tournament_id, user_id, status, payment_status)
    values (t.id, auth.uid(), case when t.entry_fee > 0 then 'pending' else 'confirmed' end,
            case when t.entry_fee > 0 then 'unpaid' else 'not_required' end)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.withdraw_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.entries e set status = 'withdrawn'
  where e.id = p_entry
    and (e.user_id = auth.uid() or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid()))
    and exists (select 1 from public.tournaments where id = e.tournament_id and status = 'open');
  if not found then raise exception 'You can only withdraw your own entry before the draw'; end if;
end $$;

-- ---------- functions: fixtures and scoring ----------
-- Puts a winner into the next match's side. A null entry means a bye travels on.
create function public.send_to(p_t uuid, p_key text, p_side text, p_entry uuid) returns void
language sql security definer set search_path = '' as $$
  update public.matches set
    entry_a = case when p_side = 'a' then p_entry else entry_a end,
    a_bye = case when p_side = 'a' then p_entry is null else a_bye end,
    entry_b = case when p_side = 'b' then p_entry else entry_b end,
    b_bye = case when p_side = 'b' then p_entry is null else b_bye end,
    updated_at = now()
  where tournament_id = p_t and key = p_key
$$;

-- Resolves every match that has a bye on a side, repeatedly, so byes ripple through brackets.
-- Mirrors advance() in src/lib/fixtures/advance.ts.
create function public.settle_byes(p_t uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches; v_win uuid;
begin
  loop
    select * into m from public.matches
    where tournament_id = p_t and status = 'scheduled'
      and (a_bye or b_bye)
      and (a_bye or entry_a is not null) and (b_bye or entry_b is not null)
    limit 1;
    exit when m.id is null;
    v_win := case when m.a_bye then m.entry_b else m.entry_a end; -- null when both sides are byes
    update public.matches set status = 'done', walkover = true, winner_entry = v_win, updated_at = now() where id = m.id;
    if m.next_key is not null then perform public.send_to(p_t, m.next_key, m.next_side, v_win); end if;
    -- the loser of a bye match is nobody, so a bye drops into the losers bracket
    if m.loser_next_key is not null then perform public.send_to(p_t, m.loser_next_key, m.loser_next_side, null); end if;
  end loop;
end $$;

-- Replaces the fixtures for the given stages with what the app's fixture engine generated.
-- p_matches: [{key, stage, group, round, slot, a, b, next:{key,side}, loserNext:{key,side}}], a/b = entry id | "BYE" | null.
create function public.save_fixtures(p_tournament uuid, p_matches jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_stages public.stage_kind[];
  v_bad int;
begin
  if not public.can_manage(p_tournament) then raise exception 'Only the organiser can draw fixtures'; end if;
  if (select status from public.tournaments where id = p_tournament) not in ('open', 'locked', 'live') then
    raise exception 'Fixtures can only be drawn for an open or running tournament';
  end if;
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 or jsonb_array_length(p_matches) > 1000 then
    raise exception 'No fixtures to save';
  end if;
  select array_agg(distinct (m ->> 'stage')::public.stage_kind) into v_stages from jsonb_array_elements(p_matches) m;

  if exists (select 1 from public.matches where tournament_id = p_tournament and stage = any (v_stages)
             and status <> 'scheduled' and not walkover) then
    raise exception 'Matches have already started. Fixtures can no longer be redrawn';
  end if;

  -- every named side must be a confirmed entry of this tournament
  select count(*) into v_bad
  from jsonb_array_elements(p_matches) m, lateral (values (m ->> 'a'), (m ->> 'b')) s(v)
  where s.v is not null and s.v <> 'BYE'
    and not exists (select 1 from public.entries e where e.id::text = s.v and e.tournament_id = p_tournament and e.status = 'confirmed');
  if v_bad > 0 then raise exception 'Fixtures include entries that are not confirmed in this tournament'; end if;

  delete from public.matches where tournament_id = p_tournament and stage = any (v_stages);
  insert into public.matches (tournament_id, key, stage, grp, round, slot, entry_a, entry_b, a_bye, b_bye,
                              next_key, next_side, loser_next_key, loser_next_side)
  select p_tournament, m ->> 'key', (m ->> 'stage')::public.stage_kind, nullif(m ->> 'group', ''),
         (m ->> 'round')::int, (m ->> 'slot')::int,
         nullif(m ->> 'a', 'BYE')::uuid, nullif(m ->> 'b', 'BYE')::uuid,
         coalesce(m ->> 'a' = 'BYE', false), coalesce(m ->> 'b' = 'BYE', false),
         m -> 'next' ->> 'key', m -> 'next' ->> 'side', m -> 'loserNext' ->> 'key', m -> 'loserNext' ->> 'side'
  from jsonb_array_elements(p_matches) m;

  update public.tournaments set status = 'live' where id = p_tournament;
  perform public.settle_byes(p_tournament);
end $$;

-- Referee updates a running score. Starts the match if needed.
create function public.update_score(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score(m.tournament_id) then raise exception 'You are not a referee for this match'; end if;
  if m.status = 'done' then raise exception 'This match has finished'; end if;
  if m.entry_a is null or m.entry_b is null then raise exception 'Both sides must be known before scoring'; end if;
  if p_a < 0 or p_b < 0 then raise exception 'Scores cannot be negative'; end if;
  update public.matches set score_a = p_a, score_b = p_b, status = 'live', updated_at = now() where id = p_match;
end $$;

-- Referee ends a match: winner and loser move on, byes settle, tournament completes when nothing is left.
create function public.finish_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  t public.tournaments;
  v_win uuid; v_lose uuid;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score(m.tournament_id) then raise exception 'You are not a referee for this match'; end if;
  if m.status <> 'live' or m.score_a is null or m.score_b is null then raise exception 'Enter a score before ending the match'; end if;
  if m.score_a = m.score_b and m.stage not in ('league', 'group') then
    raise exception 'Knockout matches need a winner. Play the tiebreak, then add it to the score';
  end if;

  v_win := case when m.score_a > m.score_b then m.entry_a when m.score_b > m.score_a then m.entry_b end;
  v_lose := case when v_win = m.entry_a then m.entry_b when v_win = m.entry_b then m.entry_a end;
  update public.matches set status = 'done', winner_entry = v_win, updated_at = now() where id = m.id;
  if v_win is not null and m.next_key is not null then perform public.send_to(m.tournament_id, m.next_key, m.next_side, v_win); end if;
  if v_lose is not null and m.loser_next_key is not null then
    perform public.send_to(m.tournament_id, m.loser_next_key, m.loser_next_side, v_lose);
  end if;
  perform public.settle_byes(m.tournament_id);

  select * into t from public.tournaments where id = m.tournament_id;
  if not exists (select 1 from public.matches where tournament_id = t.id and status <> 'done')
     and (t.format <> 'groups_knockout' or exists (select 1 from public.matches where tournament_id = t.id and stage = 'knockout')) then
    update public.tournaments set status = 'completed' where id = t.id;
  end if;
end $$;

-- Functions are callable only by signed-in users; internal helpers not at all.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.can_manage(uuid), public.can_score(uuid), public.is_visible(uuid)
  to anon, authenticated;
grant execute on function public.my_team_invite(uuid), public.join_team(text), public.register_entry(uuid, uuid),
  public.withdraw_entry(uuid), public.save_fixtures(uuid, jsonb), public.update_score(uuid, int, int),
  public.finish_match(uuid) to authenticated;

-- Live scores: the app subscribes to changes on matches.
alter publication supabase_realtime add table public.matches;
