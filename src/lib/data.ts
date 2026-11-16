// Reads from Supabase as the current user, so RLS decides what each visitor can see.
import type { Played } from "./fixtures/advance";
import { BYE, type StageKind } from "./fixtures/types";
import type { EntryType, Format, Scoring, Sport } from "./sports";
import { organiserOrder } from "./organise";
import type { RegField } from "./reg-fields";
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
  regFields: RegField[];
  upiId: string | null;
  breakMinutes: number;
  categories: Category[];
};

export type EntryRow = {
  id: string; name: string; club: string; seed: number | null; status: "pending" | "confirmed" | "withdrawn";
  checkedIn: boolean; idChecked: boolean; roster: string[]; paymentStatus: string;
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
  prize: string; rules: string[]; status: Status; organiser_id: string; match_minutes: number; break_minutes: number; poster_url: string | null; age_check: "self" | "desk"; reg_fields: RegField[]; upi_id: string | null;
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
    matchMinutes: r.match_minutes, breakMinutes: r.break_minutes, posterUrl: r.poster_url, ageCheck: r.age_check, regFields: r.reg_fields ?? [], upiId: r.upi_id ?? null,
    categories: [...r.categories].sort((a, b) => a.sort - b.sort).map(toCategory),
  };
}

export const PAGE_SIZE = 20;
export type ListFilter = { status?: Status; sport?: Sport; page?: number };

/**
 * Public list, one page at a time. Without a status filter it shows what's coming up or under way (soonest first);
 * finished events appear under the "Finished" filter, newest first. Filtering happens in Postgres, not in the page.
 */
