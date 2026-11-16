"use server";

import { CONFIRM_ERROR, isConfirmed } from "@/lib/confirm";
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
import { readEntriesCsv } from "@/lib/csv-import";
import { answersFrom, fieldKey, type RegField } from "@/lib/reg-fields";
import { notify, announce } from "@/lib/notify";
import { validUpiId } from "@/lib/upi";
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
    const bad = checkCategory(c, n, racquet);
    if (bad) return { error: bad };
  }

  const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
  // One transaction in Postgres: the event, its categories, courts and referee links all exist, or none do.
  const { data, error } = await sb.rpc("publish_event", {
    p_event: {
      slug, title, sport: d.sport, venue: str(d.venue, 120), area: str(d.area, 120), prize: str(d.prize),
      rules: String(d.rules ?? "").split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 30),
      starts_at: starts.toISOString(), reg_closes_at: closes.toISOString(), match_minutes: matchMinutes,
      break_minutes: breakMinutes, age_check: d.ageCheck === "desk" ? "desk" : "self",
    },
    p_categories: d.categories.map((c) => categoryRow(c, d.sport as Sport)),
    p_courts: courts,
  });
  if (error) return { error: `Couldn't publish: ${error.message}` };
  const ev = data as { id: string; slug: string };
  revalidatePath("/tournaments");
  return { ok: "Published", slug: ev.slug, id: ev.id }; // the browser uploads the poster (if any), then opens the page
}

/** The wizard's checks for one category, shared with adding a category after publishing. */
function checkCategory(c: NewCategory, n: string, racquet: boolean): string | null {
  if (!(c.format in FORMATS)) return `Choose a format for ${n}.`;
  if (!["solo", "pair", "team"].includes(c.entryType)) return `Choose who enters ${n}.`;
  if (racquet && (![1, 3, 5].includes(whole(c.bestOf)) || !(whole(c.pointsTo) >= 5 && whole(c.pointsTo) <= 50))) {
    return `${n}: check the game scoring.`;
  }
  for (const day of [c.bornOnOrAfter, c.bornOnOrBefore]) if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${n}: check the age limit.`;
  const max = whole(c.maxEntries);
  if (!(max >= 2 && max <= 128)) return `${n}: allow between 2 and 128 entries.`;
  if (!(whole(c.entryFee) >= 0)) return `${n}: the fee can't be negative.`;
  if (c.format === "groups_knockout" && !(whole(c.groupCount) >= 2 && max >= whole(c.groupCount) * 2)) {
    return `${n}: each group needs at least two entries.`;
  }
  return null;
}

