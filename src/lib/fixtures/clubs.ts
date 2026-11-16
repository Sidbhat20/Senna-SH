import { BYE, type Match } from "./types";

/**
 * Swaps round-1 opponents so entries from the same club or academy don't meet in round 1 where avoidable.
 * Only the "b" side moves, and byes never move, so top seeds keep their position and their byes.
 */
export function separateClubs(matches: Match[], club: (entry: string) => string): Match[] {
  const out = matches.map((m) => ({ ...m }));
  const first = out.filter((m) => m.round === 1 && (m.stage === "knockout" || m.stage === "winners"));
  const real = (e: string | null) => !!e && e !== BYE;
  const clash = (x: string | null, y: string | null) => real(x) && real(y) && !!club(x!) && club(x!) === club(y!);

  for (let i = 0; i < first.length; i++) {
    const mi = first[i];
    if (!clash(mi.a, mi.b)) continue;
    // nearest other match where trading opponents fixes this clash without creating one there
    const order = first.map((_, j) => j).filter((j) => j !== i).sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
    for (const j of order) {
      const mj = first[j];
      if (!real(mj.b) || clash(mi.a, mj.b) || clash(mj.a, mi.b)) continue;
      [mi.b, mj.b] = [mj.b, mi.b];
      break;
    }
  }
  return out;
}
