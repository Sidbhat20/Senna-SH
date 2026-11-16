import type { Metadata } from "next";
import Link from "next/link";
import { EventRow } from "@/components/ui";
import { listEvents, SPORTS, type Sport, type Status } from "@/lib/data";

export const metadata: Metadata = { title: "Tournaments" };

const STATUSES: { value?: Status; label: string }[] = [
  { label: "All" },
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

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ sport?: string; status?: string }> }) {
  const { sport, status } = await searchParams;
  const all = await listEvents();
  const list = all.filter((t) => (!sport || t.sport === sport) && (!status || t.status === status));
  const href = (p: { sport?: string; status?: string }) => {
    const q = new URLSearchParams(Object.entries({ sport, status, ...p }).filter(([, v]) => v) as [string, string][]);
    return q.size ? `/tournaments?${q}` : "/tournaments";
  };
  // Only offer sports that have tournaments, so no chip leads to an empty list.
  const sports = [...new Set(all.map((t) => t.sport))] as Sport[];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <h1 className="font-display text-5xl font-bold">Tournaments in Bangalore</h1>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Chip key={s.label} href={href({ status: s.value ?? "" })} active={(status ?? "") === (s.value ?? "")}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by sport">
          <Chip href={href({ sport: "" })} active={!sport}>Every sport</Chip>
          {sports.map((s) => (
            <Chip key={s} href={href({ sport: s })} active={sport === s}>{SPORTS[s]}</Chip>
          ))}
        </div>
      </div>

      {list.length ? (
        <ul className="mt-6 divide-y divide-line">
          {list.map((t) => <EventRow key={t.slug} t={t} />)}
        </ul>
      ) : (
        <div className="mt-10 max-w-md">
          <p className="text-lg">{sport || status ? "Nothing matches those filters yet." : "No tournaments yet."}</p>
          <p className="mt-1 text-muted">{sport || status ? "Clear a filter, or be the first to run one." : "Be the first to run one."}</p>
          <Link href="/organise/new" className="mt-4 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-chalk hover:bg-pitch">
            Create a tournament
          </Link>
        </div>
      )}
    </div>
  );
}
