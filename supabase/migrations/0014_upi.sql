-- SportsHunt v2, migration 14: entry fees by UPI straight to the organiser.
-- The platform never holds money: players pay the organiser's UPI ID, then submit the UTR from their UPI app.
-- The organiser checks it against their bank and confirms with the existing "Mark paid". UTRs are managers-only.

alter table public.events add column if not exists upi_id text
  constraint events_upi_id_shape check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$');

alter table public.entries
  add column if not exists payment_ref text check (payment_ref is null or payment_ref ~ '^[A-Za-z0-9]{6,30}$'),
  add column if not exists payment_claimed_at timestamptz;
-- payment_ref and payment_claimed_at are left out of the 0005 column grants, so only the functions below expose them.

alter table public.entries drop constraint if exists entries_payment_status_check;
alter table public.entries add constraint entries_payment_status_check
  check (payment_status in ('not_required', 'unpaid', 'claimed', 'paid', 'refunded'));

create or replace function public.set_upi_id(p_event uuid, p_upi text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage(p_event) then raise exception 'Only this event''s organisers can set the UPI ID'; end if;
  update public.events set upi_id = nullif(trim(p_upi), '') where id = p_event;
end $$;

-- The player (or team captain) says they've paid and gives the UTR. Repeatable until the organiser confirms.
create or replace function public.claim_payment(p_entry uuid, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.entries;
begin
  select * into e from public.entries where id = p_entry for update;
  if e.id is null or not (e.user_id = auth.uid()
       or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid())) then
    raise exception 'You can only report a payment for your own entry';
  end if;
  if e.payment_status not in ('unpaid', 'claimed') then raise exception 'This entry doesn''t have a fee waiting'; end if;
  if trim(coalesce(p_ref, '')) !~ '^[A-Za-z0-9]{6,30}$' then
    raise exception 'Enter the UPI reference (UTR) from your payment app: 6 to 30 letters or digits';
  end if;
  update public.entries set payment_ref = upper(trim(p_ref)), payment_claimed_at = now(), payment_status = 'claimed'
  where id = e.id;
end $$;

create or replace function public.payment_claims(p_event uuid)
returns table (entry_id uuid, payment_ref text, claimed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage(p_event) then raise exception 'Only this event''s organisers can see payment references'; end if;
  return query select e.id, e.payment_ref, e.payment_claimed_at
    from public.entries e join public.categories c on c.id = e.category_id
    where c.event_id = p_event and e.payment_ref is not null;
end $$;

revoke execute on function public.set_upi_id(uuid, text), public.claim_payment(uuid, text), public.payment_claims(uuid) from public, anon;
grant execute on function public.set_upi_id(uuid, text), public.claim_payment(uuid, text), public.payment_claims(uuid) to authenticated;
