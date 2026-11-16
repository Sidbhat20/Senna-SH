-- SportsHunt v2, migration 10: notifications outbox (P0.4).
-- Managers queue emails for an event's players; the app sends them and records the result. Each row is one email to
-- one player (or team captain). A dedupe key stops the same reason emailing the same person twice. Drafts never email.
-- Walk-ins added by the organiser have no account, so no email.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  entry_id uuid references public.entries (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  kind text not null check (kind in ('fixtures_released', 'schedule_update', 'match_called', 'event_cancelled')),
  payload jsonb not null default '{}',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index notifications_event on public.notifications (event_id, created_at desc);
alter table public.notifications enable row level security;
create policy "managers see their event's notifications" on public.notifications for select to authenticated
  using (public.can_manage(event_id));
revoke insert, update, delete on public.notifications from anon, authenticated;

-- Queues one email per affected player and returns what to send.
--   fixtures_released  p_category drawn: its confirmed entries, with their first match
--   schedule_update    the order of play changed: confirmed entries that still have a match to play
--   match_called       p_match is due on court: its two sides
--   event_cancelled    everyone still entered (confirmed or awaiting payment)
-- p_round makes repeat sends of the same kind distinct (e.g. each re-plan); same round + same person = one email.
create or replace function public.queue_notifications(
  p_event uuid, p_kind text, p_category uuid default null, p_match uuid default null, p_round text default ''
) returns table (id uuid, email text, kind text, payload jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare ev public.events;
begin
  select * into ev from public.events where events.id = p_event;
  if ev.id is null or not public.can_manage(ev.id) then raise exception 'Only this event''s organisers can send notifications'; end if;
  if ev.status = 'draft' then return; end if; -- nothing goes out for an unpublished event
  if p_kind not in ('fixtures_released', 'schedule_update', 'match_called', 'event_cancelled') then raise exception 'Unknown notification'; end if;

  return query
  with targets as (
    select e.id as entry_id, u.id as user_id, u.email::text as to_email, c.name as category,
           coalesce(e.display_name, t.name, p.name) || coalesce(' / ' || e.partner_name, '') as entry_name
    from public.entries e
    join public.categories c on c.id = e.category_id
    left join public.teams t on t.id = e.team_id
    left join public.profiles p on p.id = e.user_id
    join auth.users u on u.id = coalesce(e.user_id, t.captain_id)
    where c.event_id = ev.id and u.email is not null
      and (case when p_kind = 'event_cancelled' then e.status <> 'withdrawn' else e.status = 'confirmed' end)
      and (p_category is null or e.category_id = p_category)
      and (p_match is null or e.id in (select x.entry_a from public.matches x where x.id = p_match
                                       union select x.entry_b from public.matches x where x.id = p_match))
      and (p_kind <> 'schedule_update' or exists (
            select 1 from public.matches x where (x.entry_a = e.id or x.entry_b = e.id) and x.status = 'scheduled'))
  ),
  with_next as (
    select tg.*, nm.court, nm.at, nm.opponent
    from targets tg
    left join lateral (
      select co.name as court, x.scheduled_at as at,
             (select coalesce(o.display_name, ot.name, op.name) || coalesce(' / ' || o.partner_name, '')
              from public.entries o left join public.teams ot on ot.id = o.team_id left join public.profiles op on op.id = o.user_id
              where o.id = case when x.entry_a = tg.entry_id then x.entry_b else x.entry_a end) as opponent
      from public.matches x left join public.courts co on co.id = x.court_id
      where (x.entry_a = tg.entry_id or x.entry_b = tg.entry_id) and x.status <> 'done'
        and (p_match is null or x.id = p_match)
      order by x.scheduled_at nulls last limit 1
    ) nm on true
  ),
  ins as (
    insert into public.notifications as n (event_id, entry_id, user_id, email, kind, payload, dedupe_key)
    select ev.id, w.entry_id, w.user_id, w.to_email, p_kind,
           jsonb_build_object('event', ev.title, 'slug', ev.slug, 'venue', ev.venue, 'category', w.category, 'entry', w.entry_name,
                              'court', w.court, 'at', w.at, 'opponent', w.opponent),
           concat_ws(':', p_kind, coalesce(p_category::text, p_match::text, ev.id::text), w.entry_id::text, p_round)
    from with_next w
    on conflict (dedupe_key) do nothing
    returning n.id, n.email, n.kind, n.payload
  )
  select ins.id, ins.email, ins.kind, ins.payload from ins;
end $$;

-- Records the send result for rows the caller manages. p_error null = sent.
create or replace function public.mark_notifications(p_ids uuid[], p_error text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.notifications n
  set sent_at = case when p_error is null then now() end, error = p_error
  where n.id = any (p_ids) and public.can_manage(n.event_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.queue_notifications(uuid, text, uuid, uuid, text), public.mark_notifications(uuid[], text) from public, anon;
grant execute on function public.queue_notifications(uuid, text, uuid, uuid, text), public.mark_notifications(uuid[], text) to authenticated;
