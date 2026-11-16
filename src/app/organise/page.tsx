import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Art } from "@/components/Art";
import { date, sportName, StatusPill } from "@/components/ui";
import { myEvents, SPORTS, type MyEvent } from "@/lib/data";
import { shareLinks } from "@/lib/notify";
import { filterEvents } from "@/lib/organise";
import { CopyLink } from "@/app/t/[slug]/Panels";

export const metadata: Metadata = { title: "Your tournaments", robots: { index: false } };

function EventCard({ e }: { e: MyEvent }) {
  const entries = e.categories.reduce((s, c) => s + c.entryCount, 0);
  const unpaid = e.categories.reduce((s, c) => s + c.pendingCount, 0);
  const share = e.status !== "draft" && e.status !== "cancelled" ? shareLinks(e) : null;
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
          {sportName(e)}, {date(e.startsAt)}, {e.venue}. {entries} {entries === 1 ? "entry" : "entries"}{unpaid ? `, ${unpaid} unpaid` : ""} in {cats} {cats === 1 ? "category" : "categories"}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/t/${e.slug}/manage`} className={`${link} border-ink bg-ink text-chalk hover:bg-pitch`}>Manage</Link>
          <Link href={`/t/${e.slug}`} className={link}>Event page</Link>
          {e.status !== "draft" && <Link href={`/t/${e.slug}/desk`} className={link}>Desk</Link>}
          <Link href={`/t/${e.slug}?view=schedule`} className={link}>Order of play</Link>
        </div>
        {share && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px]">
            <span className="text-muted">Share</span>
            <a href={share.whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">WhatsApp</a>
            <a href={share.x} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">X</a>
            <a href={share.facebook} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">Facebook</a>
            <div className="w-full sm:w-72"><CopyLink path={`/t/${e.slug}`} label="Link, or Instagram" /></div>
          </div>
        )}
      </div>
    </li>
  );
}

const STATUSES = [["", "Any status"], ["draft", "Draft"], ["open", "Taking entries"], ["locked", "Entries closed"], ["live", "Live"], ["completed", "Finished"], ["cancelled", "Cancelled"]];

type Props = { searchParams: Promise<{ q?: string; sport?: string; status?: string }> };

export default async function OrganiserHome({ searchParams }: Props) {
  const all = await myEvents();
  if (!all) redirect("/login?next=/organise"); // middleware normally catches this first
  const f = await searchParams;
  const filtering = !!(f.q?.trim() || f.sport || f.status);
  const mine = { active: filterEvents(all.active, f), past: filterEvents(all.past, f) };
  const none = !all.active.length && !all.past.length;
  const field = "h-10 rounded-lg border border-line bg-white px-3 text-[15px] focus:border-ink focus:outline-none";

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
          <form role="search" className="mt-8 flex flex-wrap gap-2">
            <input name="q" defaultValue={f.q ?? ""} placeholder="Search by name" aria-label="Search your tournaments" className={`${field} min-w-0 flex-1 basis-48`} />
            <select name="sport" defaultValue={f.sport ?? ""} aria-label="Sport" className={field}>
              <option value="">Any sport</option>
              {Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="status" defaultValue={f.status ?? ""} aria-label="Status" className={field}>
              {STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="h-10 rounded-lg bg-ink px-4 font-semibold text-chalk">Filter</button>
            {filtering && <Link href="/organise" className="inline-flex h-10 items-center px-2 text-[15px] underline underline-offset-4">Clear</Link>}
          </form>
          {filtering && !mine.active.length && !mine.past.length && <p className="mt-6 text-muted">No tournaments match. Try fewer filters.</p>}
          <section className="mt-8" aria-labelledby="active">
            <h2 id="active" className="font-display text-2xl font-bold">Coming up and live</h2>
            {mine.active.length || filtering ? (
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
