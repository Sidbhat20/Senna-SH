// Runs the real migrations (0001 then 0002, as in production) in an in-memory Postgres (PGlite) with stubs for
// the bits Supabase provides (auth schema, roles, realtime publication), then plays events end to end
// through the same functions and RLS the app uses.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { separateClubs } from "../src/lib/fixtures/clubs";
import { doubleElim } from "../src/lib/fixtures/doubleElim";
import { knockout } from "../src/lib/fixtures/knockout";
import { GAME_CASES } from "../src/lib/fixtures/scoring.cases";

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}', email text, phone text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
`;

let db: PGlite;
const U = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, "0")}`);
const ORG = U[0];

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    user
      ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`
      : `set role anon; select set_config('request.jwt.claim.sub', '', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

let n = 0;
/** An event with one category; returns both ids. */
async function newCategory(format: string, entryType: "solo" | "pair" | "team", max: number, fee = 0, extra: Record<string, unknown> = {}) {
  return as(ORG, async () => {
    const e = await one<{ id: string }>(
      `insert into events (slug, title, sport, venue, starts_at, reg_closes_at)
       values ($1, 'Test event', 'badminton', 'Court hall', now() + interval '7 days', now() + interval '6 days') returning id`,
      [`event-${++n}`],
    );
    const cols = Object.keys(extra);
    await db.exec("reset role;"); // categories are written by publish_event in the app; set them up directly here
    const c = await one<{ id: string }>(
      `insert into categories (event_id, name, format, entry_type, max_entries, entry_fee${cols.map((k) => `, ${k}`).join("")})
       values ($1, 'Open', $2, $3, $4, $5${cols.map((_, i) => `, $${i + 6}`).join("")}) returning id`,
      [e.id, format, entryType, max, fee, ...Object.values(extra)],
    );
    return { event: e.id, category: c.id };
  });
}

const register = (user: string, category: string) =>
  as(user, async () => (await one<{ id: string }>("select register_entry($1) as id", [category])).id);

async function playOut(category: string, scorer = ORG) {
  for (let guard = 0; guard < 300; guard++) {
    const m = await one<{ id: string }>(
      `select id from matches where category_id = $1 and status <> 'done' and entry_a is not null and entry_b is not null
       order by stage, round, slot limit 1`,
      [category],
    );
    if (!m) return;
    await as(scorer, async () => {
      await q("select update_games($1, $2)", [m.id, JSON.stringify([[21, 10], [21, 12]])]);
      await q("select finish_match($1)", [m.id]);
    });
  }
  throw new Error("category never finished");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const all = readdirSync(new URL("./migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of process.env.MIGRATIONS?.split(",") ?? all) {
    await db.exec(readFileSync(new URL(`./migrations/${f}`, import.meta.url), "utf8"));
  }
  for (const [i, id] of U.entries()) {
    await q(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, { full_name: `Player ${i}` }]);
  }
}, 60_000);

