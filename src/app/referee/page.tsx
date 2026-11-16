import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchRow } from "@/components/ui";
import { myScoring } from "@/lib/data";

export const metadata: Metadata = { title: "Scoring", robots: { index: false } };

export default async function Scoring() {
  const events = await myScoring();
  return (
    <div className="mx-auto max-w-xl px-4 pt-10">
      <h1 className="font-display text-5xl font-bold">Your matches to score</h1>
      {events.length === 0 && (
        <p className="mt-3 text-muted">
          Nothing to score. If an organiser sent you a referee link, open it on this phone to get your court.
        </p>
      )}
      {events.map(({ event, court, matches }) => (
        <section key={event.id} className="mt-8">
          <LiveRefresh eventId={event.id} />
          <h2 className="font-display text-2xl font-bold">{event.title}</h2>
          <p className="text-muted">{court ? `${court} only` : "All courts"}</p>
          {matches.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">No matches ready yet. They appear once both sides are known.</p>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {matches.map((m) => <MatchRow key={m.id} m={m} label={m.category} href={`/referee/match/${m.id}`} />)}
            </div>
          )}
          <Link href={`/t/${event.slug}?view=schedule`} className="mt-3 inline-block font-medium text-turf-dark underline-offset-4 hover:underline">
            Full order of play
          </Link>
        </section>
      ))}
    </div>
  );
}
