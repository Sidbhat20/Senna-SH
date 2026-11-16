import { BYE, key, type Match, type StageKind } from "./types";

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(n, 2)));

// Standard seed order for a bracket of `size`: [1, size, ..., 2] so top seeds meet last.
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((s) => [s, len + 1 - s]);
  }
  return order;
}

/** Single-elimination bracket. `seeds` is entry ids in seed order; byes go to top seeds. */
export function knockout(seeds: string[], stage: StageKind = "knockout"): Match[] {
  if (seeds.length < 2) throw new Error("knockout needs at least 2 entries");
  const size = nextPow2(seeds.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const pick = (i: number) => seeds[order[i] - 1] ?? BYE;
  const matches: Match[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (let m = 0; m < size / 2 ** r; m++) {
      matches.push({
        key: key(stage, r, m),
        stage,
        round: r,
        slot: m,
        a: r === 1 ? pick(2 * m) : null,
        b: r === 1 ? pick(2 * m + 1) : null,
        next: r < rounds ? { key: key(stage, r + 1, m >> 1), side: m % 2 ? "b" : "a" } : undefined,
      });
    }
  }
  return matches;
}
