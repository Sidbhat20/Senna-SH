import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { EventRow } from "@/components/ui";
import { listEvents, SPORTS, type Sport, type Status } from "@/lib/data";
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
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-[15px] ${active ? "border-ink bg-ink text-chalk" : "border-line hover:border-ink"}`}
    >
      {children}
    </Link>
  );
}

type Props = { searchParams: Promise<{ sport?: string; status?: string; page?: string }> };

export default async function TournamentsPage({ searchParams }: Props) {
  const raw = await searchParams;
  // Only known values reach the query; anything else is treated as "no filter".
  const status = STATUSES.find((s) => s.value && s.value === raw.status)?.value;
  const sport = LAUNCH_SPORTS.includes(raw.sport as Sport) ? (raw.sport as Sport) : undefined;
  const page = Math.max(0, Math.trunc(Number(raw.page) || 0));
  const { events, more } = await listEvents({ status, sport, page });

  const href = (p: { sport?: string; status?: string; page?: number }) => {
    const merged = { sport, status, ...p, page: p.page ? String(p.page) : undefined };
    const q = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    return q.size ? `/tournaments?${q}` : "/tournaments";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <h1 className="font-display text-5xl font-bold">Tournaments in Bangalore</h1>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Chip key={s.label} href={href({ status: s.value ?? "" })} active={status === s.value}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sport">
          <Chip href={href({ sport: "" })} active={!sport}>Every sport</Chip>
          {LAUNCH_SPORTS.map((s) => (
            <Chip key={s} href={href({ sport: s })} active={sport === s}>{SPORTS[s]}</Chip>
          ))}
        </div>
      </div>

      {events.length ? (
        <>
          <ul className="mt-6 divide-y divide-line">
            {events.map((t) => <EventRow key={t.slug} t={t} />)}
          </ul>
          {(page > 0 || more) && (
            <nav aria-label="Pages" className="mt-6 flex gap-3">
              {page > 0 && (
                <Link href={href({ page: page - 1 })} className="rounded-lg border border-ink px-4 py-2 font-semibold">Previous</Link>
              )}
              {more && (
                <Link href={href({ page: page + 1 })} className="rounded-lg border border-ink px-4 py-2 font-semibold">Show more</Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="mt-10 flex max-w-xl items-start gap-5">
          <Art name="trophy" size={96} />
          <div>
          <p className="text-lg">{sport || status || page ? "Nothing matches those filters yet." : "No tournaments coming up yet."}</p>
          <p className="mt-1 text-muted">{sport || status ? "Clear a filter, or be the first to run one." : "Be the first to run one."}</p>
          <Link href="/organise/new" className="mt-4 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-chalk hover:bg-pitch">
            Create a tournament
          </Link>
          </div>
        </div>
      )}
    </div>
  );
}
