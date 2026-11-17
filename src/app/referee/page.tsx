import type { Metadata } from "next";
import Link from "next/link";
import { Clipboard } from "@/components/iso/scenes";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchRow } from "@/components/ui";
import { myScoring } from "@/lib/data";

export const metadata: Metadata = { title: "Scoring", robots: { index: false } };

export default async function Scoring() {
  const events = await myScoring();
  return (
    <div className="mx-auto max-w-xl px-4 pt-10">
      <h1 className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">Your matches to score</h1>
      {events.length === 0 && (
        <div className="mt-6 rounded-[6px] chunky bg-surface p-6 text-center">
          <Clipboard className="mx-auto w-44" />
          <p className="mt-3 font-display text-2xl font-extrabold leading-tight">No matches on your clipboard.</p>
          <p className="mt-1 text-muted">Got a referee link from an organiser? Open it on this phone and your court shows up here.</p>
          <Link href="/tournaments" className="mt-4 inline-flex h-11 items-center rounded-[6px] chunky press bg-surface px-4 font-bold">See tournaments</Link>
        </div>
      )}
      {events.map(({ event, court, matches }) => (
        <section key={event.id} className="mt-8">
          <LiveRefresh eventId={event.id} />
          <h2 className="font-display text-2xl font-extrabold">{event.title}</h2>
          <p className="text-muted">{court ? `${court} only` : "All courts"}</p>
          {matches.length === 0 ? (
            <p className="mt-3 text-[15px] text-muted">No matches ready yet. They appear once both sides are known.</p>
          ) : (
            <div className="mt-3 rounded-[6px] border border-line bg-surface px-4 py-1 divide-y divide-line">
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
