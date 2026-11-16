"use server";

import { revalidatePath } from "next/cache";
import { advance } from "@/lib/fixtures/advance";
import { separateClubs } from "@/lib/fixtures/clubs";
import { doubleElim } from "@/lib/fixtures/doubleElim";
import { groups, qualifiers } from "@/lib/fixtures/groups";
import { knockout } from "@/lib/fixtures/knockout";
import { league } from "@/lib/fixtures/league";
import { schedule, type SchedMatch } from "@/lib/fixtures/schedule";
import { standings } from "@/lib/fixtures/standings";
import type { Match, StageKind } from "@/lib/fixtures/types";
import { capFor, FORMATS, LAUNCH_SPORTS, SPORT_DEFAULTS, type Format, type Sport } from "@/lib/sports";
import { supabaseServer } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string } | undefined;
type Sb = Awaited<ReturnType<typeof supabaseServer>>;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "tournament";
const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const whole = (v: unknown) => Math.trunc(Number(v));

export type NewCategory = {
  name: string; format: string; groupCount: number; entryType: string; teamSize: number; maxEntries: number; entryFee: number;
  bestOf: number; pointsTo: number; bornOnOrAfter: string | null; bornOnOrBefore: string | null;
};
export type NewEvent = {
  title: string; sport: string; venue: string; area: string; prize: string; rules: string;
  startsAt: string; regClosesAt: string; courts: number; matchMinutes: number; breakMinutes: number; ageCheck: string; categories: NewCategory[];
};

/** Creates the event as a draft, adds categories, courts and referee links, then opens it. */
export async function createEvent(d: NewEvent): Promise<ActionState & { slug?: string; id?: string }> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: "Log in to publish a tournament." };

  // Re-check everything the form checked: this is the trust boundary.
  const title = str(d.title, 120);
  if (title.length < 4) return { error: "The name must be at least 4 characters." };
  if (!LAUNCH_SPORTS.includes(d.sport as Sport)) return { error: "Choose a sport." };
  if (!str(d.venue)) return { error: "Add the venue." };
  const starts = new Date(d.startsAt);
  const closes = new Date(d.regClosesAt);
  if (isNaN(+starts) || isNaN(+closes)) return { error: "Check the dates." };
  if (closes > starts) return { error: "Entries must close before the first match." };
  if (+closes < Date.now()) return { error: "Entries must close in the future." };
  const courts = whole(d.courts);
  if (!(courts >= 1 && courts <= 40)) return { error: "Use between 1 and 40 courts." };
  const matchMinutes = whole(d.matchMinutes);
  const breakMinutes = whole(d.breakMinutes);
  if (!(matchMinutes >= 5 && matchMinutes <= 240) || !(breakMinutes >= 0 && breakMinutes <= 60)) return { error: "Check the match length." };
  if (!Array.isArray(d.categories) || d.categories.length < 1 || d.categories.length > 30) return { error: "Add at least one category." };
  const racquet = SPORT_DEFAULTS[d.sport as Sport].scoring.kind === "games";
  const names = new Set<string>();
  for (const c of d.categories) {
    const n = str(c.name, 60);
    if (n.length < 2) return { error: "Every category needs a name." };
    if (names.has(n.toLowerCase())) return { error: `Two categories are called "${n}".` };
    names.add(n.toLowerCase());
    if (!(c.format in FORMATS)) return { error: `Choose a format for ${n}.` };
    if (!["solo", "pair", "team"].includes(c.entryType)) return { error: `Choose who enters ${n}.` };
    if (racquet && (![1, 3, 5].includes(whole(c.bestOf)) || !(whole(c.pointsTo) >= 5 && whole(c.pointsTo) <= 50))) {
      return { error: `${n}: check the game scoring.` };
    }
    for (const day of [c.bornOnOrAfter, c.bornOnOrBefore]) if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: `${n}: check the age limit.` };
    const max = whole(c.maxEntries);
    if (!(max >= 2 && max <= 128)) return { error: `${n}: allow between 2 and 128 entries.` };
    if (!(whole(c.entryFee) >= 0)) return { error: `${n}: the fee can't be negative.` };
    if (c.format === "groups_knockout" && !(whole(c.groupCount) >= 2 && max >= whole(c.groupCount) * 2)) {
      return { error: `${n}: each group needs at least two entries.` };
    }
  }

  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: ev, error } = await sb.from("events").insert({
    slug, title, sport: d.sport, venue: str(d.venue, 120), area: str(d.area, 120), prize: str(d.prize),
    rules: String(d.rules ?? "").split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 30),
    starts_at: starts.toISOString(), reg_closes_at: closes.toISOString(), match_minutes: matchMinutes,
    break_minutes: breakMinutes, age_check: d.ageCheck === "desk" ? "desk" : "self", status: "draft",
  }).select("id").single();
  if (error) return { error: `Couldn't publish: ${error.message}` };

  const steps = await Promise.all([
    sb.from("categories").insert(d.categories.map((c, i) => ({
      event_id: ev.id, name: str(c.name, 60), format: c.format, entry_type: c.entryType, sort: i,
      group_count: c.format === "groups_knockout" ? whole(c.groupCount) : null,
      team_size: c.entryType === "team" ? Math.min(30, Math.max(2, whole(c.teamSize) || 2)) : c.entryType === "pair" ? 2 : 1,
      max_entries: whole(c.maxEntries), entry_fee: whole(c.entryFee),
      scoring: racquet ? "games" : "goals", best_of: racquet ? whole(c.bestOf) : 1, points_to: racquet ? whole(c.pointsTo) : 21,
      points_cap: racquet ? capFor(d.sport as Sport, whole(c.pointsTo)) : null,
      born_on_or_after: c.bornOnOrAfter || null, born_on_or_before: c.bornOnOrBefore || null,
    }))),
    sb.from("courts").insert(Array.from({ length: courts }, (_, i) => ({ event_id: ev.id, name: `Court ${i + 1}`, sort: i }))).select("id"),
  ]);
  const failed = steps.find((s) => s.error);
  if (failed) {
    await sb.from("events").delete().eq("id", ev.id); // drafts can be deleted by their organiser
    return { error: `Couldn't publish: ${failed.error!.message}` };
  }
  const courtRows = (steps[1].data ?? []) as { id: string }[];
  await sb.from("referee_links").insert([{ event_id: ev.id, court_id: null }, ...courtRows.map((c) => ({ event_id: ev.id, court_id: c.id }))]);
  await sb.from("events").update({ status: "open" }).eq("id", ev.id);
  revalidatePath("/tournaments");
  return { ok: "Published", slug, id: ev.id }; // the browser uploads the poster (if any), then opens the page
}

