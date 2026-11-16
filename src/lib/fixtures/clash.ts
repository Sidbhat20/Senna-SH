// Would moving one match collide with another? Mirrors move_match in supabase/migrations/0012_move_match.sql.
// A match occupies [at, at + slot). Same court overlapping, or either side playing elsewhere at the same time, is a clash.

export type Placed = { id: string; court: string | null; at: string | null; a: string | null; b: string | null; walkover?: boolean };
export type Clash = { kind: "court" | "player"; with: Placed };

export function findClash(all: Placed[], move: { id: string; court: string; at: string }, slotMinutes: number): Clash | null {
  const me = all.find((m) => m.id === move.id);
  const start = +new Date(move.at);
  const end = start + slotMinutes * 60_000;
  const players = [me?.a, me?.b].filter((p): p is string => !!p && p !== "BYE");
  const overlapping = all.filter((o) => {
    if (o.id === move.id || o.walkover || !o.at) return false;
    const os = +new Date(o.at);
    return os < end && os + slotMinutes * 60_000 > start;
  });
  const court = overlapping.find((o) => o.court === move.court);
  if (court) return { kind: "court", with: court };
  const player = overlapping.find((o) => players.includes(o.a ?? "") || players.includes(o.b ?? ""));
  return player ? { kind: "player", with: player } : null;
}
