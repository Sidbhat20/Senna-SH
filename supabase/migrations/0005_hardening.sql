-- SportsHunt v2, migration 5: tighten column access (from a security review).

-- 1. Dates of birth are private. Entries stay readable for brackets and lists, but not dob / partner_dob.
--    Eligibility is enforced inside register_entry; nobody needs to read birth dates back.
revoke select on public.entries from anon, authenticated;
grant select (id, category_id, team_id, user_id, display_name, club, status, payment_status, seed, added_by, created_at,
  partner_name, roster, checked_in_at, id_checked) on public.entries to anon, authenticated;

-- 2. Managers edit event details, never who owns the event.
revoke update on public.events from anon, authenticated;
grant update (title, venue, area, prize, rules, poster_url, match_minutes, break_minutes, age_check, starts_at,
  reg_closes_at, status) on public.events to authenticated;

-- 3. Managers update an entry's payment, status and seeding, never whose entry it is or which category it's in.
revoke update on public.entries from anon, authenticated;
grant update (status, payment_status, seed, club) on public.entries to authenticated;
