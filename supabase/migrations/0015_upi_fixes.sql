-- SportsHunt v2, migration 15: UPI fixes from a security review of 0014.
-- 1. Only the event's owner (or an admin) sets where money goes; co-organisers can't redirect fees to themselves.
-- 2. A UTR can back only one entry per event, so a copied payment reference can't confirm a second entry.

create or replace function public.set_upi_id(p_event uuid, p_upi text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_event) then raise exception 'Only the tournament''s owner can set the UPI ID'; end if;
  update public.events set upi_id = nullif(trim(p_upi), '') where id = p_event;
end $$;

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
  if exists (select 1 from public.entries o join public.categories c on c.id = o.category_id
             where c.event_id = v_event and o.id <> e.id and o.payment_ref = v_ref) then
    raise exception 'That UTR has already been used for another entry. Check it in your UPI app';
  end if;
  update public.entries set payment_ref = v_ref, payment_claimed_at = now(), payment_status = 'claimed' where id = e.id;
end $$;
