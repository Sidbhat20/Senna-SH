import Image from "next/image";
import Link from "next/link";
import type { Played } from "@/lib/fixtures/advance";
import { gamesText } from "@/lib/fixtures/scoring";
import { BYE } from "@/lib/fixtures/types";
import { SPORTS, type Category, type EventSummary, type Status } from "@/lib/data";
import type { DbMatch } from "@/lib/data";
import { scoreUnits } from "@/lib/sports";
import { currentUser } from "@/lib/supabase/server";
import { sportPhoto } from "./Photo";
import { HeaderNav } from "./HeaderNav";

const fmtDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const fmtDateTime = new Intl.DateTimeFormat("en-IN", {
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
});
export const date = (iso: string) => fmtDate.format(new Date(iso));
export const dateTime = (iso: string) => fmtDateTime.format(new Date(iso));
export const rupees = (n: number) => (n === 0 ? "Free" : `₹${n.toLocaleString("en-IN")}`);
export const time = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const fmtDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "Born on or after 21 Dec 2013" for an age-limited category, else "". */
export const ageLimitText = (c: Pick<Category, "bornOnOrAfter" | "bornOnOrBefore">) =>
  c.bornOnOrAfter ? `Born on or after ${fmtDay.format(new Date(c.bornOnOrAfter))}`
  : c.bornOnOrBefore ? `Born on or before ${fmtDay.format(new Date(c.bornOnOrBefore))}` : "";
/** "Best of 3 games to 21" for racquet sports, "" for goals. */
export function scoringText(c: Pick<Category, "scoring">, sport: EventSummary["sport"]) {
  if (c.scoring.kind !== "games") return "";
  const u = scoreUnits(sport);
  const to = u.point === "game" ? `${c.scoring.pointsTo} games a set` : `to ${c.scoring.pointsTo}`;
  return c.scoring.bestOf === 1 ? `One ${u.part}, ${to}` : `Best of ${c.scoring.bestOf} ${u.part}s, ${to}`;
}
export const perEntry = (c: Pick<Category, "entryFee" | "entryType">) =>
  c.entryFee === 0 ? "Free entry" : `${rupees(c.entryFee)} per ${c.entryType === "team" ? "team" : "player"}`;
/** "Free", "₹500" or "From ₹300" across an event's categories. */
export function feeRange(cats: Pick<Category, "entryFee">[]) {
  const fees = cats.map((c) => c.entryFee);
  if (!fees.length || Math.max(...fees) === 0) return "Free entry";
  const lo = Math.min(...fees);
  return lo === Math.max(...fees) ? rupees(lo) : lo === 0 ? `Up to ${rupees(Math.max(...fees))}` : `From ${rupees(lo)}`;
}

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 px-4 md:h-16 md:flex-nowrap md:px-6">
        <Link href="/" className="flex h-14 shrink-0 items-center md:h-16" aria-label="Sportshunt home">
          <span className="font-display text-[26px] leading-none tracking-[0.01em] md:text-[28px]">Sportshunt</span>
          <span aria-hidden className="ml-1 size-2 self-start rounded-full bg-flood md:mt-[18px] mt-4" />
        </Link>
        <HeaderNav signedIn={!!user} logout={
          <form action="/auth/signout" method="post">
            <button className="inline-flex h-11 items-center px-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">Log out</button>
          </form>
        } />
      </div>
    </header>
  );
}

