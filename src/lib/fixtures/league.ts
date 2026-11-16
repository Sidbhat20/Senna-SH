import { BYE, key, type Match, type StageKind } from "./types";

/** Round robin by the circle method: everyone plays everyone once. */
export function league(entries: string[], stage: StageKind = "league", group?: string): Match[] {
  if (entries.length < 2) throw new Error("league needs at least 2 entries");
  const ring = entries.length % 2 ? [...entries, BYE] : [...entries];
  const n = ring.length;
  const matches: Match[] = [];
  for (let r = 1; r < n; r++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const [x, y] = [ring[i], ring[n - 1 - i]];
      if (x === BYE || y === BYE) continue; // sits out this round
      const [a, b] = r % 2 ? [x, y] : [y, x]; // alternate sides
      matches.push({ key: key(stage, r, slot, group), stage, group, round: r, slot: slot++, a, b });
    }
    ring.splice(1, 0, ring.pop()!); // rotate everyone except ring[0]
  }
  return matches;
}
