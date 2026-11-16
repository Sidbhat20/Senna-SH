import Image from "next/image";
import Link from "next/link";
import type { Played } from "@/lib/fixtures/advance";
import { gamesText } from "@/lib/fixtures/scoring";
import { BYE } from "@/lib/fixtures/types";
import { SPORTS, type Category, type EventSummary, type Status } from "@/lib/data";
import type { DbMatch } from "@/lib/data";
import { scoreUnits } from "@/lib/sports";
import { currentUser } from "@/lib/supabase/server";

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
    <header className="border-b border-line bg-chalk print:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Sportshunt home">
          <Image src="/sh-logo.png" alt="" width={34} height={34} priority />
          {/* phones show just the mark so the nav fits on one line */}
          <span className="hidden font-display text-2xl font-bold tracking-tight sm:inline">Sportshunt</span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 whitespace-nowrap text-[14px] font-medium sm:gap-4 sm:text-[15px]">
          <Link href="/tournaments" className="rounded px-1.5 py-1 hover:bg-line/60 sm:px-2">
            <span className="sm:hidden">Events</span>
            <span className="hidden sm:inline">Tournaments</span>
          </Link>
          <Link href="/organise" className="rounded px-1.5 py-1 hover:bg-line/60 sm:px-2">Organise</Link>
          {user && <Link href="/referee" className="rounded px-1.5 py-1 hover:bg-line/60 sm:px-2">Scoring</Link>}
          {user ? (
            <form action="/auth/signout" method="post">
              <button className="rounded border border-ink px-2 py-1.5 hover:bg-ink hover:text-chalk sm:px-3">Log out</button>
            </form>
          ) : (
            <Link href="/login" className="rounded bg-ink px-2.5 py-1.5 text-chalk hover:bg-pitch sm:px-3">Log in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted">
        <span className="font-display text-base font-semibold text-ink">Get, set, hunt.</span>
        <span>Made for Bangalore&apos;s weekend leagues.</span>
        <a href="mailto:contact.sportshunt@gmail.com" className="hover:text-ink sm:ml-auto">contact.sportshunt@gmail.com</a>
      </div>
    </footer>
  );
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-line text-ink" },
  open: { label: "Registration open", cls: "bg-turf text-white" },
  locked: { label: "Entries closed", cls: "bg-ink text-chalk" },
  live: { label: "Live now", cls: "bg-flood text-ink" },
  completed: { label: "Finished", cls: "bg-line text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-danger text-white" },
};

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${s.cls}`}>
      {status === "live" && <span className="live-dot size-1.5 rounded-full bg-ink" aria-hidden />}
      {s.label}
    </span>
  );
}

export const sportName = (t: { sport: EventSummary["sport"] }) => SPORTS[t.sport];

const side = (name: string | null) => (name === BYE ? "Bye" : name ?? "To be decided");

/** One fixture as a row: used on tournament pages and the referee list. */
export function MatchRow({ m, label, href }: { m: Played & Partial<Pick<DbMatch, "court" | "at" | "games" | "penA" | "penB">>; label?: string; href?: string }) {
  const won = (n: string | null) => m.winner !== undefined && m.winner === n;
  const where = m.status !== "done" ? [m.court, m.at && time(m.at)].filter(Boolean).join(", ") : "";
  const body = (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-3">
      {(label || where) && (
        <div className="col-span-2 flex justify-between gap-3 text-[13px] text-muted">
          <span className="truncate">{label}</span>
          {where && <span className="shrink-0 font-semibold text-ink">{where}</span>}
        </div>
      )}
      {(["a", "b"] as const).map((k) => {
        const name = m[k];
        const sc = k === "a" ? m.scoreA : m.scoreB;
        return (
          <div key={k} className="contents">
            <div className={`truncate ${won(name) ? "font-semibold" : ""} ${!name || name === BYE ? "text-muted" : ""}`}>{side(name)}</div>
            <div className={`tabular font-display text-xl leading-tight ${won(name) ? "font-bold" : "font-medium text-muted"}`}>
              {sc ?? (m.status === "scheduled" ? "" : "–")}
            </div>
          </div>
        );
      })}
      {m.status === "live" && (
        <div className="col-span-2 mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <span className="live-dot size-2 rounded-full bg-flood" aria-hidden /> In play
        </div>
      )}
      {m.games && gamesText(m.games) && <div className="tabular col-span-2 text-[13px] text-muted">{gamesText(m.games)}</div>}
      {m.penA !== undefined && m.penB !== undefined && (
        <div className="tabular col-span-2 text-[13px] text-muted">Penalties {m.penA}-{m.penB}</div>
      )}
      {m.walkover && m.a !== BYE && m.b !== BYE && <div className="col-span-2 text-[13px] text-muted">Walkover</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded px-2 hover:bg-line/40">{body}</Link>
  ) : (
    body
  );
}

/** An event as a fixture-list row: date block, name and place, categories and fee, status. */
export function EventRow({ t }: { t: EventSummary }) {
  const d = new Date(t.startsAt);
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }).format(d);
  const mon = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(d);
  const left = t.categories.reduce((s, c) => s + Math.max(0, c.maxEntries - c.entryCount), 0);
  const cats = t.categories.length;
  return (
    <li>
      <Link href={`/t/${t.slug}`} className="-mx-3 grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-2 rounded-lg px-3 py-4 hover:bg-line/40 sm:grid-cols-[3.5rem_1fr_auto]">
        <div className="row-span-2 text-center leading-none sm:row-span-1">
          <div className="tabular font-display text-3xl font-bold">{day}</div>
          <div className="text-[13px] text-muted">{mon}</div>
        </div>
        <div className="flex min-w-0 gap-3">
          {t.posterUrl && (
            <Image src={t.posterUrl} alt="" width={48} height={68} className="h-[68px] w-12 shrink-0 rounded-md border border-line object-cover" />
          )}
          <div className="min-w-0">
          <div className="font-display text-xl font-semibold leading-tight">{t.title}</div>
          <div className="mt-0.5 text-[15px] text-muted">
            {SPORTS[t.sport]} at {[t.venue, t.area].filter(Boolean).join(", ")}
            {cats > 1 && <span>, {cats} categories</span>}
          </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] sm:justify-end">
          {t.status === "open" && (
            <span className={left <= 3 ? "font-semibold text-danger" : "text-muted"}>
              {left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} left` : "Full"}
            </span>
          )}
          <span>{feeRange(t.categories)}</span>
          <StatusPill status={t.status} />
        </div>
      </Link>
    </li>
  );
}