const done = (slug: FormDataEntryValue | null, ok: string): ActionState => {
  revalidatePath(`/t/${String(slug)}`);
  return { ok };
};

export async function register(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const category = String(form.get("category"));
  const teamName = form.get("team")?.toString().trim();
  const dateOrNull = (k: string) => {
    const v = form.get(k)?.toString().trim();
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const roster = String(form.get("roster") ?? "").split("\n").map((r) => r.trim().slice(0, 80)).filter(Boolean).slice(0, 30);
  let teamId: string | null = null;
  if (teamName !== undefined) {
    if (teamName.length < 2 || teamName.length > 60) return { error: "Team names are 2 to 60 characters." };
    // shortcut: if registration then fails, the empty team stays behind; add a delete policy if that piles up
    const { data, error } = await sb.from("teams").insert({ name: teamName }).select("id").single();
    if (error) return { error: `Couldn't create the team: ${error.message}` };
    teamId = data.id;
  }
  const { error } = await sb.rpc("register_entry", {
    p_category: category, p_team: teamId, p_partner: form.get("partner")?.toString().trim() || null,
    p_dob: dateOrNull("dob"), p_partner_dob: dateOrNull("partner_dob"), p_roster: roster,
  });
  if (error) return { error: error.message.includes("duplicate") ? "You're already registered in this category." : error.message };
  return done(form.get("slug"), "You're in.");
}

/** Organiser pastes one entry per line: "Name" or "Name, Club" (a tab works too). */
export async function addEntries(_: ActionState, form: FormData): Promise<ActionState> {
  const rows = String(form.get("names") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, ...club] = l.split(/\t|,/);
    return { name: name.trim().slice(0, 80), club: club.join(",").trim().slice(0, 80) };
  }).filter((r) => r.name);
  if (!rows.length) return { error: "Type at least one name." };
  if (rows.length > 128) return { error: "Add at most 128 at a time." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_entries", { p_category: String(form.get("category")), p_rows: rows });
  if (error) return { error: error.message };
  return done(form.get("slug"), `Added ${rows.length} ${rows.length === 1 ? "entry" : "entries"}.`);
}

export async function updateEntry(form: FormData) {
  const sb = await supabaseServer();
  const id = String(form.get("entry"));
  const op = String(form.get("op"));
  if (op === "paid") await sb.from("entries").update({ status: "confirmed", payment_status: "paid" }).eq("id", id);
  if (op === "remove") await sb.from("entries").delete().eq("id", id);
  if (op === "seed") {
    const seed = form.get("seed")?.toString().trim();
    const n = seed ? whole(seed) : null;
    if (n === null || (n >= 1 && n <= 999)) await sb.from("entries").update({ seed: n }).eq("id", id);
  }
  revalidatePath(`/t/${String(form.get("slug"))}`);
}

function build(format: Format, ids: string[], groupCount: number, club: (id: string) => string): Match[] {
  if (format === "knockout") return separateClubs(knockout(ids), club);
  if (format === "double_elim") return separateClubs(doubleElim(ids), club);
  if (format === "league") return league(ids);
  return groups(ids, Math.min(groupCount, Math.floor(ids.length / 2)), club).matches;
}

