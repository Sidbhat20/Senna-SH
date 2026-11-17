import type { Status } from "./data";

const ACTIVE: Status[] = ["draft", "open", "locked", "live"];

/**
 * Order for the organiser home: anything still to run (drafts, open, live) first, soonest first;
 * then finished or cancelled events, most recent first.
 */
export function organiserOrder<T extends { status: Status; startsAt: string }>(events: T[]): { active: T[]; past: T[] } {
  const active = events.filter((e) => ACTIVE.includes(e.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events.filter((e) => !ACTIVE.includes(e.status)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { active, past };
}

export type OrganiseFilter = { q?: string; sport?: string; status?: string };

/** Search by title, and filter by sport and status, for the organiser home. Empty values mean "any". */
export function filterEvents<T extends { title: string; sport: string; status: Status }>(events: T[], f: OrganiseFilter): T[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return events.filter((e) => (!q || e.title.toLowerCase().includes(q)) && (!f.sport || e.sport === f.sport) && (!f.status || e.status === f.status));
}

/** A visitor's search text, made safe for a PostgREST or() filter: letters, digits, spaces and a few name
 *  characters only (commas, brackets, dots and % would change the filter's meaning). Empty means no search. */
export function searchTerm(q: unknown): string {
  return String(q ?? "").replace(/[^\p{L}\p{N} '&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
