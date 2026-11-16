import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Art } from "@/components/Art";
import { date, sportName, StatusPill } from "@/components/ui";
import { myEvents, type MyEvent } from "@/lib/data";

export const metadata: Metadata = { title: "Your tournaments", robots: { index: false } };

function EventCard({ e }: { e: MyEvent }) {
  const entries = e.categories.reduce((s, c) => s + c.entryCount, 0);
  const cats = e.categories.length;
  const link = "rounded-lg border border-line bg-white px-3 py-1.5 text-[15px] font-semibold hover:border-ink";
  return (
    <li className="flex gap-4 py-5">
      {e.posterUrl ? (
        <Image src={e.posterUrl} alt="" width={56} height={80} className="h-20 w-14 shrink-0 rounded-md border border-line object-cover" />
      ) : (
        <div className="tabular w-14 shrink-0 text-center leading-none">
          <div className="font-display text-3xl font-bold">{new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(e.startsAt))}</div>
          <div className="text-[13px] text-muted">{new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(new Date(e.startsAt))}</div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={e.status} />
          {e.role === "co_organiser" && <span className="text-[13px] text-muted">You co-organise this</span>}
        </div>
        <h3 className="mt-1 font-display text-2xl font-semibold leading-tight">
          <Link href={`/t/${e.slug}`} className="hover:underline">{e.title}</Link>
        </h3>
        <p className="text-[15px] text-muted">
          {sportName(e)}, {date(e.startsAt)}, {e.venue}. {entries} {entries === 1 ? "entry" : "entries"} in {cats} {cats === 1 ? "category" : "categories"}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/t/${e.slug}`} className={link}>Event page</Link>
          {e.status !== "draft" && <Link href={`/t/${e.slug}/desk`} className={link}>Desk</Link>}
          <Link href={`/t/${e.slug}?view=schedule`} className={link}>Order of play</Link>
        </div>
      </div>
    </li>
  );
}

export default async function OrganiserHome() {
  const mine = await myEvents();
  if (!mine) redirect("/login?next=/organise"); // middleware normally catches this first
  const none = !mine.active.length && !mine.past.length;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-bold">Your tournaments</h1>
        <Link href="/organise/new" className="rounded-lg bg-turf px-5 py-3 font-semibold text-white hover:bg-turf-dark">
          Create a tournament
        </Link>
      </div>

      {none ? (
        <div className="mt-10 flex max-w-2xl items-start gap-6">
          <Art name="trophy" size={120} />
          <div>
          <p className="text-lg">You haven&apos;t run a tournament here yet.</p>
          <p className="mt-2 text-muted">
            Create one in about two minutes: pick the sport and categories, set your courts, and share the page. Entries, draws,
            the order of play and live scores all run from here.
          </p>
          </div>
        </div>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="active">
            <h2 id="active" className="font-display text-2xl font-bold">Coming up and live</h2>
            {mine.active.length ? (
              <ul className="divide-y divide-line">{mine.active.map((e) => <EventCard key={e.id} e={e} />)}</ul>
            ) : (
              <p className="mt-2 text-muted">Nothing coming up. Your finished tournaments are below.</p>
            )}
          </section>
          {mine.past.length > 0 && (
            <section className="mt-10" aria-labelledby="past">
              <h2 id="past" className="font-display text-2xl font-bold">Finished</h2>
              <ul className="divide-y divide-line">{mine.past.map((e) => <EventCard key={e.id} e={e} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
