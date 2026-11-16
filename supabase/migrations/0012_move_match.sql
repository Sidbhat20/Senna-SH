-- SportsHunt v2, migration 12: move one match by hand (P1.2). Mirrors findClash in src/lib/fixtures/clash.ts.
-- A match occupies [at, at + match_minutes + break_minutes). Moving refuses if that overlaps another match on the
-- same court, or another match either side is playing. Only matches that haven't started can move.

create or replace function public.move_match(p_match uuid, p_court uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  e public.events;
  v_slot interval;
  v_clash record;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null or not public.can_manage(m.event_id) then raise exception 'Only this event''s organisers can move matches'; end if;
  if m.status <> 'scheduled' or m.walkover then raise exception 'Only matches that haven''t started can move'; end if;
  if not exists (select 1 from public.courts where id = p_court and event_id = m.event_id) then raise exception 'Pick one of this event''s courts'; end if;
  select * into e from public.events where id = m.event_id;
  v_slot := make_interval(mins => e.match_minutes + e.break_minutes);

  select o.scheduled_at, c.name as court, (o.court_id = p_court) as same_court into v_clash
  from public.matches o left join public.courts c on c.id = o.court_id
  where o.event_id = m.event_id and o.id <> m.id and not o.walkover and o.scheduled_at is not null
    and o.scheduled_at < p_at + v_slot and o.scheduled_at + v_slot > p_at
    and (o.court_id = p_court
         or (m.entry_a is not null and m.entry_a in (o.entry_a, o.entry_b))
         or (m.entry_b is not null and m.entry_b in (o.entry_a, o.entry_b)))
  order by (o.court_id = p_court) desc, o.scheduled_at
  limit 1;
  if found then
    if v_clash.same_court then
      raise exception '% already has a match at %', v_clash.court, to_char(v_clash.scheduled_at at time zone 'Asia/Kolkata', 'HH24:MI');
    end if;
    raise exception 'A player in this match is on % at %', coalesce(v_clash.court, 'another court'),
      to_char(v_clash.scheduled_at at time zone 'Asia/Kolkata', 'HH24:MI');
  end if;

  update public.matches set court_id = p_court, scheduled_at = p_at, updated_at = now() where id = m.id;
end $$;

revoke execute on function public.move_match(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.move_match(uuid, uuid, timestamptz) to authenticated;
