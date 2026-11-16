import { BYE, type Link, type StageKind } from "./types";

export type SchedMatch = {
  id: string;
  category: string;
  key: string;
  stage: StageKind;
  round: number;
  slot: number;
  a: string | null; // entry id, BYE, or null until known
  b: string | null;
  status: "scheduled" | "live" | "done";
  walkover?: boolean;
  next?: Link;
  loserNext?: Link;
  court?: string | null;
  at?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type Slot = { id: string; court: string; at: Date };

const STAGE_ORDER: Record<StageKind, number> = { league: 0, group: 0, knockout: 1, winners: 1, losers: 2, grand_final: 3 };

/**
 * Gives every unplayed match a court and a start time. A match never starts before the matches that feed it
 * (and so decide its players) have ended, a player is never in two matches at once, and courts never overlap.
 * Greedy: repeatedly places the ready match that can start soonest, earlier rounds first on ties.
 * `now` reschedules a running event: nothing new starts before it, live matches keep their court.
 */
export function schedule(
  matches: SchedMatch[],
  courts: string[],
  opts: { start: Date; slotMinutes: number; now?: Date },
): Slot[] {
  if (!courts.length) throw new Error("add at least one court");
  const slot = opts.slotMinutes * 60_000;
  const base = Math.max(+opts.start, +(opts.now ?? opts.start));
  const id = (m: { category: string; key: string }) => `${m.category}|${m.key}`;

  const feeders = new Map<string, SchedMatch[]>();
  for (const m of matches) {
    for (const l of [m.next, m.loserNext]) {
      if (!l) continue;
      const k = `${m.category}|${l.key}`;
      feeders.set(k, [...(feeders.get(k) ?? []), m]);
    }
  }

  const end = new Map<string, number>();
  const courtFree = new Map(courts.map((c) => [c, base]));
  const playerFree = new Map<string, number>();
  const busy = (who: string | null, until: number) => {
    if (who && who !== BYE) playerFree.set(who, Math.max(playerFree.get(who) ?? 0, until));
  };

  const pending: SchedMatch[] = [];
  for (const m of matches) {
    if (m.status === "done") {
      end.set(id(m), m.walkover ? 0 : +(m.finishedAt ?? m.at ?? opts.start));
    } else if (m.status === "live") {
      const until = Math.max(base, +(m.startedAt ?? m.at ?? base) + slot);
      end.set(id(m), until);
      if (m.court && courtFree.has(m.court)) courtFree.set(m.court, Math.max(courtFree.get(m.court)!, until));
      busy(m.a, until);
      busy(m.b, until);
    } else pending.push(m);
  }

  const out: Slot[] = [];
  while (pending.length) {
    let best: { i: number; at: number; court: string } | undefined;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      const fs = feeders.get(id(m)) ?? [];
      if (fs.some((f) => !end.has(id(f)))) continue; // a feeder isn't placed yet
      const ready = Math.max(base, ...fs.map((f) => end.get(id(f))!), playerFree.get(m.a ?? "") ?? 0, playerFree.get(m.b ?? "") ?? 0);
      let court = courts[0];
      for (const c of courts) if (Math.max(ready, courtFree.get(c)!) < Math.max(ready, courtFree.get(court)!)) court = c;
      const at = Math.max(ready, courtFree.get(court)!);
      const p = best && pending[best.i];
      const earlier =
        !best || at < best.at ||
        (at === best.at && (STAGE_ORDER[m.stage] - STAGE_ORDER[p!.stage] || m.round - p!.round || m.slot - p!.slot) < 0);
      if (earlier) best = { i, at, court };
    }
    if (!best) throw new Error("fixtures have a cycle"); // can't happen with engine output
    const [m] = pending.splice(best.i, 1);
    const finish = best.at + slot;
    out.push({ id: m.id, court: best.court, at: new Date(best.at) });
    end.set(id(m), finish);
    courtFree.set(best.court, finish);
    busy(m.a, finish);
    busy(m.b, finish);
  }
  return out;
}
