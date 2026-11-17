import { time } from "@/components/ui";
import { getEvent, type DbMatch } from "@/lib/data";
import { BYE } from "@/lib/fixtures/types";
import { timeline } from "@/lib/timeline";
import { OrderOfPlay, scorable } from "../../views";

const PX = 3; // pixels per minute
const TONE: Record<string, string> = {
  live: "border border-line bg-clay font-bold text-on-clay",
  done: "border-2 border-line bg-surface text-muted",
  scheduled: "border border-line text-ink",
};
// One colour per court, so a glance tells courts apart (soft fills; ink text stays readable on all of them).
const COURT_FILL = ["#DCF2E3", "#DCEEFF", "#FFF0C2", "#FFE1D3", "#EDE3FF", "#E5F5D0"];

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  const days = timeline(ev.categories.flatMap((c) => c.matches), ev.courts, ev.matchMinutes, BYE);
  const href = (m: DbMatch) => (scorable(m) ? `/referee/match/${m.id}` : undefined);
  const dayName = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${d}T12:00:00+05:30`));

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Schedule</h2>
        <p className="max-w-prose text-muted">
          Courts down the side, time along the top. Live matches are highlighted. To move a match, use Move in the list below; clashes are refused with the reason.
        </p>
      </div>

      {days.length === 0 ? (
        <p className="text-muted">Match times appear here once you draw fixtures.</p>
      ) : days.map((d) => {
        const hours = Array.from({ length: Math.ceil(d.minutes / 60) + 1 }, (_, i) => i * 60).filter((m) => m <= d.minutes);
        return (
          <section key={d.day} aria-label={dayName(d.day)}>
            <h3 className="mb-2 font-display text-xl font-bold">{dayName(d.day)}</h3>
            <div className="overflow-x-auto rounded-[6px] border border-line bg-surface">
              <div className="relative" style={{ width: `calc(7rem + ${d.minutes * PX + 16}px)` }}>
                <div className="relative ml-28 h-7 border-b border-line text-[12px] text-muted">
                  {hours.map((m) => (
                    <span key={m} className="tabular absolute top-1.5" style={{ left: m * PX }}>{time(new Date(d.start + m * 60_000).toISOString())}</span>
                  ))}
                </div>
                {d.courts.map((c, ci) => (
                  <div key={c.id} className="flex border-b border-line last:border-0">
                    <div className="sticky left-0 z-10 w-28 shrink-0 border-r border-line bg-surface px-3 py-3 text-[14px] font-semibold">{c.name}</div>
                    <ol className="relative h-14 flex-1" aria-label={`${c.name} matches`}>
                      {c.blocks.map((b) => (
                        <li key={b.id} title={`${time(b.at)} ${b.label}`}
                          className={`absolute top-1.5 h-11 overflow-hidden rounded-[8px] px-1.5 py-1 text-[12px] leading-tight ${TONE[b.status] ?? TONE.scheduled}`}
                          style={{ left: b.left * PX, width: b.width * PX - 4, ...(b.status === "scheduled" ? { background: COURT_FILL[ci % COURT_FILL.length] } : {}) }}>
                          <span className="tabular block">{time(b.at)}{b.status === "live" ? " · live" : ""}</span>
                          <span className="block truncate">{b.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <OrderOfPlay ev={ev} href={href} />
    </div>
  );
}
