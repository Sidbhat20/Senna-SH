-- SportsHunt v2, migration 21: where each entry came from (organiser UX brief, P0.6).
-- Online entries come from register_entry (a player or team); offline ones from walk-in paste or CSV import
-- (add_entries), which are the only rows with a display_name. So the source is derived, not stored: nothing to
-- backfill, and it can't drift. The view keeps its columns in order and adds source at the end.

create or replace view public.entry_names with (security_invoker = true) as
select e.id, e.category_id, e.status, e.payment_status, e.seed, e.club, e.created_at, e.checked_in_at, e.id_checked,
       e.roster, coalesce(e.display_name, t.name, p.name) || coalesce(' / ' || e.partner_name, '') as name,
       case when e.display_name is null then 'online' else 'offline' end as source
from public.entries e
left join public.teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id;
