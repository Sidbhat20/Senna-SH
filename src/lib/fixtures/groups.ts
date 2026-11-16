import { league } from "./league";
import type { Match } from "./types";

const groupName = (i: number) => String.fromCharCode(65 + i); // A, B, C...

/**
 * Snake-seed entries into groups and generate a round robin per group.
 * With `club`, each seed row still puts one entry in every group, but an entry skips a group that already
 * has someone from its club when another group in that row is free of them.
 */
export function groups(
  seeds: string[],
  groupCount: number,
  club: (entry: string) => string = () => "",
): { groups: Record<string, string[]>; matches: Match[] } {
  if (groupCount < 2 || seeds.length < groupCount * 2) throw new Error("need at least 2 groups of 2");
  const out: Record<string, string[]> = {};
  for (let i = 0; i < groupCount; i++) out[groupName(i)] = [];
  for (let row = 0; row * groupCount < seeds.length; row++) {
    const snake = Array.from({ length: groupCount }, (_, c) => groupName(row % 2 ? groupCount - 1 - c : c));
    const open = new Set(snake);
    for (const s of seeds.slice(row * groupCount, row * groupCount + groupCount)) {
      const free = snake.filter((g) => open.has(g));
      const g = free.find((g) => !club(s) || !out[g].some((x) => club(x) === club(s))) ?? free[0];
      out[g].push(s);
      open.delete(g);
    }
  }
  return { groups: out, matches: Object.entries(out).flatMap(([g, e]) => league(e, "group", g)) };
}

/**
 * Knockout seeds from final group tables (each sorted by rank): all winners, then all runners-up,
 * so standard seeding pairs A1 v last-group #2 and keeps same-group teams apart. Feed to knockout().
 */
export function qualifiers(tables: Record<string, string[]>, perGroup: number): string[] {
  const names = Object.keys(tables).sort();
  return Array.from({ length: perGroup }, (_, rank) => names.map((g) => tables[g][rank]).filter(Boolean)).flat();
}
