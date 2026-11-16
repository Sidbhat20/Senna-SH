-- SportsHunt v2, migration 18: organisers reject a claimed UPI payment (follow-up brief, step 4).
-- Reject moves the entry back to unpaid, clears the UTR (so a reference copied from someone else's payment is freed
-- for its real owner) and keeps a short reason the player can read. A new claim clears the reason.
-- No new status: "rejected" is unpaid + a reason. The reason is private: not in the column grants.

alter table public.entries add column if not exists payment_rejection text
  check (payment_rejection is null or length(payment_rejection) between 1 and 200);

create or replace function public.reject_payment(p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if e.id is null or not public.can_manage(public.category_event(e.category_id)) then
    raise exception 'Only this event''s organisers can reject a payment';
  end if;
  if e.payment_status <> 'claimed' then raise exception 'Only a payment a player has reported can be rejected'; end if;
  update public.entries set payment_status = 'unpaid', payment_ref = null, payment_claimed_at = null,
    payment_rejection = coalesce(nullif(left(trim(coalesce(p_reason, '')), 200), ''), 'The organiser couldn''t find this payment')
  where id = e.id;
end $$;

-- The player (or captain) reads why their payment was rejected. Null for anyone else.
create or replace function public.my_payment_note(p_entry uuid) returns text
language sql stable security definer set search_path = '' as $$
  select e.payment_rejection from public.entries e
  where e.id = p_entry
    and (e.user_id = auth.uid() or exists (select 1 from public.teams t where t.id = e.team_id and t.captain_id = auth.uid()))
$$;

-- 0017's claim_payment, plus clearing the rejection reason on a new claim.
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
  if exists (select 1 from public.entries o where o.id <> e.id and o.payment_ref = v_ref) then
    raise exception 'That UTR has already been used for another entry. Check it in your UPI app';
  end if;
  begin
    update public.entries set payment_ref = v_ref, payment_claimed_at = now(), payment_status = 'claimed', payment_rejection = null
    where id = e.id;
  exception when unique_violation then
    raise exception 'That UTR has already been used for another entry. Check it in your UPI app';
  end;
end $$;

revoke execute on function public.reject_payment(uuid, text), public.my_payment_note(uuid) from public, anon;
grant execute on function public.reject_payment(uuid, text), public.my_payment_note(uuid) to authenticated;
