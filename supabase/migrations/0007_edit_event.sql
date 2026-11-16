-- SportsHunt v2, migration 7: edit an event after publishing (P0.2).
-- Managers change details through update_event, courts through add_court / rename_court, and category or event
-- status through set_category_status / close_all_entries / cancel_event. Direct updates are narrowed so that sport,
-- format and other draw-shaping settings can't change underneath fixtures, and status only moves through these rules.

-- ---------- narrower direct access ----------
revoke update on public.events from anon, authenticated;
grant update (poster_url) on public.events to authenticated;          -- the browser saves the uploaded poster's URL
revoke insert, update, delete on public.categories from anon, authenticated;

-- ---------- event details ----------
-- p: any of {title, venue, area, prize, rules[], starts_at, reg_closes_at, match_minutes, break_minutes, age_check}.
-- Missing keys keep their value. Table checks (lengths, reg_closes_at <= starts_at, minutes ranges) still apply.
create or replace function public.update_event(p_event uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.can_manage(e.id) then raise exception 'Only this event''s organisers can edit it'; end if;
  if e.status in ('completed', 'cancelled') then raise exception 'This tournament is %, so it can''t be edited', e.status; end if;
  if p ? 'rules' and (jsonb_typeof(p -> 'rules') <> 'array' or jsonb_array_length(p -> 'rules') > 30) then
    raise exception 'Rules are a list of at most 30 lines';
  end if;

  update public.events set
    title = coalesce(trim(p ->> 'title'), title),
    venue = coalesce(trim(p ->> 'venue'), venue),
    area = coalesce(trim(p ->> 'area'), area),
    prize = coalesce(trim(p ->> 'prize'), prize),
    rules = case when p ? 'rules' then array(select left(trim(r), 300) from jsonb_array_elements_text(p -> 'rules') r where trim(r) <> '') else rules end,
    starts_at = coalesce((p ->> 'starts_at')::timestamptz, starts_at),
    reg_closes_at = coalesce((p ->> 'reg_closes_at')::timestamptz, reg_closes_at),
    match_minutes = coalesce((p ->> 'match_minutes')::int, match_minutes),
    break_minutes = coalesce((p ->> 'break_minutes')::int, break_minutes),
    age_check = coalesce(p ->> 'age_check', age_check)
  where id = e.id;
end $$;

-- ---------- courts ----------
create or replace function public.add_court(p_event uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_id uuid;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.can_manage(e.id) then raise exception 'Only this event''s organisers can add courts'; end if;
  if e.status in ('completed', 'cancelled') then raise exception 'This tournament is %, so courts can''t change', e.status; end if;
  if exists (select 1 from public.courts where event_id = e.id and lower(name) = lower(trim(p_name))) then
    raise exception 'There''s already a court called %', trim(p_name);
  end if;
  insert into public.courts (event_id, name, sort)
  values (e.id, trim(p_name), coalesce((select max(sort) + 1 from public.courts where event_id = e.id), 0))
  returning id into v_id;
  insert into public.referee_links (event_id, court_id) values (e.id, v_id); -- every court gets its own referee link
  return v_id;
end $$;

create or replace function public.rename_court(p_court uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courts;
begin
  select * into c from public.courts where id = p_court;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only this event''s organisers can rename courts'; end if;
  if exists (select 1 from public.courts where event_id = c.event_id and id <> c.id and lower(name) = lower(trim(p_name))) then
    raise exception 'There''s already a court called %', trim(p_name);
  end if;
  update public.courts set name = trim(p_name) where id = c.id;
end $$;

-- ---------- category status ----------
-- open -> locked      close entries (the draw can still happen)
-- locked -> open      reopen entries, only before the draw and while the event still takes entries
-- open/locked/live -> cancelled
create or replace function public.set_category_status(p_category uuid, p_status public.t_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  e public.events;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only this event''s organisers can change categories'; end if;
  select * into e from public.events where id = c.event_id;
  if c.status = p_status then return; end if;

  if p_status = 'locked' and c.status = 'open' then
    null;
  elsif p_status = 'open' and c.status = 'locked' then
    if exists (select 1 from public.matches where category_id = c.id) then raise exception 'Fixtures are drawn, so entries can''t reopen'; end if;
    if e.status not in ('open', 'live') then raise exception 'This tournament isn''t taking entries'; end if;
  elsif p_status = 'cancelled' and c.status in ('open', 'locked', 'live') then
    null;
  else
    raise exception 'A % category can''t be set to %', c.status, p_status;
  end if;
  update public.categories set status = p_status where id = c.id;
end $$;

create or replace function public.close_all_entries(p_event uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.can_manage(p_event) then raise exception 'Only this event''s organisers can close entries'; end if;
  update public.categories set status = 'locked' where event_id = p_event and status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Cancelling keeps every entry and result for the record; players see the tournament as cancelled.
create or replace function public.cancel_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not public.can_manage(e.id) then raise exception 'Only this event''s organisers can cancel it'; end if;
  if e.status in ('completed', 'cancelled') then raise exception 'This tournament is already %', e.status; end if;
  update public.categories set status = 'cancelled' where event_id = e.id and status <> 'completed';
  update public.events set status = 'cancelled' where id = e.id;
end $$;

-- ---------- permissions ----------
revoke execute on function public.update_event(uuid, jsonb), public.add_court(uuid, text), public.rename_court(uuid, text),
  public.set_category_status(uuid, public.t_status), public.close_all_entries(uuid), public.cancel_event(uuid) from public, anon;
grant execute on function public.update_event(uuid, jsonb), public.add_court(uuid, text), public.rename_court(uuid, text),
  public.set_category_status(uuid, public.t_status), public.close_all_entries(uuid), public.cancel_event(uuid) to authenticated;
