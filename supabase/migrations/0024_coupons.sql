-- SportsHunt v2, migration 24: discount coupons (organiser UX brief, P1.2). No gateway: a coupon only lowers what the
-- player pays the organiser's UPI ID.
--   coupons             managers create them per event: CODE, percent or flat ₹ off, optional category, expiry, max uses.
--                       Only managers can read them (RLS), so the public page never lists codes.
--   coupon_redemptions  one per entry; records the ₹ discount given.
--   entries.fee_due     what this entry pays after a coupon; null means the category fee.
--   apply_coupon        the player (or captain) applies a code to their own unpaid entry. Uses are counted with a
--                       conditional update, so the last use can't be taken twice. A 100% coupon confirms the entry.
--   update_category     (0020) also keeps the fee fixed once a coupon has been used in that category.

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('percent', 'flat')),
  amount int not null check (amount > 0 and amount <= 1000000),
  category_id uuid references public.categories (id) on delete cascade,
  expires_at timestamptz,
  max_uses int check (max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or amount <= 100),
  unique (event_id, code)
);
alter table public.coupons enable row level security;
create policy "managers read coupons" on public.coupons for select to authenticated using (public.can_manage(event_id));
create policy "managers add coupons" on public.coupons for insert to authenticated with check (public.can_manage(event_id) and uses = 0);
create policy "managers remove coupons" on public.coupons for delete to authenticated using (public.can_manage(event_id));
revoke update on public.coupons from anon, authenticated;

create table public.coupon_redemptions (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  entry_id uuid not null unique references public.entries (id) on delete cascade,
  discount int not null check (discount >= 0),
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;
create policy "managers read redemptions" on public.coupon_redemptions for select to authenticated
  using (exists (select 1 from public.coupons c where c.id = coupon_id and public.can_manage(c.event_id)));
revoke insert, update, delete on public.coupon_redemptions from anon, authenticated;

alter table public.entries add column if not exists fee_due int check (fee_due >= 0);
grant select (fee_due) on public.entries to anon, authenticated;

create or replace view public.entry_names with (security_invoker = true) as
select e.id, e.category_id, e.status, e.payment_status, e.seed, e.club, e.created_at, e.checked_in_at, e.id_checked,
       e.roster, coalesce(e.display_name, t.name, p.name) || coalesce(' / ' || e.partner_name, '') as name,
       case when e.display_name is null then 'online' else 'offline' end as source,
       e.fee_due
from public.entries e
left join public.teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id;

create or replace function public.apply_coupon(p_entry uuid, p_code text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  c public.categories;
  k public.coupons;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_off int;
  v_due int;
begin
  select * into e from public.entries where id = p_entry for update;
  if e.id is null or not (e.user_id = auth.uid()
       or exists (select 1 from public.teams where id = e.team_id and captain_id = auth.uid())) then
    raise exception 'You can only use a code on your own entry';
  end if;
  if e.status <> 'pending' or e.payment_status <> 'unpaid' then raise exception 'Codes work only before you pay'; end if;
  if exists (select 1 from public.coupon_redemptions where entry_id = e.id) then raise exception 'This entry already has a code'; end if;
  select * into c from public.categories where id = e.category_id;
  select * into k from public.coupons where event_id = c.event_id and code = v_code;
  if k.id is null then raise exception 'That code isn''t valid for this tournament'; end if;
  if k.category_id is not null and k.category_id <> c.id then raise exception 'That code is for a different category'; end if;
  if k.expires_at is not null and k.expires_at <= now() then raise exception 'That code has expired'; end if;

  update public.coupons set uses = uses + 1 where id = k.id and (max_uses is null or uses < max_uses);
  if not found then raise exception 'That code has been used up'; end if;

  v_off := least(c.entry_fee, case when k.kind = 'percent' then (c.entry_fee * k.amount) / 100 else k.amount end);
  v_due := c.entry_fee - v_off;
  insert into public.coupon_redemptions (coupon_id, entry_id, discount) values (k.id, e.id, v_off);
  if v_due = 0 then
    update public.entries set fee_due = 0, status = 'confirmed', payment_status = 'not_required' where id = e.id;
  else
    update public.entries set fee_due = v_due where id = e.id;
  end if;
  return v_due;
end $$;

-- 0020's update_category, plus: the fee stays fixed once a coupon has been used in the category.
create or replace function public.update_category(p_category uuid, p_name text, p_fee int, p_max int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.categories;
  v_taken int;
begin
  select * into c from public.categories where id = p_category for update;
  if c.id is null or not public.can_manage(c.event_id) then raise exception 'Only this event''s organisers can edit categories'; end if;
  if c.status = 'cancelled' then raise exception 'This category is cancelled'; end if;
  if exists (select 1 from public.matches where category_id = c.id) then
    raise exception 'Fixtures are drawn for %, so it can''t change any more', c.name;
  end if;
  select count(*) into v_taken from public.entries where category_id = c.id and status <> 'withdrawn';
  if p_max < v_taken then raise exception '% already has % entries, so the limit can''t be lower than that', c.name, v_taken; end if;
  if p_fee is distinct from c.entry_fee and exists (
    select 1 from public.entries where category_id = c.id and payment_status in ('paid', 'claimed') and status <> 'withdrawn'
  ) then
    raise exception 'Players have already paid for %, so the fee stays at ₹%', c.name, c.entry_fee;
  end if;
  if p_fee is distinct from c.entry_fee and exists (
    select 1 from public.coupon_redemptions r join public.entries x on x.id = r.entry_id where x.category_id = c.id
  ) then
    raise exception 'A discount code has been used in %, so the fee stays at ₹%', c.name, c.entry_fee;
  end if;

  update public.categories set name = trim(p_name), entry_fee = p_fee, max_entries = p_max where id = c.id;
  if p_fee = 0 and c.entry_fee > 0 then
    update public.entries set status = 'confirmed', payment_status = 'not_required'
    where category_id = c.id and status = 'pending' and payment_status = 'unpaid';
  end if;
exception when unique_violation then
  raise exception 'Another category in this event is already called that';
end $$;

revoke execute on function public.apply_coupon(uuid, text) from public, anon;
grant execute on function public.apply_coupon(uuid, text) to authenticated;