/** One category as publish_event / add_category expect it. */
function categoryRow(c: NewCategory, sport: Sport) {
  const racquet = SPORT_DEFAULTS[sport].scoring.kind === "games";
  return {
    name: str(c.name, 60), format: c.format, entry_type: c.entryType,
    group_count: c.format === "groups_knockout" ? whole(c.groupCount) : null,
    team_size: c.entryType === "team" ? Math.min(30, Math.max(2, whole(c.teamSize) || 2)) : c.entryType === "pair" ? 2 : 1,
    max_entries: whole(c.maxEntries), entry_fee: whole(c.entryFee),
    scoring: racquet ? "games" : "goals", best_of: racquet ? whole(c.bestOf) : 1, points_to: racquet ? whole(c.pointsTo) : 21,
    points_cap: racquet ? capFor(sport, whole(c.pointsTo)) : null,
    born_on_or_after: c.bornOnOrAfter || null, born_on_or_before: c.bornOnOrBefore || null,
  };
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
  if (teamName !== undefined && (teamName.length < 2 || teamName.length > 60)) return { error: "Team names are 2 to 60 characters." };
  const { error } = await sb.rpc("register_entry", {
    p_category: category, p_team: null, p_team_name: teamName ?? null, p_partner: form.get("partner")?.toString().trim() || null,
    p_dob: dateOrNull("dob"), p_partner_dob: dateOrNull("partner_dob"), p_roster: roster,
    p_answers: answersFrom(await eventFieldsFor(sb, category), (k) => form.get(k)),
  });
  if (error) {
    if (!error.message.includes("duplicate")) return { error: error.message };
    // one entry per player per category: a withdrawn entry still holds that slot
    const { data: auth } = await sb.auth.getUser();
    const { data: old } = await sb.from("entries").select("status").eq("category_id", category).eq("user_id", auth.user?.id ?? "").maybeSingle();
    return { error: old?.status === "withdrawn"
      ? "You withdrew from this category earlier. Ask the organiser to put you back in."
      : "You're already registered in this category." };
  }
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

/** Organiser edits to an entry. RLS turns a stranger's update into "0 rows", so count rows instead of trusting no-error. */
export async function updateEntry(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const id = String(form.get("entry"));
  const op = String(form.get("op"));
  let res;
  if (op === "paid") res = await sb.from("entries").update({ status: "confirmed", payment_status: "paid" }).eq("id", id).select("id");
  else if (op === "remove" && !isConfirmed(form)) return { error: CONFIRM_ERROR };
  else if (op === "remove") res = await sb.from("entries").delete().eq("id", id).select("id");
  else if (op === "seed") {
    const raw = form.get("seed")?.toString().trim();
    const seed = raw ? whole(raw) : null;
    if (seed !== null && !(seed >= 1 && seed <= 999)) return { error: "Seeds are 1 to 999." };
    res = await sb.from("entries").update({ seed }).eq("id", id).select("id");
  } else return { error: "Unknown change." };
  if (res.error) return { error: res.error.message };
  if (!res.data?.length) {
    return { error: op === "remove" ? "Couldn't remove: only organisers can, and only before the draw." : "Only this event's organisers can change entries." };
  }
  return done(form.get("slug"), op === "paid" ? "Marked paid." : op === "remove" ? "Removed." : "Seed saved.");
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
  const told = await notify(sb, c.event_id, "fixtures_released", { category, round: `draw-${Date.now()}` });
  return done(form.get("slug"), `${schedErr ? `Fixtures drawn. ${schedErr}` : "Fixtures drawn and scheduled."} ${told}`);
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
  const told = await notify(sb, c.event_id, "fixtures_released", { category, round: `knockout-${Date.now()}` });
  return done(form.get("slug"), `${schedErr ? `Knockout drawn. ${schedErr}` : "Knockout drawn and scheduled."} ${told}`);
}

export async function reschedule(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const err = await scheduleEvent(sb, String(form.get("event")));
  if (err) return { error: err };
  const told = await notify(sb, String(form.get("event")), "schedule_update", { round: `replan-${Date.now()}` });
  return done(form.get("slug"), `Order of play updated. ${told}`);
}

export async function checkIn(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const present = form.get("present") === "1";
  const { error } = await sb.rpc("check_in", {
    p_entry: String(form.get("entry")), p_present: present, p_id_checked: form.get("id") === "1",
  });
  if (error) return { error: error.message };
  revalidatePath(`/t/${String(form.get("slug"))}/desk`);
  return { ok: present ? "Checked in." : "Check-in undone." };
}

export async function awardWalkover(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("award_walkover", { p_match: String(form.get("match")), p_winner: String(form.get("winner")) });
  if (error) return { error: error.message };
  revalidatePath(`/t/${String(form.get("slug"))}`, "layout");
  return { ok: "Walkover recorded." };
}

/** Risk 5: revoke a referee link and issue a fresh one for the same court. */
export async function rotateRefereeLink(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("rotate_referee_link", { p_token: String(form.get("token")) });
  if (error) return { error: error.message };
  return done(form.get("slug"), "New link ready. The old one no longer works.");
}

// ---------- P0.2: edit an event after publishing ----------
const istDate = (date: string, time: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? new Date(`${date}T${time}:00+05:30`) : null);

export async function updateEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const get = (k: string, max = 200) => str(form.get(k), max);
  const title = get("title", 120);
  if (title.length < 4) return { error: "The name must be at least 4 characters." };
  const venue = get("venue", 120);
  if (!venue) return { error: "Add the venue." };
  const starts = istDate(get("start_date"), get("start_time"));
  const closes = istDate(get("close_date"), get("close_time"));
  if (!starts || !closes) return { error: "Check the dates and times." };
  if (closes > starts) return { error: "Entries must close before the first match." };
  const matchMinutes = whole(form.get("match_minutes"));
  const breakMinutes = whole(form.get("break_minutes") || 0);
  if (!(matchMinutes >= 5 && matchMinutes <= 240)) return { error: "A match takes between 5 and 240 minutes." };
  if (!(breakMinutes >= 0 && breakMinutes <= 60)) return { error: "Breaks are 0 to 60 minutes." };
  const rules = String(form.get("rules") ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
  if (rules.length > 30) return { error: "Keep it to 30 rules or fewer." };

  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_event", {
    p_event: String(form.get("event")),
    p: {
      title, venue, area: get("area", 120), prize: get("prize"), rules,
      starts_at: starts.toISOString(), reg_closes_at: closes.toISOString(),
      match_minutes: matchMinutes, break_minutes: breakMinutes, age_check: form.get("age_check") === "desk" ? "desk" : "self",
    },
  });
  if (error) return { error: error.message.includes("check constraint") ? "Entries must close before the first match." : error.message };
  return done(form.get("slug"), "Saved. If you moved the start time, use Re-plan from now on the order of play.");
}

