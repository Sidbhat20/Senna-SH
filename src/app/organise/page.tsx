import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clipboard } from "@/components/iso/scenes";
import { date, EventMedia, sportName } from "@/components/ui";
import { myEvents, SPORTS, type MyEvent } from "@/lib/data";
import { shareLinks } from "@/lib/notify";
import { filterEvents } from "@/lib/organise";
import { CopyText } from "@/components/CopyText";

export const metadata: Metadata = { title: "Your tournaments", robots: { index: false } };

function EventCard({ e }: { e: MyEvent }) {
  const entries = e.categories.reduce((s, c) => s + c.entryCount, 0);
  const unpaid = e.categories.reduce((s, c) => s + c.pendingCount, 0);
  const share = e.status !== "draft" && e.status !== "cancelled" ? shareLinks(e) : null;
  const cats = e.categories.length;
  const link = "inline-flex h-11 items-center rounded-[6px] border px-4 text-[15px] font-semibold";
  const quiet = `${link} border-line bg-surface hover:border-ink`;
  const share_ = "inline-flex min-h-11 items-center rounded px-1 font-semibold underline-offset-4 hover:underline";
  return (
    <li className="flex flex-col overflow-hidden rounded-[6px] border border-line bg-surface md:flex-row">
      <Link href={`/t/${e.slug}`} className="block md:w-72 md:shrink-0" tabIndex={-1} aria-hidden>
        <EventMedia t={e} />
      </Link>
      <div className="min-w-0 flex-1 p-5">
        {e.role === "co_organiser" && <p className="text-[13px] text-muted">You co-organise this</p>}
        <h3 className="font-display text-[1.75rem] font-extrabold leading-[1.05] tracking-tight">
          <Link href={`/t/${e.slug}`} className="hover:underline">{e.title}</Link>
        </h3>
        <p className="mt-1 text-[15px] text-muted">
          {sportName(e)} · <span className="font-score">{date(e.startsAt)}</span> · {e.venue}
        </p>
        <p className="mt-1 text-[15px]">
          <span className="font-score font-bold">{entries}</span> {entries === 1 ? "entry" : "entries"}
          {unpaid ? <> · <span className="font-semibold text-danger">{unpaid} unpaid</span></> : null} in {cats} {cats === 1 ? "category" : "categories"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/t/${e.slug}/manage`} className={`${link} border-ink bg-ink text-on-ink hover:bg-ink/85`}>Manage</Link>
          <Link href={`/t/${e.slug}`} className={quiet}>Event page</Link>
          {e.status !== "draft" && <Link href={`/t/${e.slug}/desk`} className={quiet}>Desk</Link>}
          <Link href={`/t/${e.slug}?view=schedule`} className={quiet}>Order of play</Link>
        </div>
        {share && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px]">
            <span className="mr-1 text-muted">Share</span>
            <a href={share.whatsapp} target="_blank" rel="noopener noreferrer" className={share_}>WhatsApp</a>
            <a href={share.x} target="_blank" rel="noopener noreferrer" className={share_}>X</a>
            <a href={share.facebook} target="_blank" rel="noopener noreferrer" className={share_}>Facebook</a>
            <CopyText text={share.url} label="Copy link" className={share_} />
            <span className="text-muted">(paste it into Instagram)</span>
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
  const field = "line-input w-auto text-[15px]";

  return (
    <div className="calm mx-auto max-w-4xl px-4 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">Your tournaments</h1>
        <Link href="/organise/new" className="inline-flex h-12 items-center rounded-[6px] chunky press bg-turf px-6 font-semibold text-on-turf hover:bg-turf-hover">
          Create a tournament
        </Link>
      </div>

      {none ? (
        <div className="mt-10 flex flex-col gap-5 rounded-[6px] chunky bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <Clipboard className="w-44 shrink-0" />
          <div className="flex-1">
            <p className="font-display text-2xl font-extrabold leading-tight">Your first tournament is two minutes away.</p>
            <p className="mt-1 text-muted">
              Create one in about two minutes: pick the sport and categories, set your courts, and share the page. Entries, draws,
              the order of play and live scores all run from here.
            </p>
            <Link href="/organise/new" className="mt-4 inline-flex h-12 items-center rounded-[6px] chunky press bg-turf px-6 font-bold text-on-turf">Create a tournament</Link>
          </div>
        </div>
      ) : (
        <>
          <form role="search" className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-3">
            <input name="q" defaultValue={f.q ?? ""} placeholder="Search by name" aria-label="Search your tournaments" className={`${field} min-w-0 flex-1 basis-48`} />
            <select name="sport" defaultValue={f.sport ?? ""} aria-label="Sport" className={field}>
              <option value="">Any sport</option>
              {Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="status" defaultValue={f.status ?? ""} aria-label="Status" className={field}>
              {STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="h-11 rounded-full bg-ink px-5 font-semibold text-on-ink press">Filter</button>
            {filtering && <Link href="/organise" className="inline-flex h-11 items-center px-2 text-[15px] underline underline-offset-4">Clear</Link>}
          </form>
          {filtering && !mine.active.length && !mine.past.length && <p className="mt-6 text-muted">No tournaments match. Try fewer filters.</p>}
          <section className="mt-8" aria-labelledby="active">
            <h2 id="active" className="font-display text-2xl font-extrabold">Coming up and live</h2>
            {mine.active.length || filtering ? (
              <ul className="mt-4 space-y-4">{mine.active.map((e) => <EventCard key={e.id} e={e} />)}</ul>
            ) : (
              <p className="mt-2 text-muted">Nothing coming up. Your finished tournaments are below.</p>
            )}
          </section>
          {mine.past.length > 0 && (
            <section className="mt-10" aria-labelledby="past">
              <h2 id="past" className="font-display text-2xl font-extrabold">Finished</h2>
              <ul className="mt-4 space-y-4">{mine.past.map((e) => <EventCard key={e.id} e={e} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
