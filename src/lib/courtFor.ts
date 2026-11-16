/** Which court each event's scoring queue covers: null means every court (owners and co-organisers). */
export function courtFor(
  officiating: { event_id: string; court_id: string | null; role: string }[],
  organising: { id: string }[],
) {
  const m = new Map<string, string | null>();
  for (const o of officiating) m.set(o.event_id, o.role === "co_organiser" ? null : o.court_id);
  for (const e of organising) m.set(e.id, null);
  return m;
}
