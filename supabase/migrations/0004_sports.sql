-- SportsHunt v2, migration 4: sport scoring rules, age limits, doubles by one player, match-day desk.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Keeps existing data.

-- ---------- categories: pairs, scoring, age limits ----------
alter table public.categories drop constraint if exists categories_entry_type_check;
update public.categories set entry_type = 'pair' where entry_type = 'team' and team_size = 2;
alter table public.categories add constraint categories_entry_type_check check (entry_type in ('solo', 'pair', 'team'));

alter table public.categories
  add column if not exists scoring text not null default 'games' check (scoring in ('games', 'goals')),
  add column if not exists best_of int not null default 3 check (best_of in (1, 3, 5)),
  add column if not exists points_to int not null default 21 check (points_to between 5 and 50),
  add column if not exists points_cap int check (points_cap is null or points_cap between 5 and 60),
  add column if not exists born_on_or_after date,   -- "Under N": players born on or after this date
  add column if not exists born_on_or_before date;  -- "N and over": players born on or before this date

-- How the organiser checks ages: players declare a date of birth, or staff check ID at the desk.
alter table public.events add column if not exists age_check text not null default 'self' check (age_check in ('self', 'desk'));

-- ---------- entries: partner, roster, date of birth, check-in ----------
alter table public.entries
  add column if not exists partner_name text check (partner_name is null or length(trim(partner_name)) between 1 and 80),
  add column if not exists roster text[] not null default '{}',
  add column if not exists dob date,
  add column if not exists partner_dob date,
  add column if not exists checked_in_at timestamptz,
  add column if not exists id_checked boolean not null default false;

drop view if exists public.entry_names;
create view public.entry_names with (security_invoker = true) as
select e.id, e.category_id, e.status, e.payment_status, e.seed, e.club, e.created_at, e.checked_in_at, e.id_checked,
       e.roster, coalesce(e.display_name, t.name, p.name) || coalesce(' / ' || e.partner_name, '') as name
from public.entries e
left join public.teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id;

-- ---------- matches: game scores and penalties ----------
alter table public.matches
  add column if not exists games jsonb not null default '[]',
  add column if not exists pen_a int check (pen_a >= 0),
  add column if not exists pen_b int check (pen_b >= 0);

-- ---------- scoring rules (mirrored in src/lib/fixtures/scoring.ts) ----------
-- A finished game: winner reached points_to with a 2-point lead, or reached the cap.
create or replace function public.game_over(a int, b int, to_ int, cap int) returns boolean
language sql immutable set search_path = '' as $$
  select a >= 0 and b >= 0 and (
    (greatest(a, b) = to_ and least(a, b) <= to_ - 2)
    or (least(a, b) >= to_ - 1 and greatest(a, b) - least(a, b) = 2 and (cap is null or greatest(a, b) <= cap))
    or (cap is not null and greatest(a, b) = cap and least(a, b) = cap - 1)
  )
$$;

-- A game still being played: nobody has won it yet and the score could really happen.
create or replace function public.game_open(a int, b int, to_ int, cap int) returns boolean
language sql immutable set search_path = '' as $$
  select a >= 0 and b >= 0 and not public.game_over(a, b, to_, cap)
    and (cap is null or greatest(a, b) < cap)
    and (greatest(a, b) < to_ or abs(a - b) < 2)
$$;

