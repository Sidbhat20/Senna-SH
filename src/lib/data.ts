// Reads from Supabase as the current user, so RLS decides what each visitor can see.
import type { Played } from "./fixtures/advance";
import { BYE, type StageKind } from "./fixtures/types";
import type { EntryType, Format, Scoring, Sport } from "./sports";
import { supabaseServer } from "./supabase/server";

export { FORMATS, SPORTS, type Format, type Sport } from "./sports";

export type Status = "draft" | "open" | "locked" | "live" | "completed" | "cancelled";

export type Category = {
  id: string;
  name: string;
  format: Format;
  groupCount?: number;
  entryType: EntryType;
  teamSize: number;
  maxEntries: number;
  entryFee: number;
  status: Status;
  entryCount: number;
  scoring: Scoring;
  bornOnOrAfter: string | null;
  bornOnOrBefore: string | null;
};

export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  sport: Sport;
  venue: string;
  area: string;
  startsAt: string;
  regClosesAt: string;
  prize: string;
  rules: string[];
  status: Status;
  organiser: string;
  organiserId: string;
  matchMinutes: number;
  posterUrl: string | null;
  ageCheck: "self" | "desk";
  breakMinutes: number;
  categories: Category[];
};

export type EntryRow = {
  id: string; name: string; club: string; seed: number | null; status: "pending" | "confirmed" | "withdrawn";
  checkedIn: boolean; idChecked: boolean; roster: string[];
};
export type DbMatch = Played & {
  id: string;
  categoryId: string;
  category: string;
  courtId: string | null;
  court?: string;
  at?: string;
  games: [number, number][];
  aId: string | null;
  bId: string | null;
  penA?: number;
  penB?: number;
};
export type CategoryDetail = Category & {
  entryRows: EntryRow[];
  entries: string[]; // names still entered
  matches: DbMatch[];
  groups?: Record<string, string[]>;
};
export type Court = { id: string; name: string };
export type EventDetail = Omit<EventSummary, "categories"> & { categories: CategoryDetail[]; courts: Court[]; canManage: boolean };

const CAT_COLS =
  "id, name, format, group_count, entry_type, team_size, max_entries, entry_fee, status, sort, scoring, best_of, points_to, points_cap, born_on_or_after, born_on_or_before, entries(status)";
const EVENT_SELECT = `*, organiser:profiles!events_organiser_id_fkey(name), categories(${CAT_COLS})`;

type CatRow = {
  id: string; name: string; format: Format; group_count: number | null; entry_type: EntryType; team_size: number;
  max_entries: number; entry_fee: number; status: Status; sort: number; entries: { status: string }[];
  scoring: "games" | "goals"; best_of: 1 | 3 | 5; points_to: number; points_cap: number | null;
  born_on_or_after: string | null; born_on_or_before: string | null;
};
type EventRow = {
  id: string; slug: string; title: string; sport: Sport; venue: string; area: string; starts_at: string; reg_closes_at: string;
  prize: string; rules: string[]; status: Status; organiser_id: string; match_minutes: number; break_minutes: number; poster_url: string | null; age_check: "self" | "desk";
  organiser: { name: string } | null; categories: CatRow[];
};

const toCategory = (c: CatRow): Category => ({
  id: c.id, name: c.name, format: c.format, groupCount: c.group_count ?? undefined, entryType: c.entry_type,
  teamSize: c.team_size, maxEntries: c.max_entries, entryFee: c.entry_fee, status: c.status,
  entryCount: c.entries.filter((e) => e.status !== "withdrawn").length,
  scoring: c.scoring === "goals" ? { kind: "goals" } : { kind: "games", bestOf: c.best_of, pointsTo: c.points_to, cap: c.points_cap },
  bornOnOrAfter: c.born_on_or_after, bornOnOrBefore: c.born_on_or_before,
});

