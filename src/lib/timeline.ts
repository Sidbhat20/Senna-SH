// Court-by-time layout for the schedule page: one row per court, one lane per Bangalore day, each match placed by its
// start time and sized by the event's match length. Pure, so it's tested without a browser.
type M = { id: string; courtId: string | null; at?: string; status: string; a: string | null; b: string | null; category: string; walkover?: boolean };

export type Block = { id: string; left: number; width: number; label: string; status: string; at: string };
export type Day = { day: string; start: number; minutes: number; courts: { id: string; name: string; blocks: Block[] }[] };

const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** `left` and `width` are in minutes from the day's first start, so the page picks its own scale. */
export function timeline(matches: M[], courts: { id: string; name: string }[], matchMinutes: number, bye = "__bye__"): Day[] {
  const placed = matches.filter((m) => m.at && m.courtId && !m.walkover && m.a !== bye && m.b !== bye);
  const days = new Map<string, M[]>();
  for (const m of placed) {
    const d = istDay.format(new Date(m.at!));
    days.set(d, [...(days.get(d) ?? []), m]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, ms]) => {
    const start = Math.min(...ms.map((m) => +new Date(m.at!)));
    const end = Math.max(...ms.map((m) => +new Date(m.at!) + matchMinutes * 60_000));
    return {
      day, start, minutes: Math.round((end - start) / 60_000),
      courts: courts.map((c) => ({
        id: c.id, name: c.name,
        blocks: ms.filter((m) => m.courtId === c.id).sort((x, y) => x.at!.localeCompare(y.at!)).map((m) => ({
          id: m.id, left: Math.round((+new Date(m.at!) - start) / 60_000), width: matchMinutes, status: m.status, at: m.at!,
          label: `${m.a ?? "TBD"} v ${m.b ?? "TBD"}`,
        })),
      })),
    };
  });
}