-- ---------- registration with partner, roster and age check ----------
drop function if exists public.register_entry(uuid, uuid);
create function public.register_entry(
  p_category uuid, p_team uuid default null, p_partner text default null,
  p_dob date default null, p_partner_dob date default null, p_roster text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  e public.events;
  v_count int;
  v_id uuid;
  v_aged boolean;
begin
  if auth.uid() is null then raise exception 'Log in to register'; end if;
  if (select banned from public.profiles where id = auth.uid()) then raise exception 'This account cannot register'; end if;
  select * into c from public.categories where id = p_category for update;
  select * into e from public.events where id = c.event_id;
  if c.id is null or e.status not in ('open', 'live') or c.status <> 'open' then raise exception 'Registration is closed'; end if;
  if now() > e.reg_closes_at then raise exception 'Registration has closed'; end if;
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count >= c.max_entries then raise exception 'This category is full'; end if;

  -- Age: players in an age-limited solo or pair category declare their date of birth.
  v_aged := c.born_on_or_after is not null or c.born_on_or_before is not null;
  if v_aged and c.entry_type <> 'team' then
    if p_dob is null or (c.entry_type = 'pair' and p_partner_dob is null) then
      raise exception 'This category has an age limit. Enter date of birth';
    end if;
    if (c.born_on_or_after is not null and (p_dob < c.born_on_or_after or coalesce(p_partner_dob, p_dob) < c.born_on_or_after))
       or (c.born_on_or_before is not null and (p_dob > c.born_on_or_before or coalesce(p_partner_dob, p_dob) > c.born_on_or_before)) then
      raise exception 'Not eligible: this category''s age limit doesn''t fit that date of birth';
    end if;
  end if;

  if c.entry_type = 'pair' and (p_partner is null or length(trim(p_partner)) not between 1 and 80) then
    raise exception 'Enter your partner''s name';
  end if;
  if c.entry_type = 'team' and (p_team is null or not exists (select 1 from public.teams where id = p_team and captain_id = auth.uid())) then
    raise exception 'Only the team captain can register a team';
  end if;
  if coalesce(array_length(p_roster, 1), 0) > 30 then raise exception 'A roster has at most 30 players'; end if;

  insert into public.entries (category_id, team_id, user_id, partner_name, dob, partner_dob, roster, status, payment_status)
  values (c.id,
          case when c.entry_type = 'team' then p_team end,
          case when c.entry_type <> 'team' then auth.uid() end,
          case when c.entry_type = 'pair' then trim(p_partner) end,
          p_dob, p_partner_dob,
          case when c.entry_type = 'team' then coalesce(p_roster, '{}') else '{}' end,
          case when c.entry_fee > 0 then 'pending' else 'confirmed' end,
          case when c.entry_fee > 0 then 'unpaid' else 'not_required' end)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- match-day desk ----------
create or replace function public.check_in(p_entry uuid, p_present boolean, p_id_checked boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage(public.category_event((select category_id from public.entries where id = p_entry))) then
    raise exception 'Only the organiser''s desk can check players in';
  end if;
  update public.entries set checked_in_at = case when p_present then coalesce(checked_in_at, now()) end,
    id_checked = p_present and p_id_checked
  where id = p_entry;
end $$;

-- ---------- scoring ----------
-- Moves a finished match's winner and loser on, settles byes, completes the category and event. Internal.
create or replace function public.complete_match(p_match uuid, p_win uuid, p_walkover boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  c public.categories;
  v_lose uuid;
begin
  select * into m from public.matches where id = p_match;
  v_lose := case when p_win = m.entry_a then m.entry_b when p_win = m.entry_b then m.entry_a end;
  update public.matches set status = 'done', winner_entry = p_win, walkover = p_walkover,
    finished_at = now(), updated_at = now() where id = m.id;
  if p_win is not null and m.next_key is not null then perform public.send_to(m.category_id, m.next_key, m.next_side, p_win); end if;
  if v_lose is not null and m.loser_next_key is not null then perform public.send_to(m.category_id, m.loser_next_key, m.loser_next_side, v_lose); end if;
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

-- Referee saves the game scores so far: [[21,19],[18,21],[5,3]]. The last game may still be in play.
create or replace function public.update_games(p_match uuid, p_games jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  c public.categories;
  g jsonb;
  i int := 0;
  n int;
  a int; b int;
  won_a int := 0; won_b int := 0;
  need int;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You are not a referee for this match'; end if;
  select * into c from public.categories where id = m.category_id;
  if c.scoring <> 'games' then raise exception 'This category is scored in goals'; end if;
  if m.status = 'done' then raise exception 'This match has finished'; end if;
  if m.entry_a is null or m.entry_b is null then raise exception 'Both sides must be known before scoring'; end if;
  if jsonb_typeof(p_games) <> 'array' then raise exception 'Scores must be a list of games'; end if;
  n := jsonb_array_length(p_games);
  if n > c.best_of then raise exception 'Best of % games', c.best_of; end if;
  need := c.best_of / 2 + 1;

  for g in select value from jsonb_array_elements(p_games) loop
    i := i + 1;
    if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) <> 2 then raise exception 'Game % is not a score', i; end if;
    a := (g ->> 0)::int; b := (g ->> 1)::int;
    if won_a >= need or won_b >= need then raise exception 'The match was already won before game %', i; end if;
    if public.game_over(a, b, c.points_to, c.points_cap) then
      if a > b then won_a := won_a + 1; else won_b := won_b + 1; end if;
    elsif i < n or not public.game_open(a, b, c.points_to, c.points_cap) then
      raise exception 'Game % score %-% isn''t possible in games to %', i, a, b, c.points_to;
    end if;
  end loop;

  update public.matches set games = p_games, score_a = won_a, score_b = won_b, status = 'live',
    started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_match;
end $$;

-- Football: goals, plus penalties when a knockout ends level.
drop function if exists public.update_score(uuid, int, int);
create function public.update_score(p_match uuid, p_a int, p_b int, p_pen_a int default null, p_pen_b int default null) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You are not a referee for this match'; end if;
  if (select scoring from public.categories where id = m.category_id) <> 'goals' then raise exception 'This category is scored game by game'; end if;
  if m.status = 'done' then raise exception 'This match has finished'; end if;
  if m.entry_a is null or m.entry_b is null then raise exception 'Both sides must be known before scoring'; end if;
  if p_a < 0 or p_b < 0 or p_pen_a < 0 or p_pen_b < 0 then raise exception 'Scores cannot be negative'; end if;
  update public.matches set score_a = p_a, score_b = p_b, pen_a = p_pen_a, pen_b = p_pen_b, status = 'live',
    started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_match;
end $$;

create or replace function public.finish_match(p_match uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  c public.categories;
  v_win uuid;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You are not a referee for this match'; end if;
  if m.status <> 'live' or m.score_a is null or m.score_b is null then raise exception 'Enter a score before ending the match'; end if;
  select * into c from public.categories where id = m.category_id;

  if c.scoring = 'games' then
    if greatest(m.score_a, m.score_b) < c.best_of / 2 + 1 then
      raise exception 'Nobody has won % games yet', c.best_of / 2 + 1;
    end if;
    v_win := case when m.score_a > m.score_b then m.entry_a else m.entry_b end;
  else
    v_win := case when m.score_a > m.score_b then m.entry_a when m.score_b > m.score_a then m.entry_b
                  when m.pen_a > m.pen_b then m.entry_a when m.pen_b > m.pen_a then m.entry_b end;
    if v_win is null and m.stage not in ('league', 'group') then
      raise exception 'Knockout matches need a winner. Enter the penalty shoot-out score';
    end if;
  end if;
  perform public.complete_match(m.id, v_win, false);
end $$;

-- Desk or referee awards the match when one side doesn't turn up.
create or replace function public.award_walkover(p_match uuid, p_winner text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_score_match(p_match) then raise exception 'You can''t change this match'; end if;
  if m.status = 'done' then raise exception 'This match has finished'; end if;
  if m.entry_a is null or m.entry_b is null then raise exception 'Both sides must be known'; end if;
  if p_winner not in ('a', 'b') then raise exception 'Pick who gets the walkover'; end if;
  perform public.complete_match(m.id, case when p_winner = 'a' then m.entry_a else m.entry_b end, true);
end $$;

-- ---------- permissions ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.can_manage(uuid), public.is_visible(uuid), public.category_event(uuid),
  public.can_score_match(uuid), public.poster_event(text), public.game_over(int, int, int, int), public.game_open(int, int, int, int)
  to anon, authenticated;
grant execute on function public.my_team_invite(uuid), public.join_team(text),
  public.register_entry(uuid, uuid, text, date, date, text[]), public.add_entries(uuid, jsonb), public.withdraw_entry(uuid),
  public.join_referee(text), public.save_fixtures(uuid, jsonb), public.save_schedule(uuid, jsonb), public.check_in(uuid, boolean, boolean),
  public.update_games(uuid, jsonb), public.update_score(uuid, int, int, int, int), public.finish_match(uuid),
  public.award_walkover(uuid, text) to authenticated;
