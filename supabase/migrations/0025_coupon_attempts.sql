-- SportsHunt v2, migration 25: limit discount-code guessing (security review of 0024).
-- Each wrong code a player tries is recorded; after 10 in an hour, apply_coupon refuses until the hour passes. The
-- clear per-reason messages stay (the brief asks for them), but guessing codes stops being practical.
-- apply_coupon now returns {due} or {error} instead of raising for a wrong code, because raising would undo the
-- recorded attempt. Misuse (someone else's entry, an entry already paid) still raises as before.

create table public.coupon_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index coupon_attempts_user on public.coupon_attempts (user_id, at desc);
alter table public.coupon_attempts enable row level security; -- no policies: only apply_coupon touches it
revoke all on public.coupon_attempts from anon, authenticated;

drop function if exists public.apply_coupon(uuid, text);
create function public.apply_coupon(p_entry uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  c public.categories;
  k public.coupons;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_off int;
  v_due int;
  v_why text;
begin
  select * into e from public.entries where id = p_entry for update;
  if e.id is null or not (e.user_id = auth.uid()
       or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid())) then
    raise exception 'You can only use a code on your own entry';
  end if;
  if e.status <> 'pending' or e.payment_status <> 'unpaid' then raise exception 'Codes work only before you pay'; end if;
  if exists (select 1 from public.coupon_redemptions where entry_id = e.id) then raise exception 'This entry already has a code'; end if;
  if (select count(*) from public.coupon_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'Too many wrong codes. Try again in an hour.');
  end if;

  select * into c from public.categories where id = e.category_id;
  select * into k from public.coupons where event_id = c.event_id and code = v_code;
  v_why := case
    when k.id is null then 'That code isn''t valid for this tournament'
    when k.category_id is not null and k.category_id <> c.id then 'That code is for a different category'
    when k.expires_at is not null and k.expires_at <= now() then 'That code has expired'
  end;
  if v_why is null then
    update public.coupons set uses = uses + 1 where id = k.id and (max_uses is null or uses < max_uses);
    if not found then v_why := 'That code has been used up'; end if;
  end if;
  if v_why is not null then
    insert into public.coupon_attempts (user_id) values (auth.uid());
    return jsonb_build_object('error', v_why);
  end if;

  v_off := least(c.entry_fee, case when k.kind = 'percent' then (c.entry_fee * k.amount) / 100 else k.amount end);
  v_due := c.entry_fee - v_off;
  insert into public.coupon_redemptions (coupon_id, entry_id, discount) values (k.id, e.id, v_off);
  if v_due = 0 then
    update public.entries set fee_due = 0, status = 'confirmed', payment_status = 'not_required' where id = e.id;
  else
    update public.entries set fee_due = v_due where id = e.id;
  end if;
  return jsonb_build_object('due', v_due);
end $$;

revoke execute on function public.apply_coupon(uuid, text) from public, anon;
grant execute on function public.apply_coupon(uuid, text) to authenticated;