const FOOT_LINKS = [["/tournaments", "Tournaments"], ["/organise", "Organise"], ["/login", "Log in"]];

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line bg-bg print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <div className="font-display text-[clamp(3.5rem,12vw,9rem)] leading-[0.85]">Sportshunt</div>
        <div className="mt-8 grid gap-8 border-t border-line pt-8 sm:grid-cols-[1fr_auto]">
          <p className="max-w-sm text-[15px] text-muted">Bangalore&apos;s tournaments. Entered, drawn and scored live. Made for Indian sport.</p>
          <nav aria-label="Footer" className="text-[13px] font-semibold uppercase tracking-[0.12em]">
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {FOOT_LINKS.map(([href, label]) => (
                <li key={href}><Link href={href} className="inline-flex min-h-11 items-center hover:text-turf">{label}</Link></li>
              ))}
              <li><Link href="/credits" className="inline-flex min-h-11 items-center text-muted hover:text-ink">Photo credits</Link></li>
            </ul>
            <a href="mailto:contact.sportshunt@gmail.com" className="inline-flex min-h-11 items-center normal-case tracking-normal text-muted hover:text-ink">contact.sportshunt@gmail.com</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border border-line text-muted" },
  open: { label: "Entries open", cls: "bg-flood text-on-flood" },
  locked: { label: "Entries closed", cls: "border border-line text-ink" },
  live: { label: "Live", cls: "bg-clay text-on-clay" },
  completed: { label: "Final", cls: "border border-line text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-danger text-on-danger" },
};

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-[3px] px-2 font-score text-[11px] font-semibold uppercase tracking-[0.14em] ${s.cls}`}>
      {status === "live" && <span className="live-dot size-1.5 rounded-full bg-on-clay" aria-hidden />}
      {s.label}
    </span>
  );
}

export const sportName = (t: { sport: EventSummary["sport"] }) => SPORTS[t.sport];

const side = (name: string | null) => (name === BYE ? "Bye" : name ?? "To be decided");

/** One fixture as a scoreboard row: used on tournament pages, the desk and the referee list. */
export function MatchRow({ m, label, href }: { m: Played & Partial<Pick<DbMatch, "court" | "at" | "games" | "penA" | "penB">>; label?: string; href?: string }) {
  const won = (n: string | null) => m.winner !== undefined && m.winner === n;
  const decided = m.winner !== undefined;
  const where = m.status !== "done" ? [m.court, m.at && time(m.at)].filter(Boolean).join(", ") : "";
  const live = m.status === "live";
  const body = (
    <div className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-3 ${live ? "-mx-2 my-1 rounded-[6px] bg-surface px-3 shadow-live" : ""}`}>
      {(label || where || live) && (
        <div className="col-span-2 flex items-center justify-between gap-3 text-[13px] text-muted">
          <span className="truncate">{label}</span>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-flood px-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-on-flood">
              <span className="live-dot size-1.5 rounded-full bg-on-flood" aria-hidden /> In play
            </span>
          ) : where && <span className="font-score shrink-0 font-medium text-ink">{where}</span>}
        </div>
      )}
      {(["a", "b"] as const).map((k) => {
        const name = m[k];
        const sc = k === "a" ? m.scoreA : m.scoreB;
        return (
          <div key={k} className="contents">
            <div className={`truncate ${won(name) ? "font-bold" : decided ? "text-muted" : "font-medium"} ${!name || name === BYE ? "text-muted" : ""}`}>
              {side(name)}{won(name) && <span className="sr-only"> (winner)</span>}
            </div>
            <div className={`font-score text-[22px] leading-tight ${won(name) ? "font-bold" : decided ? "font-medium text-muted" : "font-bold"}`}>
              {sc ?? (m.status === "scheduled" ? "" : "–")}
            </div>
          </div>
        );
      })}
      {m.games && gamesText(m.games) && <div className="font-score col-span-2 text-[13px] text-muted">{gamesText(m.games)}</div>}
      {m.penA !== undefined && m.penB !== undefined && (
        <div className="font-score col-span-2 text-[13px] text-muted">Penalties {m.penA}-{m.penB}</div>
      )}
      {m.walkover && m.a !== BYE && m.b !== BYE && <div className="col-span-2 text-[13px] text-muted">Walkover</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded-[6px] px-2 transition-colors hover:bg-surface-2/70">{body}</Link>
  ) : (
    body
  );
}

/** A card's picture: the poster, or a monochrome photo for the sport; date and status on top. */
export function EventMedia({ t }: { t: Pick<EventSummary, "posterUrl" | "sport" | "startsAt" | "status"> }) {
  const d = new Date(t.startsAt);
  const day = new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
  const mon = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(d);
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
      <Image src={t.posterUrl ?? sportPhoto(t.sport)} alt="" fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
        className={`object-cover transition duration-[500ms] group-hover:scale-[1.03] motion-reduce:transform-none ${t.posterUrl ? "" : "photo"}`} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute left-3 top-3"><StatusPill status={t.status} /></div>
      <div className="absolute bottom-3 left-4 flex items-baseline gap-2 text-chalk">
        <span className="font-display text-4xl leading-none">{day}</span>
        <span className="font-score text-[12px] uppercase tracking-[0.14em]">{mon}</span>
      </div>
    </div>
  );
}

/** An event as a card: photo, title, place, fee and places left. Kept under its old name so callers don't change. */
export function EventRow({ t }: { t: EventSummary }) {
  const max = t.categories.reduce((s, c) => s + c.maxEntries, 0);
  const taken = t.categories.reduce((s, c) => s + Math.min(c.entryCount, c.maxEntries), 0);
  const left = max - taken;
  const cats = t.categories.length;
  return (
    <li>
      <Link href={`/t/${t.slug}`} className={`group flex h-full flex-col overflow-hidden rounded-[6px] chunky tilt bg-surface ${t.status === "live" ? "shadow-live" : ""}`}>
        <EventMedia t={t} />
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="font-score text-[11px] uppercase tracking-[0.14em] text-muted">{SPORTS[t.sport]}{cats > 1 && ` · ${cats} categories`}</p>
          <h3 className="font-display text-[1.75rem] leading-[1]">{t.title}</h3>
          <p className="text-[14px] text-muted">{[t.venue, t.area].filter(Boolean).join(", ")}</p>
          <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-3 font-score text-[13px]">
            <span className="font-semibold">{feeRange(t.categories)}</span>
            {t.status === "open" && (
              <span className={left <= 3 ? "font-semibold text-danger" : "text-muted"}>{left > 0 ? `${left} ${left === 1 ? "place" : "places"} left` : "Full"}</span>
            )}
          </div>
          {t.status === "open" && max > 0 && (
            <div className="h-0.5 overflow-hidden bg-line" aria-hidden>
              <div className={`h-full ${left <= 3 ? "bg-danger" : "bg-flood"}`} style={{ width: `${Math.round((taken / max) * 100)}%` }} />
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

/** The grid EventRow cards sit in. */
export const EVENT_GRID = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3";
