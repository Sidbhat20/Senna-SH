// Final placings for a finished category (P1.7).
import type { Played } from "./fixtures/advance";
import { standings } from "./fixtures/standings";
import { BYE } from "./fixtures/types";

export type Placing = { place: 1 | 2 | 3 | 4; name: string };

const loser = (m: Played) => (m.winner === m.a ? m.b : m.winner === m.b ? m.a : null);
const real = (n: string | null | undefined): n is string => !!n && n !== BYE;

/**
 * Knockout (and the knockout stage of groups + knockout): final winner 1st, final loser 2nd, semi-final losers joint 3rd.
 * Double elimination: grand final decides 1st and 2nd; the losers-bracket final's loser is 3rd.
 * League: the top four of the table.
 */
export function placings(c: { format: string; entries: string[]; matches: Played[] }): Placing[] {
  const done = c.matches.filter((m) => m.status === "done");
  if (c.format === "league") {
    return standings(c.entries, done).slice(0, 4).map((r, i) => ({ place: (i + 1) as Placing["place"], name: r.entry }));
  }
  const out: Placing[] = [];
  const push = (place: Placing["place"], name: string | null | undefined) => {
    if (real(name)) out.push({ place, name });
  };
  if (c.format === "double_elim") {
    const gf = done.find((m) => m.stage === "grand_final");
    if (!gf) return [];
    push(1, gf.winner);
    push(2, loser(gf));
    const lbFinal = done.filter((m) => m.stage === "losers").sort((x, y) => y.round - x.round)[0];
    if (lbFinal) push(3, loser(lbFinal));
    return out;
  }
  const ko = done.filter((m) => m.stage === "knockout");
  const rounds = Math.max(0, ...ko.map((m) => m.round));
  const final = ko.find((m) => m.round === rounds && !m.next);
  if (!final) return [];
  push(1, final.winner);
  push(2, loser(final));
  for (const semi of ko.filter((m) => m.round === rounds - 1 && !m.walkover)) push(3, loser(semi));
  return out;
}

export const placeName = (p: Placing["place"], joint = false) => `${joint ? "Joint " : ""}${["", "1st", "2nd", "3rd", "4th"][p]}`;
