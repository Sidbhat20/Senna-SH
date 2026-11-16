// Organiser overview: KPIs and a readiness checklist computed from the event the workspace already loads.
// Pure functions, so they're unit-tested without a database.
import type { EventDetail } from "./data";
import { BYE } from "./fixtures/types";

export type Kpis = {
  confirmed: number; pending: number; withdrawn: number;
  unpaid: { count: number; rupees: number }; claimed: { count: number; rupees: number };
  spotsLeft: number; live: number; scheduled: number;
  next: { court: string | null; at: string; category: string } | null;
};

const real = (m: { a: string | null; b: string | null }) => m.a !== BYE && m.b !== BYE;

export function kpis(ev: EventDetail, now = Date.now()): Kpis {
  const k: Kpis = { confirmed: 0, pending: 0, withdrawn: 0, unpaid: { count: 0, rupees: 0 }, claimed: { count: 0, rupees: 0 }, spotsLeft: 0, live: 0, scheduled: 0, next: null };
  for (const c of ev.categories) {
    let taken = 0;
    for (const e of c.entryRows) {
      if (e.status === "withdrawn") { k.withdrawn++; continue; }
      taken++;
      if (e.status === "confirmed") k.confirmed++;
      else k.pending++;
      if (e.status === "pending" && (e.paymentStatus === "unpaid" || e.paymentStatus === "claimed")) {
        const bucket = e.paymentStatus === "unpaid" ? k.unpaid : k.claimed;
        bucket.count++;
        bucket.rupees += c.entryFee;
      }
    }
    if (c.status === "open") k.spotsLeft += Math.max(c.maxEntries - taken, 0);
    for (const m of c.matches) {
      if (!real(m) || m.walkover) continue;
      if (m.status === "live") k.live++;
      if (m.status === "scheduled") {
        k.scheduled++;
        if (m.at && +new Date(m.at) >= now - 15 * 60_000 && (!k.next || m.at < k.next.at)) k.next = { court: m.court ?? null, at: m.at, category: c.name };
      }
    }
  }
  return k;
}

export type Check = { key: string; label: string; done: boolean; href: string; hint?: string };

type Cat = EventDetail["categories"][number];
const confirmedIn = (c: Cat) => c.entryRows.filter((e) => e.status === "confirmed").length;
const minToDraw = (c: Cat) => (c.format === "groups_knockout" ? 4 : 2); // same rule as drawFixtures

/** What still needs doing before (and on) match day. `href` is relative to /t/[slug]. */
export function readiness(ev: EventDetail, officials: number, now = Date.now()): Check[] {
  const active = ev.categories.filter((c) => c.status !== "cancelled");
  const paid = active.some((c) => c.entryFee > 0);
  const drawn = active.length > 0 && active.every((c) => c.matches.length > 0);
  const timed = active.flatMap((c) => c.matches).filter((m) => real(m) && !m.walkover);
  return [
    { key: "details", label: "Venue, first match and rules filled in", done: !!ev.venue.trim() && ev.rules.length > 0, href: "/manage/details" },
    ...(paid ? [{ key: "upi", label: "UPI ID set for entry fees", done: !!ev.upiId, href: "/manage/settings#fees", hint: "Only the owner can set it." }] : []),
    { key: "courts", label: "At least one court", done: ev.courts.length > 0, href: "/manage/settings#courts" },
    { key: "entries", label: "Entries open, or closed on purpose", done: active.length > 0 && active.every((c) => c.status !== "open" || +new Date(ev.regClosesAt) > now), href: "/manage/categories" },
    { key: "enough", label: "Enough confirmed entries to draw", done: active.length > 0 && active.every((c) => c.matches.length > 0 || confirmedIn(c) >= minToDraw(c)), href: "/manage/entries" },
    { key: "drawn", label: "Fixtures drawn", done: drawn, href: "/manage/fixtures" },
    { key: "times", label: "Order of play has times", done: drawn && timed.length > 0 && timed.every((m) => !!m.at), href: "/manage/schedule" },
    { key: "staff", label: "A referee or co-organiser has joined", done: officials > 0, href: "/manage/settings#staff" },
  ];
}

/** True only when some open or closed category has enough confirmed entries and no fixtures yet. */
export function readyToDraw(ev: EventDetail) {
  return ev.categories.some((c) => (c.status === "open" || c.status === "locked") && c.matches.length === 0 && confirmedIn(c) >= minToDraw(c));
}

/** Live, still to play, and done (walkovers included), ignoring byes. */
export function matchCounts(ms: { a: string | null; b: string | null; status: string; walkover?: boolean }[]) {
  const real = ms.filter((m) => m.a !== BYE && m.b !== BYE);
  return {
    live: real.filter((m) => m.status === "live").length,
    scheduled: real.filter((m) => m.status === "scheduled").length,
    done: real.filter((m) => m.status === "done").length,
  };
}