/** Gives every unplayed match in the event a court and time. From now when the event is under way. */
async function scheduleEvent(sb: Sb, eventId: string): Promise<string | undefined> {
  const [{ data: ev }, { data: courts }, { data: rows }] = await Promise.all([
    sb.from("events").select("starts_at, match_minutes, break_minutes").eq("id", eventId).single(),
    sb.from("courts").select("id").eq("event_id", eventId).order("sort"),
    sb.from("matches").select("*").eq("event_id", eventId),
  ]);
  if (!ev || !courts?.length || !rows) return "Add a court before scheduling.";
  const ms: SchedMatch[] = rows.map((m) => ({
    id: m.id, category: m.category_id, key: m.key, stage: m.stage, round: m.round, slot: m.slot,
    a: m.a_bye ? "BYE" : m.entry_a, b: m.b_bye ? "BYE" : m.entry_b, status: m.status, walkover: m.walkover,
    next: m.next_key ? { key: m.next_key, side: m.next_side } : undefined,
    loserNext: m.loser_next_key ? { key: m.loser_next_key, side: m.loser_next_side } : undefined,
    court: m.court_id, at: m.scheduled_at ? new Date(m.scheduled_at) : null,
    startedAt: m.started_at ? new Date(m.started_at) : null, finishedAt: m.finished_at ? new Date(m.finished_at) : null,
  }));
  const slots = schedule(ms, courts.map((c) => c.id), {
    start: new Date(ev.starts_at), slotMinutes: ev.match_minutes + ev.break_minutes, now: new Date(),
  });
  if (!slots.length) return;
  const { error } = await sb.rpc("save_schedule", {
    p_event: eventId, p_rows: slots.map((s) => ({ id: s.id, court: s.court, at: s.at.toISOString() })),
  });
  return error?.message;
}

export async function drawFixtures(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const category = String(form.get("category"));
  const { data: c } = await sb.from("categories").select("event_id, format, group_count").eq("id", category).single();
  const { data: entries } = await sb.from("entries").select("id, club").eq("category_id", category).eq("status", "confirmed")
    .order("seed", { nullsFirst: false }).order("created_at");
  if (!c || !entries) return { error: "Couldn't load the category." };
  const min = c.format === "groups_knockout" ? 4 : 2;
  if (entries.length < min) return { error: `You need at least ${min} confirmed entries to draw fixtures.` };

  const club = new Map(entries.map((e) => [e.id, e.club as string]));
  const fixtures = build(c.format, entries.map((e) => e.id), c.group_count ?? 4, (id) => club.get(id) ?? "");
  const { error } = await sb.rpc("save_fixtures", { p_category: category, p_matches: fixtures });
  if (error) return { error: error.message };
  const schedErr = await scheduleEvent(sb, c.event_id);
  return done(form.get("slug"), schedErr ? `Fixtures drawn. ${schedErr}` : "Fixtures drawn and scheduled.");
}

/** Groups + knockout: once every group match is done, the top two of each group go into a bracket. */
export async function drawKnockout(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const category = String(form.get("category"));
  const { data: c } = await sb.from("categories").select("event_id").eq("id", category).single();
  const { data: rows } = await sb.from("matches")
    .select("key, stage, grp, round, slot, entry_a, entry_b, score_a, score_b, status")
    .eq("category_id", category).eq("stage", "group");
  if (!c || !rows?.length) return { error: "Draw the group stage first." };
  if (rows.some((m) => m.status !== "done")) return { error: "Finish every group match before drawing the knockout." };

  const tables: Record<string, string[]> = {};
  for (const g of new Set(rows.map((m) => m.grp as string))) {
    const ms = rows.filter((m) => m.grp === g);
    const ids = [...new Set(ms.flatMap((m) => [m.entry_a, m.entry_b]))] as string[];
    const played = advance(
      ms.map((m) => ({ key: m.key, stage: m.stage as StageKind, group: g, round: m.round, slot: m.slot, a: m.entry_a, b: m.entry_b })),
      Object.fromEntries(ms.map((m) => [m.key, { a: m.score_a ?? 0, b: m.score_b ?? 0 }])),
    );
    tables[g] = standings(ids, played).map((r) => r.entry);
  }
  const { error } = await sb.rpc("save_fixtures", { p_category: category, p_matches: knockout(qualifiers(tables, 2)) });
  if (error) return { error: error.message };
  const schedErr = await scheduleEvent(sb, c.event_id);
  return done(form.get("slug"), schedErr ? `Knockout drawn. ${schedErr}` : "Knockout drawn and scheduled.");
}

export async function reschedule(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const err = await scheduleEvent(sb, String(form.get("event")));
  return err ? { error: err } : done(form.get("slug"), "Order of play updated.");
}

export async function checkIn(form: FormData) {
  const sb = await supabaseServer();
  await sb.rpc("check_in", {
    p_entry: String(form.get("entry")), p_present: form.get("present") === "1", p_id_checked: form.get("id") === "1",
  });
  revalidatePath(`/t/${String(form.get("slug"))}/desk`);
}

export async function awardWalkover(form: FormData) {
  const sb = await supabaseServer();
  await sb.rpc("award_walkover", { p_match: String(form.get("match")), p_winner: String(form.get("winner")) });
  revalidatePath(`/t/${String(form.get("slug"))}`, "layout");
}
