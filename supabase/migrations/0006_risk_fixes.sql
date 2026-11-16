-- SportsHunt v2, migration 6: risk fixes.
--   * registration creates the team inside the same transaction (no orphan teams)
--   * publish_event creates an event with its categories, courts and referee links in one transaction
--   * referee links expire (14 days by default) and can be rotated; join_referee refuses expired or revoked links
-- New functions get execute revoked from public/anon explicitly: Supabase grants execute on new functions by default.

-- ---------- registration: team created in the same transaction ----------
drop function if exists public.register_entry(uuid, uuid, text, date, date, text[]);
create function public.register_entry(
  p_category uuid, p_team uuid default null, p_partner text default null,
  p_dob date default null, p_partner_dob date default null, p_roster text[] default '{}', p_team_name text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  e public.events;
  v_count int;
  v_id uuid;
  v_team uuid := p_team;
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
  if coalesce(array_length(p_roster, 1), 0) > 30 then raise exception 'A roster has at most 30 players'; end if;

  if c.entry_type = 'team' then
    if v_team is null and p_team_name is not null then
      if length(trim(p_team_name)) not between 2 and 60 then raise exception 'Team names are 2 to 60 characters'; end if;
      insert into public.teams (name, captain_id) values (trim(p_team_name), auth.uid()) returning id into v_team;
    end if;
    if v_team is null or not exists (select 1 from public.teams where id = v_team and captain_id = auth.uid()) then
      raise exception 'Only the team captain can register a team';
    end if;
  end if;

  insert into public.entries (category_id, team_id, user_id, partner_name, dob, partner_dob, roster, status, payment_status)
  values (c.id,
          case when c.entry_type = 'team' then v_team end,
          case when c.entry_type <> 'team' then auth.uid() end,
          case when c.entry_type = 'pair' then trim(p_partner) end,
          p_dob, p_partner_dob,
          case when c.entry_type = 'team' then coalesce(p_roster, '{}') else '{}' end,
          case when c.entry_fee > 0 then 'pending' else 'confirmed' end,
          case when c.entry_fee > 0 then 'unpaid' else 'not_required' end)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.register_entry(uuid, uuid, text, date, date, text[], text) from public, anon;
grant execute on function public.register_entry(uuid, uuid, text, date, date, text[], text) to authenticated;

-- ---------- publishing: one transaction ----------
-- p_event: {slug, title, sport, venue, area, prize, rules[], starts_at, reg_closes_at, match_minutes, break_minutes, age_check}
-- p_categories: [{name, format, group_count, entry_type, team_size, max_entries, entry_fee, scoring, best_of, points_to,
--                 points_cap, born_on_or_after, born_on_or_before}]
-- Table checks still apply; any failure rolls the whole event back.
create or replace function public.publish_event(p_event jsonb, p_categories jsonb, p_courts int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  c jsonb;
  i int := 0;
begin
  if auth.uid() is null then raise exception 'Log in to publish a tournament'; end if;
  if coalesce((select banned from public.profiles where id = auth.uid()), true) then raise exception 'This account cannot publish tournaments'; end if;
  if p_courts is null or p_courts not between 1 and 40 then raise exception 'Use between 1 and 40 courts'; end if;
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) not between 1 and 30 then
    raise exception 'Add between 1 and 30 categories';
  end if;
  if (p_event ->> 'reg_closes_at')::timestamptz < now() then raise exception 'Entries must close in the future'; end if;

  insert into public.events (slug, organiser_id, title, sport, venue, area, prize, rules, starts_at, reg_closes_at,
                             match_minutes, break_minutes, age_check, status)
  values (p_event ->> 'slug', auth.uid(), p_event ->> 'title', (p_event ->> 'sport')::public.sport, p_event ->> 'venue',
          coalesce(p_event ->> 'area', ''), coalesce(p_event ->> 'prize', ''),
          array(select jsonb_array_elements_text(coalesce(p_event -> 'rules', '[]'::jsonb))),
          (p_event ->> 'starts_at')::timestamptz, (p_event ->> 'reg_closes_at')::timestamptz,
          coalesce((p_event ->> 'match_minutes')::int, 30), coalesce((p_event ->> 'break_minutes')::int, 5),
          coalesce(p_event ->> 'age_check', 'self'), 'open')
  returning id into v_id;

  for c in select value from jsonb_array_elements(p_categories) loop
    insert into public.categories (event_id, name, format, group_count, entry_type, team_size, max_entries, entry_fee, sort,
                                   scoring, best_of, points_to, points_cap, born_on_or_after, born_on_or_before)
    values (v_id, c ->> 'name', (c ->> 'format')::public.t_format, (c ->> 'group_count')::int, c ->> 'entry_type',
            coalesce((c ->> 'team_size')::int, 1), (c ->> 'max_entries')::int, coalesce((c ->> 'entry_fee')::int, 0), i,
            coalesce(c ->> 'scoring', 'games'), coalesce((c ->> 'best_of')::int, 3), coalesce((c ->> 'points_to')::int, 21),
            (c ->> 'points_cap')::int, (c ->> 'born_on_or_after')::date, (c ->> 'born_on_or_before')::date);
    i := i + 1;
  end loop;

  insert into public.courts (event_id, name, sort) select v_id, 'Court ' || n, n - 1 from generate_series(1, p_courts) n;
  insert into public.referee_links (event_id, court_id) values (v_id, null);
  insert into public.referee_links (event_id, court_id) select v_id, id from public.courts where event_id = v_id;
  return jsonb_build_object('id', v_id, 'slug', p_event ->> 'slug');
end $$;
revoke execute on function public.publish_event(jsonb, jsonb, int) from public, anon;
grant execute on function public.publish_event(jsonb, jsonb, int) to authenticated;

-- ---------- referee links: expiry and rotation ----------
alter table public.referee_links
  add column if not exists expires_at timestamptz not null default now() + interval '14 days',
  add column if not exists revoked_at timestamptz;

create or replace function public.join_referee(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.referee_links;
begin
  if auth.uid() is null then raise exception 'Log in to referee'; end if;
  select * into l from public.referee_links where token = p_token;
  if l.token is null then raise exception 'This referee link is not valid'; end if;
  if l.revoked_at is not null or l.expires_at <= now() then
    raise exception 'This referee link has expired. Ask the organiser for a new one';
  end if;
  insert into public.officials (event_id, user_id, role, court_id) values (l.event_id, auth.uid(), 'referee', l.court_id)
  on conflict (event_id, user_id) do update set court_id = excluded.court_id where public.officials.role = 'referee';
  return l.event_id;
end $$;

-- Revokes a link and returns a fresh one for the same court. Referees who already joined keep scoring.
create or replace function public.rotate_referee_link(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  l public.referee_links;
  v_new text;
begin
  select * into l from public.referee_links where token = p_token for update;
  if l.token is null or not public.can_manage(l.event_id) then raise exception 'Only the organiser can change referee links'; end if;
  update public.referee_links set revoked_at = now() where token = p_token and revoked_at is null;
  insert into public.referee_links (event_id, court_id) values (l.event_id, l.court_id) returning token into v_new;
  return v_new;
end $$;
revoke execute on function public.rotate_referee_link(text) from public, anon;
grant execute on function public.rotate_referee_link(text) to authenticated;