export async function addCourt(_: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form.get("name"), 40);
  if (!name) return { error: "Name the court." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_court", { p_event: String(form.get("event")), p_name: name });
  if (error) return { error: error.message };
  return done(form.get("slug"), `${name} added, with its own referee link.`);
}

export async function renameCourt(_: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form.get("name"), 40);
  if (!name) return { error: "Name the court." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("rename_court", { p_court: String(form.get("court")), p_name: name });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Renamed.");
}

export async function setCategoryStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const status = String(form.get("status"));
  if (!["open", "locked", "cancelled"].includes(status)) return { error: "Unknown change." };
  if (status === "cancelled" && !isConfirmed(form)) return { error: CONFIRM_ERROR };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_category_status", { p_category: String(form.get("category")), p_status: status });
  if (error) return { error: error.message };
  return done(form.get("slug"), status === "locked" ? "Entries closed." : status === "open" ? "Entries reopened." : "Category cancelled.");
}

export async function closeAllEntries(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("close_all_entries", { p_event: String(form.get("event")) });
  if (error) return { error: error.message };
  return done(form.get("slug"), data ? `Entries closed in ${data} ${data === 1 ? "category" : "categories"}.` : "Entries were already closed.");
}

export async function cancelEvent(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfirmed(form)) return { error: CONFIRM_ERROR };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cancel_event", { p_event: String(form.get("event")) });
  if (error) return { error: error.message };
  revalidatePath("/tournaments");
  revalidatePath("/organise");
  const told = await notify(sb, String(form.get("event")), "event_cancelled", { round: "cancel" });
  return done(form.get("slug"), `Tournament cancelled. ${told}`);
}

// ---------- P0.5: staff ----------
export async function createStaffInvite(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("create_staff_invite", { p_event: String(form.get("event")), p_note: str(form.get("note"), 80) });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Invite link ready below. It works once, for 7 days.");
}

export async function revokeStaffInvite(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("revoke_staff_invite", { p_token: String(form.get("token")) });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Invite withdrawn.");
}

export async function removeOfficial(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("remove_official", { p_event: String(form.get("event")), p_user: String(form.get("user")) });
  if (error) return { error: error.message };
  revalidatePath("/organise");
  return done(form.get("slug"), "Removed. Their access has ended.");
}

// ---------- P0.7: players withdraw before the draw ----------
export async function withdrawEntry(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isConfirmed(form)) return { error: CONFIRM_ERROR };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("withdraw_entry", { p_entry: String(form.get("entry")) });
  if (error) return { error: error.message };
  revalidatePath("/tournaments");
  return done(form.get("slug"), "You've withdrawn. Your place goes back to the pool; to play after all, ask the organiser to add you.");
}

// ---------- P0.4: call a match from the desk ----------
export async function callMatch(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  // one call per match every 10 minutes, so a double tap doesn't email players twice
  const told = await notify(sb, String(form.get("event")), "match_called", {
    match: String(form.get("match")), round: `call-${Math.floor(Date.now() / 600_000)}`,
  });
  return { ok: told };
}

// ---------- P1.1: import entries from a CSV ----------
export async function importEntries(_: ActionState, form: FormData): Promise<ActionState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 200_000) return { error: "That file is too big. Keep it under 200 KB (about 128 entries)." };
  const { rows, errors } = readEntriesCsv(await file.text());
  if (errors.length) return { error: `Nothing imported. ${errors.slice(0, 4).join(" ")}${errors.length > 4 ? ` And ${errors.length - 4} more.` : ""}` };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_entries", { p_category: String(form.get("category")), p_rows: rows });
  if (error) return { error: `Nothing imported. ${error.message}.` };
  return done(form.get("slug"), `Imported ${rows.length} ${rows.length === 1 ? "entry" : "entries"}.`);
}

