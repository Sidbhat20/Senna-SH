import type { Metadata } from "next";
import Link from "next/link";
import { EmptyCourt } from "@/components/iso/scenes";
import { EVENT_GRID, EventRow } from "@/components/ui";
import { listEvents, SPORTS, type Sport, type Status } from "@/lib/data";
import { searchTerm } from "@/lib/organise";
import { LAUNCH_SPORTS } from "@/lib/sports";

export const metadata: Metadata = { title: "Tournaments" };

const STATUSES: { value?: Status; label: string }[] = [
  { label: "Coming up and live" },
  { value: "open", label: "Open for entries" },
  { value: "live", label: "Live now" },
  { value: "completed", label: "Finished" },
];

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`relative inline-flex min-h-11 shrink-0 items-center text-[15px] transition-colors duration-300 ${active ? "font-medium text-ink" : "text-muted hover:text-ink"}`}>
      {children}
      <span aria-hidden className={`absolute inset-x-0 bottom-1.5 h-0.5 rounded-full bg-flood transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left ${active ? "scale-x-100" : "scale-x-0"}`} />
    </Link>
  );
}

type Props = { searchParams: Promise<{ sport?: string; status?: string; page?: string; q?: string }> };

export default async function TournamentsPage({ searchParams }: Props) {
  const raw = await searchParams;
  // Only known values reach the query; anything else is treated as "no filter".
  const status = STATUSES.find((s) => s.value && s.value === raw.status)?.value;
  const sport = LAUNCH_SPORTS.includes(raw.sport as Sport) ? (raw.sport as Sport) : undefined;
  const page = Math.max(0, Math.trunc(Number(raw.page) || 0));
  const q = searchTerm(raw.q);
  const { events, more } = await listEvents({ status, sport, page, q });

  const href = (p: { sport?: string; status?: string; page?: number; q?: string }) => {
    const merged = { sport, status, q: q || undefined, ...p, page: p.page ? String(p.page) : undefined };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return qs.size ? `/tournaments?${qs}` : "/tournaments";
  };

  return (
    <>
    <section className="border-b border-line">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-10 md:px-6 md:pt-14">
        <h1 className="font-display text-[clamp(3.5rem,9vw,8rem)] leading-[0.86]">Tournaments<br />in Bangalore</h1>
        <p className="mt-5 max-w-xl text-muted">Badminton, pickleball, TT and more. Filter by sport, or search a venue you know.</p>
        <form role="search" action="/tournaments" className="mt-6 flex max-w-xl gap-2">
          {sport && <input type="hidden" name="sport" value={sport} />}
          {status && <input type="hidden" name="status" value={status} />}
          <label className="relative flex-1">
            <span className="sr-only">Search by name, venue or area</span>
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input name="q" defaultValue={q} placeholder="Search name, venue or area" maxLength={60}
              className="h-12 w-full rounded-[6px] border border-line bg-surface pl-11 pr-3 text-ink focus:outline-none focus-visible:outline-3" />
          </label>
          <button className="h-12 rounded-[6px] chunky press bg-turf px-5 font-bold text-on-turf">Search</button>
        </form>
      </div>
    </section>
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
      <div className="space-y-3">
        <div className="flex gap-x-7 overflow-x-auto border-b border-line" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Chip key={s.label} href={href({ status: s.value ?? "" })} active={status === s.value}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-x-6 overflow-x-auto" role="group" aria-label="Filter by sport">
          <Chip href={href({ sport: "" })} active={!sport}>Every sport</Chip>
          {LAUNCH_SPORTS.map((s) => (
            <Chip key={s} href={href({ sport: s })} active={sport === s}>{SPORTS[s]}</Chip>
          ))}
        </div>
      </div>

      {events.length ? (
        <>
          <ul className={`mt-6 ${EVENT_GRID}`}>
            {events.map((t) => <EventRow key={t.slug} t={t} />)}
          </ul>
          {(page > 0 || more) && (
            <nav aria-label="Pages" className="mt-6 flex gap-3">
              {page > 0 && (
                <Link href={href({ page: page - 1 })} className="inline-flex h-11 items-center rounded-[6px] border border-ink px-4 font-semibold">Previous</Link>
              )}
              {more && (
                <Link href={href({ page: page + 1 })} className="inline-flex h-11 items-center rounded-[6px] border border-ink px-4 font-semibold">Show more</Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="mt-8 flex flex-col gap-5 rounded-[6px] chunky bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <EmptyCourt className="w-48 shrink-0" />
          <div className="flex-1">
            <p className="font-display text-2xl font-extrabold leading-tight">
              {q ? `Nothing called “${q}” yet.` : sport || status || page ? "Nothing matches those filters yet." : "The court's empty this weekend."}
            </p>
            <p className="mt-1 text-muted">{q || sport || status ? "Clear a filter, or be the first to run one." : "Run the first one: it takes two minutes and it's free."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(q || sport || status) && <Link href="/tournaments" className="inline-flex h-12 items-center rounded-[6px] border border-line px-5 font-semibold hover:border-ink">Clear filters</Link>}
            <Link href="/organise/new" className="inline-flex h-12 items-center rounded-[6px] chunky press bg-turf px-5 font-semibold text-on-turf hover:bg-turf-hover">Create a tournament</Link>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
