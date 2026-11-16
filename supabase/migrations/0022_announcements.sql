-- SportsHunt v2, migration 22: organiser announcements (organiser UX brief, P0.8).
-- Extends the 0010 outbox instead of adding a table: two new kinds, general_info and promotion, carrying the
-- organiser's own message in payload.message.
--   message_audience  who a message would reach, with name, email and phone (for the organiser's WhatsApp list):
--     fixtures_released  confirmed entries
--     schedule_update    confirmed entries with a match still to play
--     general_info       everyone entered (confirmed or awaiting payment)
--     promotion          players from this organiser's OTHER published events who aren't in this one. Owner only:
--                        co-organisers never see contacts from events they don't help run.
--   queue_message     queues general_info / promotion emails; the dedupe key includes a hash of the message, so
--                     the same message never reaches the same person twice.
-- Drafts reach nobody.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('fixtures_released', 'schedule_update', 'match_called', 'event_cancelled', 'general_info', 'promotion'));

create or replace function public.message_audience(p_event uuid, p_kind text)
returns table (entry_id uuid, user_id uuid, name text, email text, phone text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare ev public.events;
begin
  select * into ev from public.events where events.id = p_event;
  if ev.id is null or not public.can_manage(ev.id) then raise exception 'Only this event''s organisers can send messages'; end if;
  if p_kind not in ('fixtures_released', 'schedule_update', 'general_info', 'promotion') then raise exception 'Unknown message'; end if;
  if p_kind = 'promotion' and not public.is_owner(ev.id) then raise exception 'Only the tournament''s owner can message past players'; end if;
  if ev.status = 'draft' then return; end if;

  if p_kind = 'promotion' then
    return query
    select distinct on (u.id) null::uuid, u.id, coalesce(pr.name, ''), u.email::text, u.phone::text
    from public.entries e
    join public.categories c on c.id = e.category_id
    join public.events oe on oe.id = c.event_id
    left join public.teams t on t.id = e.team_id
    join auth.users u on u.id = coalesce(e.user_id, t.captain_id)
    left join public.profiles pr on pr.id = u.id
    where oe.organiser_id = ev.organiser_id and oe.id <> ev.id and oe.status <> 'draft' and e.status <> 'withdrawn'
      and not exists (
        select 1 from public.entries x join public.categories xc on xc.id = x.category_id
        left join public.teams xt on xt.id = x.team_id
        where xc.event_id = ev.id and x.status <> 'withdrawn' and coalesce(x.user_id, xt.captain_id) = u.id)
    order by u.id;
  else
    return query
    select e.id, u.id, coalesce(e.display_name, t.name, p.name) || coalesce(' / ' || e.partner_name, ''), u.email::text, u.phone::text
    from public.entries e
    join public.categories c on c.id = e.category_id
    left join public.teams t on t.id = e.team_id
    left join public.profiles p on p.id = e.user_id
    left join auth.users u on u.id = coalesce(e.user_id, t.captain_id)
    where c.event_id = ev.id
      and (case when p_kind = 'general_info' then e.status <> 'withdrawn' else e.status = 'confirmed' end)
      and (p_kind <> 'schedule_update' or exists (
            select 1 from public.matches x where (x.entry_a = e.id or x.entry_b = e.id) and x.status = 'scheduled'))
    order by 3;
  end if;
end $$;

create or replace function public.queue_message(p_event uuid, p_kind text, p_message text)
returns table (id uuid, email text, kind text, payload jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  ev public.events;
  v_msg text := left(trim(coalesce(p_message, '')), 1000);
begin
  if p_kind not in ('general_info', 'promotion') then raise exception 'Unknown message'; end if;
  if length(v_msg) < 5 then raise exception 'Write a message of at least a few words'; end if;
  select * into ev from public.events where events.id = p_event;
  return query
  with ins as (
    insert into public.notifications as n (event_id, entry_id, user_id, email, kind, payload, dedupe_key)
    select ev.id, a.entry_id, a.user_id, a.email, p_kind,
           jsonb_build_object('event', ev.title, 'slug', ev.slug, 'venue', ev.venue, 'entry', a.name, 'message', v_msg,
                              'category', '', 'court', null, 'at', ev.starts_at, 'opponent', null),
           concat_ws(':', p_kind, ev.id::text, coalesce(a.entry_id, a.user_id)::text, md5(v_msg))
    from public.message_audience(p_event, p_kind) a  -- checks who may send, and returns nothing for drafts
    where a.email is not null
    on conflict (dedupe_key) do nothing
    returning n.id, n.email, n.kind, n.payload
  )
  select ins.id, ins.email, ins.kind, ins.payload from ins;
end $$;

revoke execute on function public.message_audience(uuid, text), public.queue_message(uuid, text, text) from public, anon;
grant execute on function public.message_audience(uuid, text), public.queue_message(uuid, text, text) to authenticated;
