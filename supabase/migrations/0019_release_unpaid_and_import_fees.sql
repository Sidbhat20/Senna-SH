-- SportsHunt v2, migration 19 (follow-up brief, steps 5 and 9).
--
-- Step 5: once an event's registration has closed, entries that still owe their fee (pending + unpaid) are withdrawn,
-- so the place counts free again (capacity is "status <> 'withdrawn'"). Entries whose player has reported a UTR
-- (claimed) are left for the organiser: they Mark paid or Reject, and a rejected one is released on the next pass.
-- Payments are never auto-verified. Released rows have no payment_ref (unpaid rows never keep one), so the unique UTR
-- index is untouched. unique (category_id, user_id) still holds a released row, so that player cannot sign up again;
-- the organiser can add them as a walk-in.
-- It runs whenever someone opens the event, on walk-in/import, and from the organiser's desk, so it works before a cron.
--
-- Step 9: walk-in paste and CSV import respect entry fees: a paid category's rows come in pending + unpaid, exactly
-- like online registration; free categories stay confirmed + not_required. add_entries also releases first.

create or replace function public.release_unpaid_entries(p_event uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.entries e set status = 'withdrawn'
  from public.categories c join public.events ev on ev.id = c.event_id
  where e.category_id = c.id and (p_event is null or ev.id = p_event)
    and ev.reg_closes_at < now() and ev.status not in ('completed', 'cancelled')
    and e.status = 'pending' and e.payment_status = 'unpaid';
  get diagnostics v = row_count;
  return v;
end $$;

-- Idempotent housekeeping that only ever applies the published rule, so anyone (even a visitor) may trigger it.
grant execute on function public.release_unpaid_entries(uuid) to anon, authenticated;

create or replace function public.add_entries(p_category uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  v_count int;
  v_new int;
  v_bad int;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only the organiser can add entries'; end if;
  if c.status <> 'open' then raise exception 'Entries are closed for this category'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to add'; end if;
  v_new := jsonb_array_length(p_rows);
  if v_new = 0 then raise exception 'Nothing to add'; end if;
  perform public.release_unpaid_entries(c.event_id);
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count + v_new > c.max_entries then
    raise exception 'Only % spots left in this category', greatest(c.max_entries - v_count, 0);
  end if;

  select count(*) into v_bad from jsonb_array_elements(p_rows) r
  where r ? 'seed' and jsonb_typeof(r -> 'seed') <> 'null'
    and (jsonb_typeof(r -> 'seed') <> 'number' or (r ->> 'seed')::numeric not between 1 and 999 or (r ->> 'seed')::numeric % 1 <> 0);
  if v_bad > 0 then raise exception 'Seeds are whole numbers from 1 to 999'; end if;

  insert into public.entries (category_id, display_name, club, seed, status, payment_status)
  select c.id, trim(r ->> 'name'), coalesce(trim(r ->> 'club'), ''), (r ->> 'seed')::int,
    case when c.entry_fee > 0 then 'pending' else 'confirmed' end,
    case when c.entry_fee > 0 then 'unpaid' else 'not_required' end
  from jsonb_array_elements(p_rows) r;
  return v_new;
end $$;
