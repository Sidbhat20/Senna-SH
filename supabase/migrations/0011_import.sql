-- SportsHunt v2, migration 11: organisers import entries with seeds (P1.1).
-- add_entries now also takes an optional seed per row: [{"name": "...", "club": "...", "seed": 3}].
-- Same name and signature as before, so existing grants and callers keep working. All rows go in, or none do.

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
  select count(*) into v_count from public.entries where category_id = c.id and status <> 'withdrawn';
  if v_count + v_new > c.max_entries then
    raise exception 'Only % spots left in this category', greatest(c.max_entries - v_count, 0);
  end if;

  select count(*) into v_bad from jsonb_array_elements(p_rows) r
  where r ? 'seed' and jsonb_typeof(r -> 'seed') <> 'null'
    and (jsonb_typeof(r -> 'seed') <> 'number' or (r ->> 'seed')::numeric not between 1 and 999 or (r ->> 'seed')::numeric % 1 <> 0);
  if v_bad > 0 then raise exception 'Seeds are whole numbers from 1 to 999'; end if;

  insert into public.entries (category_id, display_name, club, seed, status, payment_status)
  select c.id, trim(r ->> 'name'), coalesce(trim(r ->> 'club'), ''), (r ->> 'seed')::int, 'confirmed', 'not_required'
  from jsonb_array_elements(p_rows) r;
  return v_new;
end $$;
