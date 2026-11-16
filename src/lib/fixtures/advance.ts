import { BYE, type Match } from "./types";

export type Result = { a: number; b: number; live?: boolean };
export type Played = Match & {
  status: "scheduled" | "live" | "done";
  scoreA?: number;
  scoreB?: number;
  winner?: string;
  walkover?: boolean;
};

/**
 * Applies results (by match key) and pushes winners/losers along next/loserNext links.
 * BYE sides resolve automatically. Same rules finish_match() will run in SQL.
 * A bracket tie stays "live": a knockout winner needs a higher score.
 */
export function advance(matches: Match[], results: Record<string, Result>): Played[] {
  const byKey = new Map<string, Played>(matches.map((m) => [m.key, { ...m, status: "scheduled" }]));
  const send = (link: Match["next"], who: string) => {
    if (link) byKey.get(link.key)![link.side] = who;
  };
  for (let progress = true; progress; ) {
    progress = false;
    for (const m of byKey.values()) {
      if (m.status !== "scheduled" || m.a === null || m.b === null) continue;
      let winner: string | undefined;
      if (m.a === BYE || m.b === BYE) {
        winner = m.a === BYE ? m.b : m.a;
        m.walkover = true;
      } else {
        const r = results[m.key];
        if (!r) continue;
        m.scoreA = r.a;
        m.scoreB = r.b;
        const canDraw = m.stage === "league" || m.stage === "group";
        if (r.live || (r.a === r.b && !canDraw)) {
          m.status = "live";
          continue;
        }
        winner = r.a > r.b ? m.a : r.b > r.a ? m.b : undefined; // league draw: no winner
      }
      m.status = "done";
      m.winner = winner;
      if (winner) {
        send(m.next, winner);
        send(m.loserNext, winner === m.a ? m.b : m.a);
      }
      progress = true;
    }
  }
  return [...byKey.values()];
}