// ---------- P1.2: move one match by hand ----------
export async function moveMatch(_: ActionState, form: FormData): Promise<ActionState> {
  const at = istDate(str(form.get("date")), str(form.get("time")));
  const court = String(form.get("court") ?? "");
  if (!at) return { error: "Pick a date and time." };
  if (!court) return { error: "Pick a court." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("move_match", { p_match: String(form.get("match")), p_court: court, p_at: at.toISOString() });
  if (error) return { error: `${error.message}. Pick another court or time.` };
  return done(form.get("slug"), "Moved.");
}

// ---------- P1.3: registration questions ----------
async function eventFieldsFor(sb: Sb, categoryId: string): Promise<RegField[]> {
  const { data } = await sb.from("categories").select("event:events(reg_fields)").eq("id", categoryId).maybeSingle();
  return ((data?.event as unknown as { reg_fields: RegField[] } | null)?.reg_fields) ?? [];
}

async function saveFields(sb: Sb, eventId: string, change: (f: RegField[]) => RegField[] | string): Promise<string | null> {
  const { data } = await sb.from("events").select("reg_fields").eq("id", eventId).single();
  const next = change((data?.reg_fields ?? []) as RegField[]);
  if (typeof next === "string") return next;
  const { error } = await sb.rpc("update_event", { p_event: eventId, p: { reg_fields: next } });
  return error ? (error.message.includes("check constraint") ? "Check the question and its options." : error.message) : null;
}

export async function addRegField(_: ActionState, form: FormData): Promise<ActionState> {
  const label = str(form.get("label"), 60);
  const type = String(form.get("type"));
  if (!label) return { error: "Write the question." };
  if (!["text", "date", "choice"].includes(type)) return { error: "Pick the kind of answer." };
  const options = type === "choice"
    ? [...new Set(String(form.get("options") ?? "").split(",").map((o) => o.trim().slice(0, 40)).filter(Boolean))] : undefined;
  if (options && (options.length < 2 || options.length > 20)) return { error: "Give between 2 and 20 options, separated by commas." };
  const sb = await supabaseServer();
  const err = await saveFields(sb, String(form.get("event")), (f) =>
    f.length >= 10 ? "Ask at most 10 questions."
    : [...f, { key: fieldKey(label, f.map((x) => x.key)), label, type: type as RegField["type"], ...(options ? { options } : {}), required: form.get("required") === "yes" }]);
  return err ? { error: err } : done(form.get("slug"), "Question added. New registrations will ask it.");
}

export async function removeRegField(_: ActionState, form: FormData): Promise<ActionState> {
  const key = String(form.get("key"));
  const sb = await supabaseServer();
  const err = await saveFields(sb, String(form.get("event")), (f) => f.filter((x) => x.key !== key));
  return err ? { error: err } : done(form.get("slug"), "Question removed. Earlier answers stay in the export.");
}

// ---------- Entry fees by UPI straight to the organiser ----------
export async function setUpiId(_: ActionState, form: FormData): Promise<ActionState> {
  const upi = str(form.get("upi"), 300);
  if (upi && !validUpiId(upi)) return { error: "That doesn't look like a UPI ID. It's usually name@bank, like ravi@okhdfcbank." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_upi_id", { p_event: String(form.get("event")), p_upi: upi });
  if (error) return { error: error.message };
  return done(form.get("slug"), upi ? "Saved. Players in paid categories now see a Pay with UPI button." : "UPI ID removed.");
}

export async function rejectPayment(_: ActionState, form: FormData): Promise<ActionState> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("reject_payment", { p_entry: String(form.get("entry")), p_reason: str(form.get("reason"), 200) });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Rejected. The player can send a new UTR.");
}

export async function claimPayment(_: ActionState, form: FormData): Promise<ActionState> {
  const ref = str(form.get("ref"), 40).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9]{6,30}$/.test(ref)) return { error: "Enter the UTR from your UPI app: 6 to 30 letters or digits, shown after paying." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("claim_payment", { p_entry: String(form.get("entry")), p_ref: ref });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Thanks. The organiser will check it and confirm your place.");
}