describe("schema", () => {
  it("creates a profile for every new user, and nobody can make themselves admin", async () => {
    expect((await one("select count(*)::int as n from profiles")).n).toBe(12);
    await expect(as(U[1], () => q("update profiles set is_admin = true where id = $1", [U[1]]))).rejects.toThrow(/permission denied/);
  });

  it("drafts are hidden from everyone but the organiser", async () => {
    await as(ORG, () =>
      q(`insert into events (slug, title, sport, venue, starts_at, reg_closes_at, status)
         values ('secret-draft', 'Secret draft', 'futsal', 'X', now() + interval '2 days', now() + interval '1 day', 'draft')`),
    );
    expect(await as(null, () => q("select slug from events where slug = 'secret-draft'"))).toEqual([]);
    expect(await as(U[3], () => q("select slug from events where slug = 'secret-draft'"))).toEqual([]);
    expect(await as(ORG, () => q("select slug from events where slug = 'secret-draft'"))).toHaveLength(1);
  });

  it("nobody can add categories or courts to someone else's event", async () => {
    const { event } = await newCategory("knockout", "solo", 8);
    await expect(as(U[2], () => q("insert into categories (event_id, name, format, entry_type, max_entries) values ($1, 'Hack', 'knockout', 'solo', 4)", [event])))
      .rejects.toThrow(/row-level security|permission denied/);
    await expect(as(U[2], () => q("insert into courts (event_id, name) values ($1, 'Court X')", [event]))).rejects.toThrow(/row-level security/);
  });

  it("plays a 5-player knockout with byes to completion and completes the event", async () => {
    const { event, category } = await newCategory("knockout", "solo", 8);
    const entries: string[] = [];
    for (const u of U.slice(1, 6)) entries.push(await register(u, category));
    await expect(register(U[1], category)).rejects.toThrow(/duplicate key/);

    const fixtures = JSON.stringify(knockout(entries));
    await expect(as(U[2], () => q("select save_fixtures($1, $2)", [category, fixtures]))).rejects.toThrow(/Only the organiser/);
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, fixtures]));
    expect((await one("select count(*)::int as n from matches where category_id = $1 and walkover", [category])).n).toBe(3);

    await playOut(category);
    expect((await one("select status from categories where id = $1", [category])).status).toBe("completed");
    expect((await one("select status from events where id = $1", [event])).status).toBe("completed");
  });

  it("plays a 6-player double elimination", async () => {
    const { category } = await newCategory("double_elim", "solo", 8);
    const entries: string[] = [];
    for (const u of U.slice(1, 7)) entries.push(await register(u, category));
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(doubleElim(entries))]));
    await playOut(category);
    expect((await one("select count(*)::int as n from matches where category_id = $1 and not walkover", [category])).n).toBe(10);
  });

  it("organiser adds walk-ins with clubs; capacity is enforced; others can't add", async () => {
    const { category } = await newCategory("knockout", "solo", 4);
    const rows = JSON.stringify([{ name: "Asha", club: "Smash" }, { name: "Bala", club: "Smash" }, { name: "Chitra", club: "" }]);
    await expect(as(U[3], () => q("select add_entries($1, $2)", [category, rows]))).rejects.toThrow(/Only the organiser/);
    expect((await as(ORG, () => one("select add_entries($1, $2) as n", [category, rows]))).n).toBe(3);
    await expect(as(ORG, () => q("select add_entries($1, $2)", [category, JSON.stringify([{ name: "D" }, { name: "E" }])]))).rejects.toThrow(/Only 1 spots left/);
    const names = await as(null, () => q<{ name: string; club: string }>("select name, club from entry_names where category_id = $1 order by created_at", [category]));
    expect(names.map((r) => r.name)).toEqual(["Asha", "Bala", "Chitra"]);

    // the app's club separation keeps Asha and Bala apart in round 1
    const ids = (await q<{ id: string; club: string }>("select id, club from entries where category_id = $1 order by created_at", [category]));
    const club = (id: string) => ids.find((r) => r.id === id)?.club ?? "";
    const fx = separateClubs(knockout(ids.map((r) => r.id)), club);
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(fx)]));
    const clash = await one<{ n: number }>(
      `select count(*)::int as n from matches m join entries a on a.id = m.entry_a join entries b on b.id = m.entry_b
       where m.category_id = $1 and m.round = 1 and a.club <> '' and a.club = b.club`, [category]);
    expect(clash.n).toBe(0);
  });

  it("referee links: court referees score only their court; links are private", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4);
    const [c1, c2] = await as(ORG, () =>
      q<{ id: string }>("insert into courts (event_id, name) values ($1, 'Court 1'), ($1, 'Court 2') returning id", [event]),
    );
    const link = await as(ORG, () => one<{ token: string }>("insert into referee_links (event_id, court_id) values ($1, $2) returning token", [event, c1.id]));
    expect(await as(U[9], () => q("select token from referee_links"))).toEqual([]); // hidden from non-managers

    const entries = [await register(U[1], category), await register(U[2], category), await register(U[3], category), await register(U[4], category)];
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout(entries))]));
    const [m1, m2] = await q<{ id: string }>("select id from matches where category_id = $1 and round = 1 order by slot", [category]);
    await as(ORG, () => q("select save_schedule($1, $2)", [event, JSON.stringify([
      { id: m1.id, court: c1.id, at: "2030-01-01T09:00:00+05:30" },
      { id: m2.id, court: c2.id, at: "2030-01-01T09:00:00+05:30" },
    ])]));

    await expect(as(U[9], () => q("select update_games($1, $2)", [m1.id, JSON.stringify([[1, 0]])]))).rejects.toThrow(/not a referee/);
    await as(U[9], () => q("select join_referee($1)", [link.token]));
    await as(U[9], () => q("select update_games($1, $2)", [m1.id, JSON.stringify([[1, 0]])]));
    await expect(as(U[9], () => q("select update_games($1, $2)", [m2.id, JSON.stringify([[1, 0]])]))).rejects.toThrow(/not a referee/);

    // schedule can't point at another event's court
    const other = await newCategory("knockout", "solo", 4);
    await expect(as(ORG, () => q("select save_schedule($1, $2)", [other.event, JSON.stringify([{ id: m1.id, court: c1.id, at: "2030-01-01T09:00:00+05:30" }])])))
      .rejects.toThrow(/another event/);
  });

  it("paid categories hold entries as pending until the organiser confirms them", async () => {
    const { category } = await newCategory("knockout", "solo", 4, 500);
    const id = await register(U[5], category);
    expect((await one("select status, payment_status from entries where id = $1", [id]))).toEqual({ status: "pending", payment_status: "unpaid" });
    await expect(as(U[5], () => q("update entries set status = 'confirmed' where id = $1 returning id", [id]))).resolves.toEqual([]);
    await as(ORG, () => q("update entries set status = 'confirmed', payment_status = 'paid' where id = $1", [id]));
    expect((await one("select status from entries where id = $1", [id])).status).toBe("confirmed");
  });

  it("teams: invite tokens stay private, captains register, members join by link", async () => {
    const { category } = await newCategory("knockout", "team", 4);
    const team = await as(U[4], () => one<{ id: string }>("insert into teams (name) values ('HSR Hawks') returning id"));
    await expect(as(U[5], () => q("select invite_token from teams"))).rejects.toThrow(/permission denied/);
    const { tok } = await as(U[4], () => one<{ tok: string }>("select my_team_invite($1) as tok", [team.id]));
    await as(U[5], () => q("select join_team($1)", [tok]));
    await expect(as(U[5], () => q("select register_entry($1, $2)", [category, team.id]))).rejects.toThrow(/captain/);
    await as(U[4], () => q("select register_entry($1, $2)", [category, team.id]));
    expect(await as(null, () => q("select name from entry_names where category_id = $1", [category]))).toEqual([{ name: "HSR Hawks" }]);
  });

  it("organisers can create a draft and read it straight back (publish flow)", async () => {
    const row = await as(ORG, () =>
      one<{ id: string }>(
        `insert into events (slug, title, sport, venue, starts_at, reg_closes_at, status)
         values ('draft-readback', 'Draft readback', 'badminton', 'Hall', now() + interval '3 days', now() + interval '2 days', 'draft')
         returning id`,
      ),
    );
    expect(row.id).toBeTruthy();
    expect(await as(U[4], () => q("select id from events where slug = 'draft-readback'"))).toEqual([]);
  });

  it("only an event's managers can upload its poster; anyone can see it", async () => {
    const { event } = await newCategory("knockout", "solo", 4);
    await as(ORG, () => q("insert into storage.objects (bucket_id, name) values ('posters', $1)", [`${event}/poster.jpg`]));
    await expect(as(U[6], () => q("insert into storage.objects (bucket_id, name) values ('posters', $1)", [`${event}/fake.jpg`])))
      .rejects.toThrow(/row-level security/);
    await expect(as(U[6], () => q("insert into storage.objects (bucket_id, name) values ('posters', 'not-a-uuid/x.jpg')")))
      .rejects.toThrow(/row-level security/);
    expect(await as(null, () => q("select name from storage.objects where bucket_id = 'posters'"))).toHaveLength(1);
    await as(ORG, () => q("update events set poster_url = 'https://example.com/p.jpg' where id = $1", [event]));
    expect((await one("select poster_url from events where id = $1", [event])).poster_url).toBe("https://example.com/p.jpg");
  });

  it("SQL scoring rules agree with the TypeScript ones", async () => {
    for (const c of GAME_CASES) {
      const r = await one<{ over: boolean; open: boolean }>("select game_over($1, $2, $3, $4) as over, game_open($1, $2, $3, $4) as open",
        [c.g[0], c.g[1], c.to, c.cap]);
      expect(r, c.g.join("-")).toEqual({ over: c.over, open: c.open });
    }
  });

  it("badminton: game scores are validated, and the match needs a majority of games", async () => {
    const { category } = await newCategory("knockout", "solo", 2, 0, { best_of: 3, points_to: 21, points_cap: 30 });
    const entries = [await register(U[1], category), await register(U[2], category)];
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout(entries))]));
    const m = await one<{ id: string }>("select id from matches where category_id = $1", [category]);
    const games = (g: number[][]) => as(ORG, () => q("select update_games($1, $2)", [m.id, JSON.stringify(g)]));
    await expect(games([[21, 20], [5, 0]])).rejects.toThrow(/isn't possible/); // 21-20 isn't a finished game
    await expect(games([[25, 10]])).rejects.toThrow(/isn't possible/);
    await games([[21, 19], [18, 21], [10, 9]]);
    expect(await one("select score_a, score_b, status from matches where id = $1", [m.id])).toEqual({ score_a: 1, score_b: 1, status: "live" });
    await expect(as(ORG, () => q("select finish_match($1)", [m.id]))).rejects.toThrow(/Nobody has won 2 games/);
    await games([[21, 19], [18, 21], [30, 29]]);
    await expect(games([[21, 19], [18, 21], [30, 29], [1, 0]])).rejects.toThrow(/Best of 3|already won/);
    await as(ORG, () => q("select finish_match($1)", [m.id]));
    expect((await one("select winner_entry from matches where id = $1", [m.id])).winner_entry).toBe(entries[0]);
  });

  it("football: goals, and knockout draws need penalties", async () => {
    const { category } = await newCategory("knockout", "solo", 2, 0, { scoring: "goals" });
    const entries = [await register(U[3], category), await register(U[4], category)];
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout(entries))]));
    const m = await one<{ id: string }>("select id from matches where category_id = $1", [category]);
    await expect(as(ORG, () => q("select update_games($1, $2)", [m.id, "[[1,0]]"]))).rejects.toThrow(/goals/);
    await as(ORG, () => q("select update_score($1, 2, 2)", [m.id]));
    await expect(as(ORG, () => q("select finish_match($1)", [m.id]))).rejects.toThrow(/penalty/);
    await as(ORG, () => q("select update_score($1, 2, 2, 4, 5)", [m.id]));
    await as(ORG, () => q("select finish_match($1)", [m.id]));
    expect((await one("select winner_entry from matches where id = $1", [m.id])).winner_entry).toBe(entries[1]);
  });

  it("doubles: one player registers the pair; age limits check both dates of birth", async () => {
    const { category } = await newCategory("knockout", "pair", 8, 0, { born_on_or_after: "2013-01-01" });
    const reg = (u: string, partner: string | null, dob: string | null, pdob: string | null) =>
      as(u, () => one<{ id: string }>("select register_entry($1, null, $2, $3, $4) as id", [category, partner, dob, pdob]));
    await expect(reg(U[5], null, "2014-05-01", "2014-06-01")).rejects.toThrow(/partner/);
    await expect(reg(U[5], "Kavya", null, null)).rejects.toThrow(/date of birth/);
    await expect(reg(U[5], "Kavya", "2014-05-01", "2010-06-01")).rejects.toThrow(/Not eligible/);
    await reg(U[5], "Kavya", "2014-05-01", "2013-06-01");
    expect(await as(null, () => q("select name from entry_names where category_id = $1", [category]))).toEqual([{ name: "Player 5 / Kavya" }]);
  });

  it("desk: only the organiser checks players in; a no-show is awarded as a walkover", async () => {
    const { category } = await newCategory("knockout", "solo", 4);
    const entries = [await register(U[6], category), await register(U[7], category), await register(U[8], category)];
    await expect(as(U[6], () => q("select check_in($1, true, false)", [entries[0]]))).rejects.toThrow(/desk/);
    await as(ORG, () => q("select check_in($1, true, true)", [entries[0]]));
    expect(await one("select checked_in_at is not null as present, id_checked from entries where id = $1", [entries[0]]))
      .toEqual({ present: true, id_checked: true });
    await as(ORG, () => q("select check_in($1, false)", [entries[0]]));
    expect((await one("select checked_in_at from entries where id = $1", [entries[0]])).checked_in_at).toBeNull();

    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout(entries))]));
    const m = await one<{ id: string; entry_b: string }>(
      "select id, entry_b from matches where category_id = $1 and round = 1 and not walkover and entry_a is not null and entry_b is not null",
      [category],
    );
    await expect(as(U[6], () => q("select award_walkover($1, 'b')", [m.id]))).rejects.toThrow(/can't change/);
    await as(ORG, () => q("select award_walkover($1, 'b')", [m.id]));
    expect(await one("select status, walkover, winner_entry from matches where id = $1", [m.id]))
      .toEqual({ status: "done", walkover: true, winner_entry: m.entry_b });
    const final = await one<{ entry_b: string | null; entry_a: string | null }>(
      "select entry_a, entry_b from matches where category_id = $1 and round = 2", [category]);
    expect([final.entry_a, final.entry_b]).toContain(m.entry_b);
  });

  it("hardening: dates of birth are unreadable; owners and entry identities can't be changed", async () => {
    const { event, category } = await newCategory("knockout", "pair", 8, 0, { born_on_or_after: "2010-01-01" });
    const id = await as(U[9], async () =>
      (await one<{ id: string }>("select register_entry($1, null, 'Asha', '2012-01-01', '2012-02-02') as id", [category])).id);
    await expect(as(null, () => q("select dob from entries where id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(as(U[3], () => q("select partner_dob from entries where id = $1", [id]))).rejects.toThrow(/permission denied/);
    expect(await as(null, () => q("select id, partner_name from entries where id = $1", [id]))).toEqual([{ id, partner_name: "Asha" }]);

    await expect(as(ORG, () => q("update events set organiser_id = $1 where id = $2", [U[3], event]))).rejects.toThrow(/permission denied/);
    await as(ORG, () => q("update events set poster_url = 'https://example.com/x.jpg' where id = $1", [event]));
    await expect(as(ORG, () => q("update entries set user_id = $1 where id = $2", [U[3], id]))).rejects.toThrow(/permission denied/);
    await as(ORG, () => q("update entries set seed = 1, status = 'confirmed', payment_status = 'paid' where id = $1", [id]));
    expect((await one("select seed from entries where id = $1", [id])).seed).toBe(1);
  });

  it("risk 1: strangers can't mark paid, check in or award walkovers", async () => {
    const { category } = await newCategory("knockout", "solo", 4, 300);
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    expect(await as(U[3], () => q("update entries set status = 'confirmed', payment_status = 'paid' where id = $1 returning id", [a]))).toEqual([]);
    expect((await one("select payment_status from entries where id = $1", [a])).payment_status).toBe("unpaid");
    await expect(as(U[3], () => q("select check_in($1, true)", [a]))).rejects.toThrow(/desk/);
    await as(ORG, () => q("update entries set status = 'confirmed' where id = any($1)", [[a, b]]));
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([a, b]))]));
    const m = await one<{ id: string }>("select id from matches where category_id = $1", [category]);
    await expect(as(U[3], () => q("select award_walkover($1, 'a')", [m.id]))).rejects.toThrow(/can't change/);
  });

  it("risk 2: a failed team registration leaves no team behind", async () => {
    const { category } = await newCategory("knockout", "team", 2);
    for (const u of [U[1], U[2]]) {
      await as(u, () => q("select register_entry($1, null, null, null, null, '{}', $2)", [category, `Team ${u.slice(-2)}`]));
    }
    const before = (await one<{ n: number }>("select count(*)::int as n from teams")).n;
    await expect(as(U[3], () => q("select register_entry($1, null, null, null, null, '{}', 'Late Team')", [category]))).rejects.toThrow(/full/);
    expect((await one<{ n: number }>("select count(*)::int as n from teams")).n).toBe(before);
    expect(await q("select name from entry_names where category_id = $1", [category])).toHaveLength(2);
  });

  it("risk 3: publish_event is all or nothing", async () => {
    const ev = (slug: string) => JSON.stringify({
      slug, title: "Atomic Open", sport: "badminton", venue: "Hall",
      starts_at: "2030-01-10T09:00:00+05:30", reg_closes_at: "2030-01-08T21:00:00+05:30",
    });
    const good = { name: "Men's Singles", format: "knockout", entry_type: "solo", max_entries: 16 };
    const res = await as(ORG, () => one<{ r: { id: string; slug: string } }>("select publish_event($1, $2, 3) as r", [ev("atomic-ok"), JSON.stringify([good])]));
    expect(res.r.slug).toBe("atomic-ok");
    expect((await one("select status from events where id = $1", [res.r.id])).status).toBe("open");
    expect((await one("select count(*)::int as n from courts where event_id = $1", [res.r.id])).n).toBe(3);
    expect((await one("select count(*)::int as n from referee_links where event_id = $1", [res.r.id])).n).toBe(4);

    const bad = JSON.stringify([good, { ...good, name: "Broken", max_entries: 1 }]);
    await expect(as(ORG, () => q("select publish_event($1, $2, 2)", [ev("atomic-bad"), bad]))).rejects.toThrow();
    expect(await q("select id from events where slug = 'atomic-bad'")).toEqual([]);
    await expect(as(null, () => q("select publish_event($1, $2, 2)", [ev("atomic-anon"), JSON.stringify([good])]))).rejects.toThrow(/permission denied/);
  });

  it("risk 5: referee links expire, and rotating revokes the old link", async () => {
    const { event } = await newCategory("knockout", "solo", 4);
    const link = await as(ORG, () => one<{ token: string }>("insert into referee_links (event_id) values ($1) returning token", [event]));
    await expect(as(U[4], () => q("select rotate_referee_link($1)", [link.token]))).rejects.toThrow(/Only the organiser/);
    const fresh = await as(ORG, () => one<{ t: string }>("select rotate_referee_link($1) as t", [link.token]));
    await expect(as(U[5], () => q("select join_referee($1)", [link.token]))).rejects.toThrow(/expired/);
    await as(U[5], () => q("select join_referee($1)", [fresh.t]));
    await q("update referee_links set expires_at = now() - interval '1 minute' where token = $1", [fresh.t]);
    await expect(as(U[6], () => q("select join_referee($1)", [fresh.t]))).rejects.toThrow(/expired/);
  });

  it("organiser home: owners and co-organisers see their drafts; strangers don't", async () => {
    const draft = await as(ORG, () => one<{ id: string }>(
      `insert into events (slug, title, sport, venue, starts_at, reg_closes_at, status)
       values ('home-draft', 'Home draft', 'badminton', 'Hall', now() + interval '9 days', now() + interval '8 days', 'draft') returning id`));
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Ravi') as t", [draft.id]));
    await as(U[10], () => q("select join_staff($1)", [t]));
    expect(await as(ORG, () => q("select id from events where id = $1", [draft.id]))).toHaveLength(1);
    expect(await as(U[10], () => q("select id from events where id = $1", [draft.id]))).toHaveLength(1);
    expect(await as(U[11], () => q("select id from events where id = $1", [draft.id]))).toEqual([]);
    await expect(as(U[11], () => q("insert into officials (event_id, user_id, role) values ($1, $2, 'co_organiser')", [draft.id, U[11]])))
      .rejects.toThrow(/row-level security|permission denied/);
  });

  it("edit event: organisers update details; strangers and impossible dates are refused", async () => {
    const { event } = await newCategory("knockout", "solo", 8);
    const edit = (who: string, p: object) => as(who, () => q("select update_event($1, $2)", [event, JSON.stringify(p)]));
    await expect(edit(U[2], { title: "Hijacked Open" })).rejects.toThrow(/Only this event's organisers/);
    await edit(ORG, { title: "Renamed Open", venue: "New Hall", rules: ["Best of 3", " ", "Shuttles provided"], match_minutes: 30 });
    expect(await one("select title, venue, rules, match_minutes from events where id = $1", [event]))
      .toEqual({ title: "Renamed Open", venue: "New Hall", rules: ["Best of 3", "Shuttles provided"], match_minutes: 30 });
    await expect(edit(ORG, { reg_closes_at: "2099-01-01T00:00:00Z" })).rejects.toThrow(/check constraint/); // after the start
    await expect(as(ORG, () => q("update events set status = 'completed' where id = $1", [event]))).rejects.toThrow(/permission denied/);
    await expect(as(ORG, () => q("update events set sport = 'football' where id = $1", [event]))).rejects.toThrow(/permission denied/);
  });

  it("edit event: courts can be added (with a referee link) and renamed by organisers only", async () => {
    const { event } = await newCategory("knockout", "solo", 8);
    await expect(as(U[2], () => q("select add_court($1, 'Court 9')", [event]))).rejects.toThrow(/organisers/);
    const { id } = await as(ORG, () => one<{ id: string }>("select add_court($1, 'Court 9') as id", [event]));
    expect((await one("select count(*)::int as n from referee_links where court_id = $1", [id])).n).toBe(1);
    await expect(as(ORG, () => q("select add_court($1, 'court 9')", [event]))).rejects.toThrow(/already a court/);
    await expect(as(U[2], () => q("select rename_court($1, 'Centre Court')", [id]))).rejects.toThrow(/organisers/);
    await as(ORG, () => q("select rename_court($1, 'Centre Court')", [id]));
    expect((await one("select name from courts where id = $1", [id])).name).toBe("Centre Court");
  });

  it("edit event: closing a category stops entries; it reopens only before the draw; format is fixed", async () => {
    const { category } = await newCategory("knockout", "solo", 8);
    await expect(as(U[2], () => q("select set_category_status($1, 'locked')", [category]))).rejects.toThrow(/organisers/);
    await as(ORG, () => q("select set_category_status($1, 'locked')", [category]));
    await expect(register(U[1], category)).rejects.toThrow(/closed/);
    await as(ORG, () => q("select set_category_status($1, 'open')", [category]));
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await as(ORG, () => q("select set_category_status($1, 'locked')", [category]));
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([a, b]))]));
    await expect(as(ORG, () => q("select set_category_status($1, 'open')", [category]))).rejects.toThrow(/can't be set|can't reopen/);
    await expect(as(ORG, () => q("update categories set format = 'league' where id = $1", [category]))).rejects.toThrow(/permission denied/);
  });

  it("edit event: close all entries, then cancel; a cancelled event can't be edited", async () => {
    const { event, category } = await newCategory("knockout", "solo", 8);
    await expect(as(U[3], () => q("select cancel_event($1)", [event]))).rejects.toThrow(/organisers/);
    expect((await as(ORG, () => one<{ n: number }>("select close_all_entries($1) as n", [event]))).n).toBe(1);
    expect((await one("select status from categories where id = $1", [category])).status).toBe("locked");
    await as(ORG, () => q("select cancel_event($1)", [event]));
    expect(await one("select e.status as event, c.status as category from events e join categories c on c.event_id = e.id where e.id = $1", [event]))
      .toEqual({ event: "cancelled", category: "cancelled" });
    await expect(as(ORG, () => q("select update_event($1, $2)", [event, '{"title":"Back again"}']))).rejects.toThrow(/cancelled/);
    expect(await as(null, () => q("select status from events where id = $1", [event]))).toEqual([{ status: "cancelled" }]);
  });

  it("staff: only the owner invites; links are single-use and expire; strangers can't add staff directly", async () => {
    const { event } = await newCategory("knockout", "solo", 8);
    await expect(as(U[2], () => q("select create_staff_invite($1, 'me')", [event]))).rejects.toThrow(/owner/);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Asha') as t", [event]));
    expect(await as(U[2], () => q("select token from staff_invites where event_id = $1", [event]))).toEqual([]);
    await expect(as(ORG, () => q("select join_staff($1)", [t]))).rejects.toThrow(/already own/);
    await as(U[3], () => q("select join_staff($1)", [t]));
    await expect(as(U[4], () => q("select join_staff($1)", [t]))).rejects.toThrow(/used or has expired/);
    // a co-organiser can't invite more co-organisers or add staff directly
    await expect(as(U[3], () => q("select create_staff_invite($1, 'x')", [event]))).rejects.toThrow(/owner/);
    await expect(as(U[3], () => q("insert into officials (event_id, user_id, role) values ($1, $2, 'co_organiser')", [event, U[5]])))
      .rejects.toThrow(/permission denied/);
    const old = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'late') as t", [event]));
    await q("update staff_invites set expires_at = now() - interval '1 minute' where token = $1", [old.t]);
    await expect(as(U[5], () => q("select join_staff($1)", [old.t]))).rejects.toThrow(/expired/);
    const withdrawn = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'nope') as t", [event]));
    await as(ORG, () => q("select revoke_staff_invite($1)", [withdrawn.t]));
    await expect(as(U[5], () => q("select join_staff($1)", [withdrawn.t]))).rejects.toThrow(/used or has expired/);
  });

  it("staff: a co-organiser runs the event (walk-ins, draw, edits) but can't delete or transfer it", async () => {
    const draft = await as(ORG, () => one<{ id: string }>(
      `insert into events (slug, title, sport, venue, starts_at, reg_closes_at, status)
       values ('co-run', 'Co-run Open', 'badminton', 'Hall', now() + interval '9 days', now() + interval '8 days', 'draft') returning id`));
    await db.exec("reset role;");
    const cat = await one<{ id: string }>(
      "insert into categories (event_id, name, format, entry_type, max_entries) values ($1, 'Open', 'knockout', 'solo', 8) returning id", [draft.id]);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [draft.id]));
    await as(U[6], () => q("select join_staff($1)", [t]));

    await as(U[6], () => q("select add_entries($1, $2)", [cat.id, JSON.stringify([{ name: "Walk-in A" }, { name: "Walk-in B" }])]));
    const ids = (await q<{ id: string }>("select id from entries where category_id = $1 order by created_at", [cat.id])).map((r) => r.id);
    await as(U[6], () => q("select save_fixtures($1, $2)", [cat.id, JSON.stringify(knockout(ids))]));
    await as(U[6], () => q("select update_event($1, $2)", [draft.id, '{"venue":"Co Hall"}']));
    expect((await one("select venue from events where id = $1", [draft.id])).venue).toBe("Co Hall");

    expect(await as(U[6], () => q("delete from events where id = $1 returning id", [draft.id]))).toEqual([]);
    await expect(as(U[6], () => q("update events set organiser_id = $1 where id = $2", [U[6], draft.id]))).rejects.toThrow(/permission denied/);
    expect((await one("select organiser_id from events where id = $1", [draft.id])).organiser_id).toBe(ORG);
  });

  it("staff: removing someone takes their access away at once; co-organisers can remove referees only", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [event]));
    await as(U[7], () => q("select join_staff($1)", [t]));
    const ref = await as(ORG, () => one<{ token: string }>("insert into referee_links (event_id) values ($1) returning token", [event]));
    await as(U[8], () => q("select join_referee($1)", [ref.token]));
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([a, b]))]));
    const m = await one<{ id: string }>("select id from matches where category_id = $1", [category]);

    expect((await as(U[8], () => one<{ ok: boolean }>("select can_score_match($1) as ok", [m.id]))).ok).toBe(true);
    await expect(as(U[7], () => q("select remove_official($1, $2)", [event, ORG]))).rejects.toThrow(/isn't on this tournament's staff/);
    await as(U[7], () => q("select remove_official($1, $2)", [event, U[8]])); // co-organiser removes the referee
    expect((await as(U[8], () => one<{ ok: boolean }>("select can_score_match($1) as ok", [m.id]))).ok).toBe(false);

    const { t: t2 } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co 2') as t", [event]));
    await as(U[9], () => q("select join_staff($1)", [t2]));
    await expect(as(U[7], () => q("select remove_official($1, $2)", [event, U[9]]))).rejects.toThrow(/owner/);
    expect((await as(U[7], () => one<{ ok: boolean }>("select can_manage($1) as ok", [event]))).ok).toBe(true);
    await as(ORG, () => q("select remove_official($1, $2)", [event, U[7]]));
    expect((await as(U[7], () => one<{ ok: boolean }>("select can_manage($1) as ok", [event]))).ok).toBe(false);
    await expect(as(U[7], () => q("select update_event($1, $2)", [event, '{"title":"Not any more"}']))).rejects.toThrow(/organisers/);
  });

  it("withdraw: players free their own spot before the draw; not someone else's, and not after the draw", async () => {
    const { category } = await newCategory("knockout", "solo", 2);
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await expect(register(U[3], category)).rejects.toThrow(/full/);
    await expect(as(U[3], () => q("select withdraw_entry($1)", [a]))).rejects.toThrow(/only withdraw your own entry before the draw/);
    await as(U[1], () => q("select withdraw_entry($1)", [a]));
    expect((await one("select status from entries where id = $1", [a])).status).toBe("withdrawn");
    await expect(register(U[1], category)).rejects.toThrow(/duplicate key/); // the withdrawn entry still holds U1's slot
    const c = await register(U[3], category); // the freed spot is taken

    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([b, c]))]));
    await expect(as(U[2], () => q("select withdraw_entry($1)", [b]))).rejects.toThrow(/only withdraw your own entry before the draw/);
  });

  it("withdraw: a team captain withdraws the team; a team member can't", async () => {
    const { category } = await newCategory("knockout", "team", 4);
    const entry = await as(U[4], async () =>
      (await one<{ id: string }>("select register_entry($1, null, null, null, null, '{}', 'Hebbal Hawks') as id", [category])).id);
    const team = await one<{ team_id: string }>("select team_id from entries where id = $1", [entry]);
    const { tok } = await as(U[4], () => one<{ tok: string }>("select my_team_invite($1) as tok", [team.team_id]));
    await as(U[5], () => q("select join_team($1)", [tok]));
    await expect(as(U[5], () => q("select withdraw_entry($1)", [entry]))).rejects.toThrow(/only withdraw your own entry/);
    await as(U[4], () => q("select withdraw_entry($1)", [entry]));
    expect((await one("select status from entries where id = $1", [entry])).status).toBe("withdrawn");
  });

  it("exports: contact details go to the event's managers only", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4);
    await q("update auth.users set email = 'asha@example.com', phone = '+919876543210' where id = $1", [U[1]]);
    const entry = await register(U[1], category);
    await expect(as(null, () => q("select * from entry_contacts($1)", [event]))).rejects.toThrow(/permission denied/);
    await expect(as(U[1], () => q("select * from entry_contacts($1)", [event]))).rejects.toThrow(/organisers/);
    const rows = await as(ORG, () => q("select * from entry_contacts($1)", [event]));
    expect(rows).toEqual([{ entry_id: entry, email: "asha@example.com", phone: "+919876543210" }]);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [event]));
    await as(U[2], () => q("select join_staff($1)", [t]));
    expect(await as(U[2], () => q("select email from entry_contacts($1)", [event]))).toEqual([{ email: "asha@example.com" }]);
  });

  it("notifications: drawing queues one email per confirmed player, once; drafts and strangers send nothing", async () => {
    await q("update auth.users set email = 'player' || right(id::text, 2) || '@example.com'");
    const { event, category } = await newCategory("knockout", "solo", 8, 300);
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    const pending = await register(U[3], category); // unpaid, so not confirmed
    await as(ORG, () => q("update entries set status = 'confirmed' where id = any($1)", [[a, b]]));
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([a, b]))]));

    const queue = (who: string, kind: string, extra: unknown[] = [category, null, "draw"]) =>
      as(who, () => q<{ email: string; kind: string; payload: { opponent: string; category: string } }>(
        "select * from queue_notifications($1, $2, $3, $4, $5)", [event, kind, ...extra]));
    await expect(queue(U[4], "fixtures_released")).rejects.toThrow(/organisers/);
    const sent = await queue(ORG, "fixtures_released");
    expect(sent.map((r) => r.email).sort()).toEqual(["player01@example.com", "player02@example.com"]);
    expect(sent.find((r) => r.email === "player01@example.com")!.payload).toMatchObject({ category: "Open", opponent: "Player 2" });
    expect(await queue(ORG, "fixtures_released")).toEqual([]); // same draw, same people: no second email

    const m = await one<{ id: string }>("select id from matches where category_id = $1", [category]);
    const called = await queue(ORG, "match_called", [null, m.id, "call-1"]);
    expect(called).toHaveLength(2);
    const cancelled = await queue(ORG, "event_cancelled", [null, null, "cancel"]);
    expect(cancelled.map((r) => r.email)).toContain("player03@example.com"); // unpaid entries hear about cancellation too
    void pending;

    const ids = sent.map((r) => (r as unknown as { id: string }).id);
    expect((await as(U[4], () => one<{ n: number }>("select mark_notifications($1) as n", [ids]))).n).toBe(0);
    expect((await as(ORG, () => one<{ n: number }>("select mark_notifications($1) as n", [ids]))).n).toBe(2);
    expect((await one("select count(*)::int as n from notifications where id = any($1) and sent_at is not null", [ids])).n).toBe(2);

    const draft = await as(ORG, () => one<{ id: string }>(
      `insert into events (slug, title, sport, venue, starts_at, reg_closes_at, status)
       values ('quiet-draft', 'Quiet draft', 'badminton', 'Hall', now() + interval '9 days', now() + interval '8 days', 'draft') returning id`));
    expect(await as(ORG, () => q("select * from queue_notifications($1, 'event_cancelled')", [draft.id]))).toEqual([]);
  });

  it("import: entries arrive with seeds, all or nothing, within the category limit", async () => {
    const { category } = await newCategory("knockout", "solo", 3);
    const add = (rows: object[]) => as(ORG, () => q("select add_entries($1, $2)", [category, JSON.stringify(rows)]));
    await expect(add([{ name: "A", seed: 1 }, { name: "B", seed: 0 }])).rejects.toThrow(/whole numbers from 1 to 999/);
    await expect(add([{ name: "A", seed: 1.5 }])).rejects.toThrow(/whole numbers/);
    expect((await one("select count(*)::int as n from entries where category_id = $1", [category])).n).toBe(0);
    await add([{ name: "Arjun Rao", club: "Smash", seed: 1 }, { name: "Kavya Menon", seed: null }]);
    expect(await q("select display_name, club, seed from entries where category_id = $1 order by created_at, display_name", [category]))
      .toEqual([{ display_name: "Arjun Rao", club: "Smash", seed: 1 }, { display_name: "Kavya Menon", club: "", seed: null }]);
    await expect(add([{ name: "C" }, { name: "D" }])).rejects.toThrow(/Only 1 spots left/);
    expect((await one("select count(*)::int as n from entries where category_id = $1", [category])).n).toBe(2);
  });

  it("move a match: organisers only; court and player clashes are refused; started matches stay put", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4);
    const [c1, c2] = await as(ORG, () => q<{ id: string }>("select add_court($1, 'Court A') as id union all select add_court($1, 'Court B')", [event]));
    const ids = [await register(U[1], category), await register(U[2], category), await register(U[3], category), await register(U[4], category)];
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout(ids))]));
    const [m1, m2] = await q<{ id: string }>("select id from matches where category_id = $1 and round = 1 order by slot", [category]);
    await as(ORG, () => q("select save_schedule($1, $2)", [event, JSON.stringify([
      { id: m1.id, court: c1.id, at: "2030-03-01T04:00:00Z" }, { id: m2.id, court: c2.id, at: "2030-03-01T04:00:00Z" },
    ])]));
    const move = (who: string, id: string, court: string, at: string) => as(who, () => q("select move_match($1, $2, $3)", [id, court, at]));

    await expect(move(U[5], m2.id, c2.id, "2030-03-01T06:00:00Z")).rejects.toThrow(/organisers/);
    await expect(move(ORG, m2.id, c1.id, "2030-03-01T04:20:00Z")).rejects.toThrow(/Court A already has a match at 09:30/); // slot 35 min
    await move(ORG, m2.id, c1.id, "2030-03-01T04:35:00Z"); // back-to-back is fine
    expect(await one("select court_id, scheduled_at from matches where id = $1", [m2.id])).toEqual({ court_id: c1.id, scheduled_at: new Date("2030-03-01T04:35:00Z") });

    const final = await one<{ id: string }>("select id from matches where category_id = $1 and round = 2", [category]);
    // put m1's first player into the final at 13:30 on Court B (set up directly; in play this happens when m1 finishes)
    await q("update matches set entry_a = (select entry_a from matches where id = $1), scheduled_at = '2030-03-01T08:00:00Z', court_id = $2 where id = $3", [m1.id, c2.id, final.id]);
    await expect(move(ORG, final.id, c2.id, "2030-03-01T04:10:00Z")).rejects.toThrow(/A player in this match is on Court A/);

    await as(ORG, () => q("select update_games($1, $2)", [m1.id, "[[1,0]]"]));
    await expect(move(ORG, m1.id, c2.id, "2030-03-01T09:00:00Z")).rejects.toThrow(/haven't started/);
  });

  it("questions: required answers, valid dates and choices are enforced at registration; only managers read answers", async () => {
    const { event, category } = await newCategory("knockout", "solo", 8);
    const fields = [
      { key: "tshirt", label: "T-shirt size", type: "choice", options: ["S", "M", "L"], required: true },
      { key: "joined", label: "Joined the academy", type: "date", required: false },
      { key: "note", label: "Anything else", type: "text", required: false },
    ];
    await expect(as(U[2], () => q("select update_event($1, $2)", [event, JSON.stringify({ reg_fields: fields })]))).rejects.toThrow(/organisers/);
    await expect(as(ORG, () => q("select update_event($1, $2)", [event, JSON.stringify({ reg_fields: [{ key: "Bad Key", label: "x", type: "text", required: false }] })])))
      .rejects.toThrow(/check constraint/);
    await as(ORG, () => q("select update_event($1, $2)", [event, JSON.stringify({ reg_fields: fields })]));

    const reg = (u: string, answers: object) =>
      as(u, () => one<{ id: string }>("select register_entry($1, null, null, null, null, '{}', null, $2) as id", [category, JSON.stringify(answers)]));
    await expect(reg(U[1], {})).rejects.toThrow(/Please answer "T-shirt size"/);
    await expect(reg(U[1], { tshirt: "XXL" })).rejects.toThrow(/Pick one of the options/);
    await expect(reg(U[1], { tshirt: "M", joined: "2024-02-30" })).rejects.toThrow(/real date/);
    const { id } = await reg(U[1], { tshirt: "M", joined: "2024-02-03", sneaky: "dropped" });

    await expect(as(null, () => q("select answers from entries where id = $1", [id]))).rejects.toThrow(/permission denied/);
    await expect(as(U[1], () => q("select * from entry_answers($1)", [event]))).rejects.toThrow(/organisers/);
    expect(await as(ORG, () => q("select answers from entry_answers($1) where entry_id = $2", [event, id])))
      .toEqual([{ answers: { tshirt: "M", joined: "2024-02-03" } }]);
  });

  it("UPI: players report their UTR; only managers see it; the organiser confirms", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4, 500);
    await expect(as(ORG, () => q("select set_upi_id($1, 'not a upi')", [event]))).rejects.toThrow(/check constraint/);
    await expect(as(U[2], () => q("select set_upi_id($1, 'thief@ybl')", [event]))).rejects.toThrow(/owner/);
    await as(ORG, () => q("select set_upi_id($1, 'smash@okhdfcbank')", [event]));
    const a = await register(U[1], category);

    await expect(as(U[2], () => q("select claim_payment($1, '412345678901')", [a]))).rejects.toThrow(/your own entry/);
    await expect(as(U[1], () => q("select claim_payment($1, '12')", [a]))).rejects.toThrow(/UTR/);
    await as(U[1], () => q("select claim_payment($1, ' 412345678901 ')", [a]));
    expect((await one("select status, payment_status from entries where id = $1", [a]))).toEqual({ status: "pending", payment_status: "claimed" });

    await expect(as(null, () => q("select payment_ref from entries where id = $1", [a]))).rejects.toThrow(/permission denied/);
    await expect(as(U[1], () => q("select * from payment_claims($1)", [event]))).rejects.toThrow(/organisers/);
    expect(await as(ORG, () => q("select payment_ref from payment_claims($1)", [event]))).toEqual([{ payment_ref: "412345678901" }]);

    await as(ORG, () => q("update entries set status = 'confirmed', payment_status = 'paid' where id = $1", [a]));
    await expect(as(U[1], () => q("select claim_payment($1, '412345678999')", [a]))).rejects.toThrow(/doesn't have a fee waiting/);
  });

  it("UPI fixes: only the owner sets the UPI ID; a UTR can't back two entries in one event", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4, 500);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [event]));
    await as(U[8], () => q("select join_staff($1)", [t]));
    await expect(as(U[8], () => q("select set_upi_id($1, 'co@ybl')", [event]))).rejects.toThrow(/owner/);
    await as(ORG, () => q("select set_upi_id($1, 'owner@okhdfcbank')", [event]));

    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await as(U[1], () => q("select claim_payment($1, '612345678901')", [a]));
    await expect(as(U[2], () => q("select claim_payment($1, '612345678901')", [b]))).rejects.toThrow(/already been used/);
    await as(U[1], () => q("select claim_payment($1, '612345678901')", [a])); // resending your own UTR is fine
  });

  it("UTR race fix: claim_payment takes an event-level lock before checking for reuse", async () => {
    const { src } = await one<{ src: string }>("select prosrc as src from pg_proc where proname = 'claim_payment'");
    expect(src).toMatch(/pg_advisory_xact_lock\(hashtext\('claim_payment:'/);
    expect(src.indexOf("pg_advisory_xact_lock")).toBeLessThan(src.indexOf("already been used"));
  });

  it("UTR unique index: the database refuses a reused UTR on any path; resubmitting your own still works", async () => {
    const one1 = await newCategory("knockout", "solo", 4, 500);
    const one2 = await newCategory("knockout", "solo", 4, 500);
    const a = await register(U[1], one1.category);
    const b = await register(U[2], one1.category);
    const c = await register(U[3], one2.category);
    await as(U[1], () => q("select claim_payment($1, '512345678901')", [a]));
    await as(U[1], () => q("select claim_payment($1, '512345678901')", [a])); // own resubmit is fine
    // straight into the table, skipping claim_payment's check: the index itself refuses it
    await expect(q("update entries set payment_ref = '512345678901' where id = $1", [b])).rejects.toThrow(/unique|duplicate key/);
    await expect(as(U[3], () => q("select claim_payment($1, '512345678901')", [c]))).rejects.toThrow(/already been used/); // other event too
  });

  it("Release unpaid: after entries close, unpaid places free up; reported payments wait for the organiser", async () => {
    const { event, category } = await newCategory("knockout", "solo", 2, 500);
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await as(U[2], () => q("select claim_payment($1, '812345678901')", [b]));
    expect(await as(null, () => one("select release_unpaid_entries($1) as n", [event]))).toEqual({ n: 0 }); // still open
    await expect(as(ORG, () => q(`select add_entries($1, '[{"name": "Walk-in"}]')`, [category]))).rejects.toThrow(/spots left/);

    await q("update events set reg_closes_at = now() - interval '1 hour' where id = $1", [event]);
    expect(await as(null, () => one("select release_unpaid_entries($1) as n", [event]))).toEqual({ n: 1 });
    expect((await one<{ status: string }>("select status from entries where id = $1", [a])).status).toBe("withdrawn");
    expect(await one("select status, payment_status from entries where id = $1", [b])).toEqual({ status: "pending", payment_status: "claimed" });
    await as(ORG, () => q(`select add_entries($1, '[{"name": "Walk-in"}]')`, [category])); // the freed place is taken
  });

  it("Import fees: walk-ins in a paid category owe the fee; free categories confirm straight away", async () => {
    const paid = await newCategory("knockout", "solo", 4, 500);
    const free = await newCategory("knockout", "solo", 4, 0);
    await as(ORG, () => q(`select add_entries($1, '[{"name": "Payer"}]')`, [paid.category]));
    await as(ORG, () => q(`select add_entries($1, '[{"name": "Freebie"}]')`, [free.category]));
    expect(await one("select status, payment_status from entries where display_name = 'Payer'")).toEqual({ status: "pending", payment_status: "unpaid" });
    expect(await one("select status, payment_status from entries where display_name = 'Freebie'")).toEqual({ status: "confirmed", payment_status: "not_required" });
    // Mark paid (updateEntry op paid) still confirms the walk-in
    await as(ORG, () => q("update entries set status = 'confirmed', payment_status = 'paid' where display_name = 'Payer'"));
    expect(await one("select status, payment_status from entries where display_name = 'Payer'")).toEqual({ status: "confirmed", payment_status: "paid" });
  });

  it("Categories: managers edit name, fee and limit until the draw; can't undercut entries; add after publish", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4, 500);
    const a = await register(U[1], category);
    const b = await register(U[2], category);
    await expect(as(U[5], () => q("select update_category($1, 'Hijack', 0, 4)", [category]))).rejects.toThrow(/organisers/);
    await expect(as(ORG, () => q("select update_category($1, 'Open', 500, 1)", [category]))).rejects.toThrow(/already has 2 entries/);
    await as(ORG, () => q("select update_category($1, ' Men''s Open ', 500, 8)", [category]));
    expect(await one("select name, entry_fee, max_entries from categories where id = $1", [category])).toEqual({ name: "Men's Open", entry_fee: 500, max_entries: 8 });

    await as(U[1], () => q("select claim_payment($1, '912345678901')", [a]));
    await expect(as(ORG, () => q("select update_category($1, 'Open', 300, 8)", [category]))).rejects.toThrow(/already paid/);
    await as(ORG, () => q("select reject_payment($1, 'test')", [a]));
    await as(ORG, () => q("select update_category($1, 'Open', 0, 8)", [category])); // free now: waiting entries confirm
    expect((await one<{ status: string }>("select status from entries where id = $1", [b])).status).toBe("confirmed");

    const cat = { name: "Women's Open", format: "league", entry_type: "solo", max_entries: 6, entry_fee: 200 };
    await expect(as(U[5], () => q("select add_category($1, $2)", [event, JSON.stringify(cat)]))).rejects.toThrow(/organisers/);
    const { id } = await as(ORG, () => one<{ id: string }>("select add_category($1, $2) as id", [event, JSON.stringify(cat)]));
    expect(await one("select name, format, max_entries, entry_fee, sort from categories where id = $1", [id]))
      .toEqual({ name: "Women's Open", format: "league", max_entries: 6, entry_fee: 200, sort: 1 });
    await expect(as(ORG, () => q("select add_category($1, $2)", [event, JSON.stringify(cat)]))).rejects.toThrow(/already called/);
    const c = await register(U[3], category);
    await as(ORG, () => q("select save_fixtures($1, $2)", [category, JSON.stringify(knockout([a, b, c]))]));
    await expect(as(ORG, () => q("select update_category($1, 'Late', 0, 8)", [category]))).rejects.toThrow(/Fixtures are drawn/);
    await expect(as(ORG, () => q("select add_category($1, $2)", [event, JSON.stringify({ ...cat, name: "Kids" })]))).rejects.toThrow(/before the tournament starts/); // live now
    await q("update events set status = 'cancelled' where id = $1", [event]);
    await expect(as(ORG, () => q("select add_category($1, $2)", [event, JSON.stringify({ ...cat, name: "Kids" })]))).rejects.toThrow(/before the tournament starts/);
  });

  it("Announcements: managers message entrants; only the owner reaches past players, never another organiser's", async () => {
    await q("update auth.users set email = 'player' || right(id::text, 2) || '@example.com'");
    const OWN = U[7]; // its own organiser, so other tests' events don't count as "past players"
    let k = 0;
    const eventBy = async (who: string) => {
      const e = await as(who, () => one<{ id: string }>(
        `insert into events (slug, title, sport, venue, starts_at, reg_closes_at)
         values ($1, 'Announce test', 'badminton', 'Hall', now() + interval '7 days', now() + interval '6 days') returning id`, [`announce-${++k}`]));
      const c = await one<{ id: string }>("insert into categories (event_id, name, format, entry_type, max_entries) values ($1, 'Open', 'knockout', 'solo', 8) returning id", [e.id]);
      return { event: e.id, category: c.id };
    };
    const past = await eventBy(OWN);
    await register(U[1], past.category);
    await register(U[2], past.category);
    const other = await eventBy(U[6]);
    await register(U[3], other.category);

    const cur = await eventBy(OWN);
    await register(U[2], cur.category);
    await register(U[4], cur.category);
    const { t } = await as(OWN, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [cur.event]));
    await as(U[8], () => q("select join_staff($1)", [t]));

    const audience = (who: string, kind: string) => as(who, () => q<{ email: string }>("select email from message_audience($1, $2) order by email", [cur.event, kind]));
    expect(await audience(OWN, "promotion")).toEqual([{ email: "player01@example.com" }]); // not U2 (already in), not U3 (someone else's)
    await expect(audience(U[8], "promotion")).rejects.toThrow(/owner/);
    await expect(audience(U[5], "general_info")).rejects.toThrow(/organisers/);
    expect((await audience(U[8], "general_info")).map((r) => r.email)).toEqual(["player02@example.com", "player04@example.com"]);

    const send = (who: string, kind: string, msg: string) => as(who, () => q<{ email: string; payload: { message: string } }>("select * from queue_message($1, $2, $3)", [cur.event, kind, msg]));
    await expect(send(U[5], "general_info", "Hello everyone")).rejects.toThrow(/organisers/);
    const first = await send(OWN, "general_info", "Parking is at gate 2");
    expect(first.map((r) => r.email).sort()).toEqual(["player02@example.com", "player04@example.com"]);
    expect(first[0].payload.message).toBe("Parking is at gate 2");
    expect(await send(OWN, "general_info", "Parking is at gate 2")).toEqual([]); // no double email
    expect(await send(OWN, "promotion", "Our next open is live, enter now")).toHaveLength(1);
    // on-demand fixtures announcement reuses queue_notifications with its own round
    const fx = await as(OWN, () => q("select * from queue_notifications($1, 'fixtures_released', null, null, 'manual-1')", [cur.event]));
    expect(fx).toHaveLength(2);

    await q("update events set status = 'draft' where id = $1", [cur.event]);
    expect(await send(OWN, "general_info", "Draft events say nothing")).toEqual([]);
  });

  it("Reject payment: only managers reject a claimed payment; the player sees why and can claim again", async () => {
    const { event, category } = await newCategory("knockout", "solo", 4, 500);
    const { t } = await as(ORG, () => one<{ t: string }>("select create_staff_invite($1, 'Co') as t", [event]));
    await as(U[8], () => q("select join_staff($1)", [t]));
    const a = await register(U[1], category);
    await expect(as(ORG, () => q("select reject_payment($1, 'x')", [a]))).rejects.toThrow(/reported/); // nothing claimed yet
    await as(U[1], () => q("select claim_payment($1, '712345678901')", [a]));

    await expect(as(U[2], () => q("select reject_payment($1, 'nope')", [a]))).rejects.toThrow(/organisers/);
    await expect(as(U[1], () => q("select reject_payment($1, 'nope')", [a]))).rejects.toThrow(/organisers/);
    await as(U[8], () => q("select reject_payment($1, '  Not in my bank statement  ')", [a])); // co-organiser can
    expect(await one("select status, payment_status, payment_ref, payment_claimed_at from entries where id = $1", [a]))
      .toEqual({ status: "pending", payment_status: "unpaid", payment_ref: null, payment_claimed_at: null });

    await expect(as(null, () => q("select payment_rejection from entries where id = $1", [a]))).rejects.toThrow(/permission denied/);
    expect(await as(U[1], () => one("select my_payment_note($1) as n", [a]))).toEqual({ n: "Not in my bank statement" });
    expect(await as(U[2], () => one("select my_payment_note($1) as n", [a]))).toEqual({ n: null });

    await as(U[1], () => q("select claim_payment($1, '712345678902')", [a]));
    expect(await one("select payment_status, payment_rejection from entries where id = $1", [a])).toEqual({ payment_status: "claimed", payment_rejection: null });
    await as(ORG, () => q("select reject_payment($1, '')", [a])); // blank reason gets a default
    expect(await as(U[1], () => one("select my_payment_note($1) as n", [a]))).toEqual({ n: "The organiser couldn't find this payment" });
  });
});