function toEvent(r: EventRow): EventSummary {
  return {
    id: r.id, slug: r.slug, title: r.title, sport: r.sport, venue: r.venue, area: r.area, startsAt: r.starts_at,
    regClosesAt: r.reg_closes_at, prize: r.prize, rules: r.rules, status: r.status,
    organiser: r.organiser?.name || "Organiser", organiserId: r.organiser_id,
    matchMinutes: r.match_minutes, breakMinutes: r.break_minutes, posterUrl: r.poster_url, ageCheck: r.age_check,
    categories: [...r.categories].sort((a, b) => a.sort - b.sort).map(toCategory),
  };
}

export async function listEvents(): Promise<EventSummary[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("events").select(EVENT_SELECT).neq("status", "draft").order("starts_at");
  if (error) throw new Error(`Could not load tournaments: ${error.message}`);
  return (data as EventRow[]).map(toEvent);
}

type MRow = {
  id: string; category_id: string; key: string; stage: StageKind; grp: string | null; round: number; slot: number;
  entry_a: string | null; entry_b: string | null; a_bye: boolean; b_bye: boolean; score_a: number | null; score_b: number | null;
  status: Played["status"]; walkover: boolean; winner_entry: string | null; court_id: string | null; scheduled_at: string | null;
  games: [number, number][]; pen_a: number | null; pen_b: number | null;
  next_key: string | null; next_side: "a" | "b" | null; loser_next_key: string | null; loser_next_side: "a" | "b" | null;
};

export async function getEvent(slug: string): Promise<EventDetail | null> {
  const sb = await supabaseServer();
  const { data: row } = await sb.from("events").select(EVENT_SELECT).eq("slug", slug).maybeSingle();
  if (!row) return null;
  const ev = toEvent(row as EventRow);
  const catIds = ev.categories.map((c) => c.id);
  const [entries, matches, courts, manage] = await Promise.all([
    catIds.length
      ? sb.from("entry_names").select("id, category_id, name, club, seed, status, checked_in_at, id_checked, roster").in("category_id", catIds)
          .order("seed", { nullsFirst: false }).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    sb.from("matches").select("*").eq("event_id", ev.id).order("scheduled_at", { nullsFirst: false }).order("round").order("slot"),
    sb.from("courts").select("id, name").eq("event_id", ev.id).order("sort").order("name"),
    sb.rpc("can_manage", { e: ev.id }),
  ]);
  if (entries.error || matches.error || courts.error) throw new Error("Could not load this tournament");

  type ERow = { id: string; category_id: string; name: string; club: string; seed: number | null; status: EntryRow["status"];
    checked_in_at: string | null; id_checked: boolean; roster: string[] };
  const entryRows = (entries.data as ERow[]).map((e) => ({
    id: e.id, category_id: e.category_id, name: e.name, club: e.club, seed: e.seed, status: e.status,
    checkedIn: !!e.checked_in_at, idChecked: e.id_checked, roster: e.roster ?? [],
  }));
  const name = new Map(entryRows.map((e) => [e.id, e.name]));
  const courtName = new Map((courts.data as Court[]).map((c) => [c.id, c.name]));
  const catName = new Map(ev.categories.map((c) => [c.id, c.name]));
  const side = (id: string | null, bye: boolean) => (bye ? BYE : id ? (name.get(id) ?? "Withdrawn") : null);
  const all: DbMatch[] = (matches.data as MRow[]).map((m) => ({
    id: m.id, categoryId: m.category_id, category: catName.get(m.category_id) ?? "", key: m.key, stage: m.stage,
    group: m.grp ?? undefined, round: m.round, slot: m.slot, a: side(m.entry_a, m.a_bye), b: side(m.entry_b, m.b_bye),
    scoreA: m.score_a ?? undefined, scoreB: m.score_b ?? undefined, status: m.status, walkover: m.walkover,
    winner: m.winner_entry ? name.get(m.winner_entry) : undefined,
    next: m.next_key ? { key: m.next_key, side: m.next_side! } : undefined,
    loserNext: m.loser_next_key ? { key: m.loser_next_key, side: m.loser_next_side! } : undefined,
    courtId: m.court_id, court: m.court_id ? courtName.get(m.court_id) : undefined, at: m.scheduled_at ?? undefined,
    games: m.games ?? [], aId: m.entry_a, bId: m.entry_b, penA: m.pen_a ?? undefined, penB: m.pen_b ?? undefined,
  }));

  const categories: CategoryDetail[] = ev.categories.map((c) => {
    const rows = entryRows.filter((e) => e.category_id === c.id);
    const matches = all.filter((m) => m.categoryId === c.id);
    let groups: Record<string, string[]> | undefined;
    for (const m of matches.filter((x) => x.stage === "group")) {
      groups ??= {};
      const g = (groups[m.group!] ??= []);
      for (const n of [m.a, m.b]) if (n && n !== BYE && !g.includes(n)) g.push(n);
    }
    return { ...c, entryRows: rows, entries: rows.filter((e) => e.status !== "withdrawn").map((e) => e.name), matches, groups };
  });

  return { ...ev, categories, courts: courts.data as Court[], canManage: manage.data === true };
}