// ---------- Organiser UX P0.5: categories after publishing ----------
export async function updateCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form.get("name"), 60);
  const fee = whole(form.get("fee"));
  const max = whole(form.get("max"));
  if (name.length < 2) return { error: "Category names are 2 to 60 characters." };
  if (!(fee >= 0 && fee <= 1_000_000)) return { error: "Enter the fee in whole rupees, 0 for free." };
  if (!(max >= 2 && max <= 128)) return { error: "Allow between 2 and 128 entries." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_category", { p_category: String(form.get("category")), p_name: name, p_fee: fee, p_max: max });
  if (error) return { error: error.message };
  return done(form.get("slug"), "Saved.");
}

export async function addCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const sport = String(form.get("sport")) as Sport;
  if (!(sport in SPORT_DEFAULTS)) return { error: "Unknown sport." };
  const defaults = SPORT_DEFAULTS[sport];
  const c: NewCategory = {
    name: str(form.get("name"), 60), format: String(form.get("format")), groupCount: whole(form.get("groups") ?? 0),
    entryType: String(form.get("entry_type")), teamSize: whole(form.get("team_size") ?? 0), maxEntries: whole(form.get("max")),
    entryFee: whole(form.get("fee")), bestOf: whole(form.get("best_of") || (defaults.scoring.kind === "games" ? defaults.scoring.bestOf : 1)),
    pointsTo: whole(form.get("points_to") || (defaults.scoring.kind === "games" ? defaults.scoring.pointsTo : 21)),
    bornOnOrAfter: str(form.get("born_after"), 10) || null, bornOnOrBefore: str(form.get("born_before"), 10) || null,
  };
  if (c.name.length < 2) return { error: "Every category needs a name." };
  const bad = checkCategory(c, c.name, defaults.scoring.kind === "games");
  if (bad) return { error: bad };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_category", { p_event: String(form.get("event")), c: categoryRow(c, sport) });
  if (error) return { error: error.message };
  return done(form.get("slug"), `${c.name} added. Players can enter it now.`);
}

// ---------- Organiser UX P0.6: bulk actions on the entries desk ----------
export async function bulkEntries(_: ActionState, form: FormData): Promise<ActionState> {
  const ids = String(form.get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  const op = String(form.get("op"));
  if (!ids.length) return { error: "Tick at least one entry." };
  const sb = await supabaseServer();
  let res;
  if (op === "paid") {
    // cash at the desk; RLS (managers edit entries) refuses anyone else, so a refused row simply isn't counted
    res = await sb.from("entries").update({ status: "confirmed", payment_status: "paid" }).in("id", ids).eq("status", "pending").select("id");
  } else if (op === "remove") {
    if (!isConfirmed(form)) return { error: CONFIRM_ERROR };
    const { data: rows } = await sb.from("entries").select("category_id").in("id", ids);
    const cats = [...new Set((rows ?? []).map((r) => r.category_id as string))];
    const { count } = cats.length ? await sb.from("matches").select("id", { count: "exact", head: true }).in("category_id", cats) : { count: 0 };
    if (count) return { error: "Some of these are in a category that's already drawn, so they can't be removed. Give a walkover instead." };
    res = await sb.from("entries").delete().in("id", ids).select("id");
  } else return { error: "Unknown change." };
  if (res.error) return { error: res.error.message };
  const n = res.data?.length ?? 0;
  if (!n) return { error: op === "paid" ? "Nothing to mark: those entries are already confirmed." : "Nothing was removed." };
  return done(form.get("slug"), op === "paid" ? `${n} marked paid.` : `${n} removed.`);
}

// ---------- Organiser UX P0.8: announcements ----------
export async function sendAnnouncement(_: ActionState, form: FormData): Promise<ActionState> {
  const kind = String(form.get("kind"));
  const event = String(form.get("event"));
  const sb = await supabaseServer();
  let told: string;
  if (kind === "fixtures_released" || kind === "schedule_update") {
    // once a day per player for on-demand resends; the automatic emails on draw and re-plan stay separate
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    told = await notify(sb, event, kind, { round: `manual-${day}` });
  } else if (kind === "general_info" || kind === "promotion") {
    if (kind === "promotion" && !isConfirmed(form)) return { error: CONFIRM_ERROR };
    const message = str(form.get("message"), 1000);
    if (message.length < 5) return { error: "Write the message first." };
    told = await announce(sb, event, kind, message);
  } else return { error: "Unknown message." };
  if (told.startsWith("Emails weren't sent")) return { error: told };
  return done(form.get("slug"), told);
}
