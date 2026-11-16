// Runs the real migrations (0001 then 0002, as in production) in an in-memory Postgres (PGlite) with stubs for
// the bits Supabase provides (auth schema, roles, realtime publication), then plays events end to end
// through the same functions and RLS the app uses.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { separateClubs } from "../src/lib/fixtures/clubs";
import { doubleElim } from "../src/lib/fixtures/doubleElim";
import { knockout } from "../src/lib/fixtures/knockout";
import { GAME_CASES } from "../src/lib/fixtures/scoring.cases";

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
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
  for (const f of (process.env.MIGRATIONS ?? "0001_init.sql,0002_events.sql,0003_posters.sql,0004_sports.sql,0005_hardening.sql").split(",")) {
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
      .rejects.toThrow(/row-level security/);
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
    await as(ORG, () => q("update events set poster_url = 'https://example.com/x.jpg', status = 'open' where id = $1", [event]));
    await expect(as(ORG, () => q("update entries set user_id = $1 where id = $2", [U[3], id]))).rejects.toThrow(/permission denied/);
    await as(ORG, () => q("update entries set seed = 1, status = 'confirmed', payment_status = 'paid' where id = $1", [id]));
    expect((await one("select seed from entries where id = $1", [id])).seed).toBe(1);
  });
});