/** The most recent live event, for the home page bracket. */
export async function featuredEvent(): Promise<EventDetail | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from("events").select("slug").eq("status", "live").order("starts_at", { ascending: false }).limit(1).maybeSingle();
  return data ? getEvent(data.slug) : null;
}

export async function getMatch(id: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("matches").select("event:events(slug)").eq("id", id).maybeSingle();
  const slug = (data?.event as unknown as { slug: string } | null)?.slug;
  const ev = slug ? await getEvent(slug) : null;
  const category = ev?.categories.find((c) => c.matches.some((m) => m.id === id));
  const match = category?.matches.find((m) => m.id === id);
  if (!ev || !category || !match) return null;
  const { data: canScore } = await sb.rpc("can_score_match", { p_match: id });
  return { event: ev, category, match, canScore: canScore === true };
}

/** The current user's entries in an event, by category, with the team invite code when they captain it. */
export async function myEntries(ev: { categories: { id: string }[] }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const byCategory = new Map<string, { status: string; invite: string | null }>();
  if (!auth.user) return { loggedIn: false as const, byCategory };
  const catIds = ev.categories.map((c) => c.id);
  const { data: teams } = await sb.from("team_members").select("team_id").eq("user_id", auth.user.id);
  const teamIds = (teams ?? []).map((t) => t.team_id);
  const { data: rows } = catIds.length
    ? await sb.from("entries").select("category_id, status, team_id").in("category_id", catIds).neq("status", "withdrawn")
        .or(`user_id.eq.${auth.user.id}${teamIds.length ? `,team_id.in.(${teamIds.join(",")})` : ""}`)
    : { data: [] };
  for (const r of rows ?? []) {
    const invite = r.team_id ? ((await sb.rpc("my_team_invite", { p_team: r.team_id })).data as string | null) : null;
    byCategory.set(r.category_id, { status: r.status, invite });
  }
  return { loggedIn: true as const, byCategory };
}

/** Referee links for an event; RLS returns nothing unless the viewer manages it. */
export async function refereeLinks(eventId: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("referee_links").select("token, court_id").eq("event_id", eventId);
  return (data ?? []) as { token: string; court_id: string | null }[];
}

/** Events the current user referees or runs, with the matches they can score next. */
export async function myScoring() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const [{ data: officiating }, { data: organising }] = await Promise.all([
    sb.from("officials").select("court_id, event:events(slug)").eq("user_id", auth.user.id),
    sb.from("events").select("slug").eq("organiser_id", auth.user.id).in("status", ["open", "live"]),
  ]);
  const want = new Map<string, string | null>(); // slug -> court id, or null for every court
  for (const o of officiating ?? []) want.set((o.event as unknown as { slug: string }).slug, o.court_id);
  for (const e of organising ?? []) want.set(e.slug, null);
  const out = [];
  for (const [slug, court] of want) {
    const ev = await getEvent(slug);
    if (!ev || ev.status === "completed") continue;
    const matches = ev.categories.flatMap((c) => c.matches)
      .filter((m) => m.status !== "done" && m.a && m.b && m.a !== BYE && m.b !== BYE)
      .filter((m) => court === null || m.courtId === court)
      .sort((x, y) => (x.at ?? "9").localeCompare(y.at ?? "9"));
    out.push({ event: ev, court: court ? (ev.courts.find((c) => c.id === court)?.name ?? null) : null, matches });
  }
  return out;
}
