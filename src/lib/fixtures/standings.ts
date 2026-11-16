import type { Played } from "./advance";

export type Row = { entry: string; p: number; w: number; d: number; l: number; f: number; a: number; pts: number };

/** League table from finished matches: 3 for a win, 1 for a draw. Sorted by points, difference, scored. */
export function standings(entries: string[], matches: Played[], points = { win: 3, draw: 1 }): Row[] {
  const rows = new Map(entries.map((e) => [e, { entry: e, p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0 }]));
  for (const m of matches) {
    if (m.status !== "done" || m.walkover || m.scoreA === undefined || m.scoreB === undefined) continue;
    for (const [me, mine, theirs] of [[m.a!, m.scoreA, m.scoreB], [m.b!, m.scoreB, m.scoreA]] as const) {
      const r = rows.get(me);
      if (!r) continue;
      r.p++;
      r.f += mine;
      r.a += theirs;
      if (mine > theirs) {
        r.w++;
        r.pts += points.win;
      } else if (mine === theirs) {
        r.d++;
        r.pts += points.draw;
      } else r.l++;
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.f - y.a - (x.f - x.a) || y.f - x.f);
}
