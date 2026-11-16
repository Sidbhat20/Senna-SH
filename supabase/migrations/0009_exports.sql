-- SportsHunt v2, migration 9: contact details for an event's entries export (P0.6).
-- Emails and phones live in auth.users, which the app can't read. This returns them to the event's managers only;
-- spectators and players never see them. Walk-ins added by the organiser have no account, so no contact.

create or replace function public.entry_contacts(p_event uuid)
returns table (entry_id uuid, email text, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage(p_event) then raise exception 'Only this event''s organisers can see contact details'; end if;
  return query
    select e.id, u.email::text, u.phone::text
    from public.entries e
    join public.categories c on c.id = e.category_id
    left join public.teams t on t.id = e.team_id
    left join auth.users u on u.id = coalesce(e.user_id, t.captain_id)  -- a team's contact is its captain
    where c.event_id = p_event;
end $$;

revoke execute on function public.entry_contacts(uuid) from public, anon;
grant execute on function public.entry_contacts(uuid) to authenticated;
