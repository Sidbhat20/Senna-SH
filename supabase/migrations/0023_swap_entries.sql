-- SportsHunt v2, migration 23: organisers swap two players between first-round matches (organiser UX brief, P1.1).
-- Same rules as src/lib/fixtures/swap.ts: same category, first round of a knockout or winners bracket, both matches
-- still scheduled, no byes, and two different matches. Both rows are locked and updated in one transaction.

create or replace function public.swap_entries(p_match_a uuid, p_side_a text, p_match_b uuid, p_side_b text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.matches;
  y public.matches;
  ex uuid;
  ey uuid;
begin
  if p_side_a not in ('a', 'b') or p_side_b not in ('a', 'b') then raise exception 'Unknown side'; end if;
  if p_match_a = p_match_b then raise exception 'Pick two different matches.'; end if;
  -- lock in id order so two organisers swapping at once can't deadlock
  perform 1 from public.matches where id in (p_match_a, p_match_b) order by id for update;
  select * into x from public.matches where id = p_match_a;
  select * into y from public.matches where id = p_match_b;
  if x.id is null or y.id is null or not public.can_manage(x.event_id) then raise exception 'Only this event''s organisers can change the draw'; end if;
  if x.category_id <> y.category_id then raise exception 'Both matches must be in the same category.'; end if;
  if x.stage not in ('knockout', 'winners') or y.stage not in ('knockout', 'winners') or x.round <> 1 or y.round <> 1 then
    raise exception 'Only first-round knockout matches can be swapped.';
  end if;
  if x.status <> 'scheduled' or y.status <> 'scheduled' then raise exception 'One of these matches has started or finished.'; end if;
  if x.a_bye or x.b_bye or y.a_bye or y.b_bye then raise exception 'Matches with a bye can''t be swapped.'; end if;
  ex := case when p_side_a = 'a' then x.entry_a else x.entry_b end;
  ey := case when p_side_b = 'a' then y.entry_a else y.entry_b end;
  if ex is null or ey is null then raise exception 'Both sides need a player.'; end if;

  update public.matches set entry_a = case when p_side_a = 'a' then ey else entry_a end,
                            entry_b = case when p_side_a = 'b' then ey else entry_b end where id = x.id;
  update public.matches set entry_a = case when p_side_b = 'a' then ex else entry_a end,
                            entry_b = case when p_side_b = 'b' then ex else entry_b end where id = y.id;
end $$;

revoke execute on function public.swap_entries(uuid, text, uuid, text) from public, anon;
grant execute on function public.swap_entries(uuid, text, uuid, text) to authenticated;
