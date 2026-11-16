-- SportsHunt v2, migration 16: close the race in 0015's one-UTR-per-event check.
-- Two claims with the same UTR at the same instant could both pass the "already used?" check before either saved.
-- An event-level transaction lock makes claims for one event take turns, so the check and the save are atomic.

create or replace function public.claim_payment(p_entry uuid, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_ref text := upper(trim(coalesce(p_ref, '')));
  v_event uuid;
begin
  select * into e from public.entries where id = p_entry for update;
  if e.id is null or not (e.user_id = auth.uid()
       or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid())) then
    raise exception 'You can only report a payment for your own entry';
  end if;
  if e.payment_status not in ('unpaid', 'claimed') then raise exception 'This entry doesn''t have a fee waiting'; end if;
  if v_ref !~ '^[A-Za-z0-9]{6,30}$' then
    raise exception 'Enter the UPI reference (UTR) from your payment app: 6 to 30 letters or digits';
  end if;
  v_event := public.category_event(e.category_id);
  perform pg_advisory_xact_lock(hashtext('claim_payment:' || v_event::text)); -- one claim per event at a time
  if exists (select 1 from public.entries o join public.categories c on c.id = o.category_id
             where c.event_id = v_event and o.id <> e.id and o.payment_ref = v_ref) then
    raise exception 'That UTR has already been used for another entry. Check it in your UPI app';
  end if;
  update public.entries set payment_ref = v_ref, payment_claimed_at = now(), payment_status = 'claimed' where id = e.id;
end $$;
