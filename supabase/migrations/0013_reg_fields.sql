-- SportsHunt v2, migration 13: custom registration questions (P1.3).
-- An event can ask up to 10 questions (text, date, or choice). Answers are checked inside register_entry, stored on
-- the entry, and readable only by the event's managers (they may hold personal details).

-- [{key, label, type: text|date|choice, options: [..] (choice only), required: bool}]
create or replace function public.valid_reg_fields(f jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(f) = 'array' and jsonb_array_length(f) <= 10
    and (select count(distinct x ->> 'key') = count(*) from jsonb_array_elements(f) x)
    and not exists (
      select 1 from jsonb_array_elements(f) x
      where coalesce(x ->> 'key', '') !~ '^[a-z0-9_]{1,30}$'
         or length(trim(coalesce(x ->> 'label', ''))) not between 1 and 60
         or coalesce(x ->> 'type', '') not in ('text', 'date', 'choice')
         or jsonb_typeof(coalesce(x -> 'required', 'null')) <> 'boolean'
         or (x ->> 'type' = 'choice' and (jsonb_typeof(x -> 'options') <> 'array'
             or jsonb_array_length(x -> 'options') not between 2 and 20
             or exists (select 1 from jsonb_array_elements(x -> 'options') o
                        where jsonb_typeof(o) <> 'string' or length(o #>> '{}') not between 1 and 40)))
    )
$$;

alter table public.events add column if not exists reg_fields jsonb not null default '[]'
  constraint events_reg_fields_valid check (public.valid_reg_fields(reg_fields));
-- Not added to the 0005 column grants, so players and spectators can't read anyone's answers.
alter table public.entries add column if not exists answers jsonb not null default '{}';

-- Keeps only answers to the event's questions; raises if a required one is missing or an answer is invalid.
create or replace function public.clean_answers(f jsonb, a jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  q jsonb;
  v text;
  out jsonb := '{}';
begin
  for q in select value from jsonb_array_elements(coalesce(f, '[]')) loop
    v := trim(coalesce(a ->> (q ->> 'key'), ''));
    if v = '' then
      if (q ->> 'required')::boolean then raise exception 'Please answer "%"', q ->> 'label'; end if;
      continue;
    end if;
    if q ->> 'type' = 'text' and length(v) > 200 then raise exception '"%" is limited to 200 characters', q ->> 'label'; end if;
    if q ->> 'type' = 'date' then
      if v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '"%" needs a date', q ->> 'label'; end if;
      begin
        perform v::date;
      exception when others then
        raise exception '"%" needs a real date', q ->> 'label';
      end;
    end if;
    if q ->> 'type' = 'choice' and not (q -> 'options') ? v then raise exception 'Pick one of the options for "%"', q ->> 'label'; end if;
    out := out || jsonb_build_object(q ->> 'key', v);
  end loop;
  return out;
end $$;

-- ---------- registration with answers (0006 version + p_answers) ----------
drop function if exists public.register_entry(uuid, uuid, text, date, date, text[], text);
create function public.register_entry(
  p_category uuid, p_team uuid default null, p_partner text default null,
  p_dob date default null, p_partner_dob date default null, p_roster text[] default '{}', p_team_name text default null,
  p_answers jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  e public.events;
  v_count int;
  v_id uuid;
  v_team uuid := p_team;
  v_aged boolean;
  v_answers jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to register'; end if;
  if (select banned from public.profiles where id = auth.uid()) then raise exception 'This account cannot register'; end if;
  select * into c from public.categories where id = p_category for update;
  select * into e from public.events where id = c.event_id;
  if c.id is null or e.status not in ('open', 'live') or c.status <> 'open' then raise exception 'Registration is closed'; end if;
  if now() > e.reg_closes_at then raise exception 'Registration has closed'; end if;
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count >= c.max_entries then raise exception 'This category is full'; end if;
  v_answers := public.clean_answers(e.reg_fields, p_answers); -- raises if a required answer is missing or invalid

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

  insert into public.entries (category_id, team_id, user_id, partner_name, dob, partner_dob, roster, answers, status, payment_status)
  values (c.id,
          case when c.entry_type = 'team' then v_team end,
          case when c.entry_type <> 'team' then auth.uid() end,
          case when c.entry_type = 'pair' then trim(p_partner) end,
          p_dob, p_partner_dob,
          case when c.entry_type = 'team' then coalesce(p_roster, '{}') else '{}' end,
          v_answers,
          case when c.entry_fee > 0 then 'pending' else 'confirmed' end,
          case when c.entry_fee > 0 then 'unpaid' else 'not_required' end)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.register_entry(uuid, uuid, text, date, date, text[], text, jsonb) from public, anon;
grant execute on function public.register_entry(uuid, uuid, text, date, date, text[], text, jsonb) to authenticated;

-- ---------- update_event can change the questions (0007 version + reg_fields) ----------
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
    age_check = coalesce(p ->> 'age_check', age_check),
    reg_fields = case when p ? 'reg_fields' then p -> 'reg_fields' else reg_fields end
  where id = e.id;
end $$;


-- ---------- answers for the event's managers ----------
create or replace function public.entry_answers(p_event uuid) returns table (entry_id uuid, answers jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage(p_event) then raise exception 'Only this event''s organisers can see answers'; end if;
  return query select e.id, e.answers from public.entries e join public.categories c on c.id = e.category_id where c.event_id = p_event;
end $$;

revoke execute on function public.clean_answers(jsonb, jsonb), public.entry_answers(uuid) from public, anon;
grant execute on function public.entry_answers(uuid) to authenticated;
-- the events check constraint calls this as whoever writes the row, so it stays callable (it only reads its argument)
grant execute on function public.valid_reg_fields(jsonb) to anon, authenticated;
