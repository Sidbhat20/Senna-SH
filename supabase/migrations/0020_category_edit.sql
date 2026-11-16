-- SportsHunt v2, migration 20: edit and add categories after publishing (organiser UX brief, P0.5).
--
-- update_category: managers change name, entry fee and max entries until that category's first fixture is drawn.
--   * max entries can't go below the entries already holding a place (anything not withdrawn);
--   * the fee is fixed once any player has paid or reported a payment, so nobody paid a different amount;
--   * dropping the fee to 0 confirms entries still waiting to pay (pending + unpaid). Raising it from 0 leaves
--     existing free entries as they are: they entered when it was free.
--   Format and entry type stay as published.
-- add_category: managers add a category while the event is open or entries are closed (not live, finished or
--   cancelled), with the same fields and checks as the create wizard.

create or replace function public.update_category(p_category uuid, p_name text, p_fee int, p_max int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  v_taken int;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only this event''s organisers can edit categories'; end if;
  if c.status = 'cancelled' then raise exception 'This category is cancelled'; end if;
  if exists (select 1 from public.matches where category_id = c.id) then
    raise exception 'Fixtures are drawn for %, so it can''t change any more', c.name;
  end if;
  select count(*) into v_taken from public.entries where category_id = c.id and status <> 'withdrawn';
  if p_max < v_taken then raise exception '% already has % entries, so the limit can''t be lower than that', c.name, v_taken; end if;
  if p_fee is distinct from c.entry_fee and exists (
    select 1 from public.entries where category_id = c.id and payment_status in ('paid', 'claimed') and status <> 'withdrawn'
  ) then
    raise exception 'Players have already paid for %, so the fee stays at ₹%', c.name, c.entry_fee;
  end if;

  update public.categories set name = trim(p_name), entry_fee = p_fee, max_entries = p_max where id = c.id;
  if p_fee = 0 and c.entry_fee > 0 then
    update public.entries set status = 'confirmed', payment_status = 'not_required'
    where category_id = c.id and status = 'pending' and payment_status = 'unpaid';
  end if;
exception when unique_violation then
  raise exception 'Another category in this event is already called that';
end $$;

create or replace function public.add_category(p_event uuid, c jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_id uuid;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.can_manage(e.id) then raise exception 'Only this event''s organisers can add categories'; end if;
  if e.status not in ('open', 'locked') then raise exception 'Categories can only be added before the tournament starts'; end if;
  if (select count(*) from public.categories where event_id = e.id) >= 30 then raise exception 'An event can have up to 30 categories'; end if;

  insert into public.categories (event_id, name, format, group_count, entry_type, team_size, max_entries, entry_fee, sort,
                                 scoring, best_of, points_to, points_cap, born_on_or_after, born_on_or_before)
  values (e.id, trim(c ->> 'name'), (c ->> 'format')::public.t_format, (c ->> 'group_count')::int, c ->> 'entry_type',
          coalesce((c ->> 'team_size')::int, 1), (c ->> 'max_entries')::int, coalesce((c ->> 'entry_fee')::int, 0),
          coalesce((select max(sort) + 1 from public.categories where event_id = e.id), 0),
          coalesce(c ->> 'scoring', 'games'), coalesce((c ->> 'best_of')::int, 3), coalesce((c ->> 'points_to')::int, 21),
          (c ->> 'points_cap')::int, (c ->> 'born_on_or_after')::date, (c ->> 'born_on_or_before')::date)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Another category in this event is already called that';
end $$;

revoke execute on function public.update_category(uuid, text, int, int), public.add_category(uuid, jsonb) from public, anon;
grant execute on function public.update_category(uuid, text, int, int), public.add_category(uuid, jsonb) to authenticated;
