import Link from "next/link";

export type TickerItem = { id: string; label: string; a: string; b: string; scoreA?: number; scoreB?: number; href?: string };

/** Matches in play, scrolling past like a broadcast ticker (pure CSS, no client JS). Nothing live: renders nothing
 *  (no dead "LIVE" bar). Reduced motion: the scroll stops and the row can be scrolled by hand. */
export function LiveTicker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const loop = items.length > 2;
  const row = (copy: number) => items.map((m) => {
    const body = (
      <span className="inline-flex items-center gap-3 whitespace-nowrap px-5 text-[15px]">
        <span className="font-score text-[11px] uppercase tracking-[0.14em] text-muted">{m.label}</span>
        <span className="font-semibold">{m.a}</span>
        <span className="font-score text-[15px] font-semibold text-turf">{m.scoreA ?? 0}–{m.scoreB ?? 0}</span>
        <span className="font-semibold">{m.b}</span>
      </span>
    );
    return (
      <li key={`${copy}-${m.id}`} aria-hidden={copy > 0 || undefined} className="flex items-center">
        {m.href && copy === 0 ? <Link href={m.href} className="min-h-11 content-center hover:underline">{body}</Link> : body}
        <span aria-hidden className="h-4 w-px bg-line" />
      </li>
    );
  });
  return (
    <section aria-label="Live now" className="flex items-stretch overflow-hidden border-y border-line bg-surface text-ink">
      <div className="z-10 flex shrink-0 items-center gap-2 bg-clay px-4 font-score text-[12px] font-semibold uppercase tracking-[0.16em] text-on-clay">
        <span className="live-dot size-1.5 rounded-full bg-on-clay" aria-hidden /> Live
      </div>
      <div className={`min-w-0 flex-1 ${loop ? "overflow-hidden motion-reduce:overflow-x-auto" : "overflow-x-auto"}`}>
        <ul className={`flex w-max items-center py-2 ${loop ? "ticker hover:[animation-play-state:paused]" : ""}`}
          style={loop ? { animationDuration: `${items.length * 6}s` } : undefined}>
          {row(0)}
          {loop && row(1)}
        </ul>
      </div>
    </section>
  );
}