export async function listEvents(f: ListFilter = {}): Promise<{ events: EventSummary[]; more: boolean }> {
  const sb = await supabaseServer();
  const page = Math.max(0, Math.trunc(f.page ?? 0));
  const finished = f.status === "completed";
  let q = sb.from("events").select(EVENT_SELECT);
  q = f.status ? q.eq("status", f.status) : q.in("status", ["open", "locked", "live"]);
  if (f.sport) q = q.eq("sport", f.sport);
  const { data, error } = await q
    .order("starts_at", { ascending: !finished })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE); // one extra row tells us whether there's another page
  if (error) throw new Error(`Could not load tournaments: ${error.message}`);
  const rows = (data as EventRow[]).map(toEvent);
  return { events: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE };
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
      ? sb.from("entry_names").select("id, category_id, name, club, seed, status, checked_in_at, id_checked, roster, payment_status").in("category_id", catIds)
          .order("seed", { nullsFirst: false }).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    sb.from("matches").select("*").eq("event_id", ev.id).order("scheduled_at", { nullsFirst: false }).order("round").order("slot"),
    sb.from("courts").select("id, name").eq("event_id", ev.id).order("sort").order("name"),
    sb.rpc("can_manage", { e: ev.id }),
  ]);
  if (entries.error || matches.error || courts.error) throw new Error("Could not load this tournament");

  type ERow = { id: string; category_id: string; name: string; club: string; seed: number | null; status: EntryRow["status"];
    checked_in_at: string | null; id_checked: boolean; roster: string[]; payment_status: string };
  const entryRows = (entries.data as ERow[]).map((e) => ({
    id: e.id, category_id: e.category_id, name: e.name, club: e.club, seed: e.seed, status: e.status,
    checkedIn: !!e.checked_in_at, idChecked: e.id_checked, roster: e.roster ?? [], paymentStatus: e.payment_status,
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
  const byCategory = new Map<string, { id: string; status: string; paymentStatus: string; invite: string | null; canWithdraw: boolean }>();
  if (!auth.user) return { loggedIn: false as const, byCategory };
  const catIds = ev.categories.map((c) => c.id);
  const { data: teams } = await sb.from("team_members").select("team_id").eq("user_id", auth.user.id);
  const teamIds = (teams ?? []).map((t) => t.team_id);
  const { data: rows } = catIds.length
    ? await sb.from("entries").select("id, category_id, status, payment_status, team_id, user_id").in("category_id", catIds).neq("status", "withdrawn")
        .or(`user_id.eq.${auth.user.id}${teamIds.length ? `,team_id.in.(${teamIds.join(",")})` : ""}`)
    : { data: [] };
  for (const r of rows ?? []) {
    const invite = r.team_id ? ((await sb.rpc("my_team_invite", { p_team: r.team_id })).data as string | null) : null;
    // players withdraw their own entry; for teams only the captain can (my_team_invite answers only for captains)
    byCategory.set(r.category_id, { id: r.id, status: r.status, paymentStatus: r.payment_status, invite, canWithdraw: r.user_id === auth.user.id || invite !== null });
  }
  return { loggedIn: true as const, byCategory };
}

/** Referee links for an event; RLS returns nothing unless the viewer manages it. */
export async function refereeLinks(eventId: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("referee_links").select("token, court_id, expires_at").eq("event_id", eventId).is("revoked_at", null);
  return (data ?? []) as { token: string; court_id: string | null; expires_at: string }[];
}

/** One match on a referee's queue: just what the scoring list shows, never a whole event's history. */
export type ScoringMatch = Played & Pick<DbMatch, "id" | "category" | "court" | "at" | "games">;
export type ScoringQueue = { event: { id: string; slug: string; title: string }; court: string | null; matches: ScoringMatch[] };

const SCORING_LIMIT = 200;

/**
 * Matches the current user can score next, grouped by event. Slim on purpose: one query for unfinished matches with
 * both sides known (finished and past matches are never fetched), then names for just those rows. No getEvent() calls.
 */
export async function myScoring(): Promise<ScoringQueue[]> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const [{ data: officiating }, { data: organising }] = await Promise.all([
    sb.from("officials").select("event_id, court_id").eq("user_id", auth.user.id).eq("role", "referee"),
    sb.from("events").select("id").eq("organiser_id", auth.user.id).in("status", ["open", "live"]),
  ]);
  const courtFor = new Map<string, string | null>(); // event id -> the court they score, or null for every court
  for (const o of officiating ?? []) courtFor.set(o.event_id, o.court_id);
  for (const e of organising ?? []) courtFor.set(e.id, null);
  if (!courtFor.size) return [];
  const eventIds = [...courtFor.keys()];

  const { data: rows } = await sb.from("matches")
    .select("id, event_id, category_id, key, stage, grp, round, slot, entry_a, entry_b, score_a, score_b, status, court_id, scheduled_at, games")
    .in("event_id", eventIds).neq("status", "done").not("entry_a", "is", null).not("entry_b", "is", null)
    .order("scheduled_at", { nullsFirst: false }).limit(SCORING_LIMIT);
  const ms = (rows ?? []).filter((m) => courtFor.get(m.event_id) === null || courtFor.get(m.event_id) === m.court_id);

  const entryIds = [...new Set(ms.flatMap((m) => [m.entry_a, m.entry_b]))];
  const [events, cats, courts, names] = await Promise.all([
    sb.from("events").select("id, slug, title, status").in("id", eventIds),
    sb.from("categories").select("id, name").in("id", [...new Set(ms.map((m) => m.category_id))]),
    sb.from("courts").select("id, name").in("event_id", eventIds),
    entryIds.length ? sb.from("entry_names").select("id, name").in("id", entryIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const catName = new Map((cats.data ?? []).map((c) => [c.id, c.name as string]));
  const courtName = new Map((courts.data ?? []).map((c) => [c.id, c.name as string]));
  const name = new Map((names.data ?? []).map((n) => [n.id, n.name as string]));

  return (events.data ?? []).filter((e) => e.status !== "completed").map((e) => {
    const court = courtFor.get(e.id) ?? null;
    return {
      event: { id: e.id, slug: e.slug, title: e.title },
      court: court ? (courtName.get(court) ?? null) : null,
      matches: ms.filter((m) => m.event_id === e.id).map((m): ScoringMatch => ({
        id: m.id, key: m.key, stage: m.stage, group: m.grp ?? undefined, round: m.round, slot: m.slot,
        a: name.get(m.entry_a) ?? null, b: name.get(m.entry_b) ?? null, status: m.status,
        scoreA: m.score_a ?? undefined, scoreB: m.score_b ?? undefined, games: m.games ?? [],
        category: catName.get(m.category_id) ?? "", court: m.court_id ? courtName.get(m.court_id) : undefined,
        at: m.scheduled_at ?? undefined,
      })),
    };
  });
}

export type MyEvent = EventSummary & { role: "organiser" | "co_organiser" };

/** Every event the current user runs (owner or co-organiser), drafts included, split into still-to-run and past. */
export async function myEvents(): Promise<{ active: MyEvent[]; past: MyEvent[] } | null> {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const uid = auth.user.id;
  const { data: co } = await sb.from("officials").select("event_id").eq("user_id", uid).eq("role", "co_organiser");
  const coIds = (co ?? []).map((o) => o.event_id as string);
  const { data, error } = await sb.from("events").select(EVENT_SELECT)
    .or(`organiser_id.eq.${uid}${coIds.length ? `,id.in.(${coIds.join(",")})` : ""}`)
    .order("starts_at").limit(200);
  if (error) throw new Error(`Could not load your tournaments: ${error.message}`);
  const events = (data as EventRow[]).map((r): MyEvent => ({ ...toEvent(r), role: r.organiser_id === uid ? "organiser" : "co_organiser" }));
  return organiserOrder(events);
}

export type StaffMember = { userId: string; name: string; role: "referee" | "co_organiser"; court: string | null };
export type StaffInvite = { token: string; note: string; expiresAt: string };

/** Staff for an event, plus pending co-organiser invites (RLS shows those to the owner only). */
export async function eventStaff(ev: { id: string; organiserId: string; courts: Court[] }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id ?? null;
  const [{ data: officials }, { data: invites }] = await Promise.all([
    sb.from("officials").select("user_id, role, court_id, profile:profiles(name)").eq("event_id", ev.id),
    sb.from("staff_invites").select("token, note, expires_at").eq("event_id", ev.id)
      .is("revoked_at", null).is("redeemed_at", null).gt("expires_at", new Date().toISOString()).order("created_at"),
  ]);
  const courtName = new Map(ev.courts.map((c) => [c.id, c.name]));
  const members: StaffMember[] = (officials ?? []).map((o) => ({
    userId: o.user_id, role: o.role, court: o.court_id ? (courtName.get(o.court_id) ?? null) : null,
    name: (o.profile as unknown as { name: string } | null)?.name || "Unnamed player",
  })).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return {
    me, isOwner: me !== null && me === ev.organiserId, members,
    invites: (invites ?? []).map((i): StaffInvite => ({ token: i.token, note: i.note, expiresAt: i.expires_at })),
  };
}

/** Emails and phones for an event's entries (player, or team captain). Managers only: the database refuses everyone else. */
export async function entryContacts(eventId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("entry_contacts", { p_event: eventId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { entry_id: string; email: string | null; phone: string | null }[]).map((r) => [r.entry_id, r]));
}

/** Answers to the event's registration questions, by entry. Managers only: the database refuses everyone else. */
export async function entryAnswers(eventId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("entry_answers", { p_event: eventId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { entry_id: string; answers: Record<string, string> }[]).map((r) => [r.entry_id, r.answers]));
}

/** UPI references players submitted, by entry. Managers only: the database refuses everyone else. */
export async function paymentClaims(eventId: string) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("payment_claims", { p_event: eventId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { entry_id: string; payment_ref: string }[]).map((r) => [r.entry_id, r.payment_ref]));
}
