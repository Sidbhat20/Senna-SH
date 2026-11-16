import { knockout, nextPow2 } from "./knockout";
import { key, type Link, type Match } from "./types";

/**
 * Double elimination: winners bracket, losers bracket, single grand final.
 * shortcut: no grand-final bracket reset and no drop-order flipping, add if organisers ask.
 */
export function doubleElim(seeds: string[]): Match[] {
  const wb = knockout(seeds, "winners");
  const size = nextPow2(seeds.length);
  const k = Math.log2(size);
  const lbRounds = 2 * (k - 1);
  const gf: Match = { key: key("grand_final", 1, 0), stage: "grand_final", round: 1, slot: 0, a: null, b: null };
  const lb: Match[] = [];

  for (let r = 1; r <= lbRounds; r++) {
    const count = size / 2 ** (Math.ceil(r / 2) + 1);
    for (let m = 0; m < count; m++) {
      const next: Link =
        r === lbRounds ? { key: gf.key, side: "b" }
        : r % 2 ? { key: key("losers", r + 1, m), side: "a" } // odd round -> meets a WB dropout
        : { key: key("losers", r + 1, m >> 1), side: m % 2 ? "b" : "a" };
      lb.push({ key: key("losers", r, m), stage: "losers", round: r, slot: m, a: null, b: null, next });
    }
  }

  for (const w of wb) {
    if (w.round === k) {
      w.next = { key: gf.key, side: "a" };
      w.loserNext = k === 1 ? { key: gf.key, side: "b" } : { key: key("losers", lbRounds, 0), side: "b" };
    } else if (w.round === 1) {
      w.loserNext = { key: key("losers", 1, w.slot >> 1), side: w.slot % 2 ? "b" : "a" };
    } else {
      w.loserNext = { key: key("losers", 2 * (w.round - 1), w.slot), side: "b" };
    }
  }
  return [...wb, ...lb, gf];
}
