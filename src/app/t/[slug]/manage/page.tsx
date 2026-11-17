import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { CheckSticker } from "@/components/iso/scenes";
import { dateTime, time } from "@/components/ui";
import { eventStaff, getEvent } from "@/lib/data";
import { whatsappShare } from "@/lib/notify";
import { kpis, readiness, readyToDraw } from "@/lib/overview";
import { CopyLink } from "../Panels";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const btn = "inline-flex h-11 items-center rounded-lg px-4 font-semibold";

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" | "live"; icon?: string }) {
  return (
    <div className="border-t border-line pt-4">
      <div className="flex items-center gap-2 text-[14px] text-muted">
        {tone === "live" && <span className="live-dot size-1.5 rounded-full bg-clay" aria-hidden />}{label}
      </div>
      <div className={`mt-1 text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em] tabular-nums ${tone === "warn" ? "text-danger" : ""}`}>
        <CountUp value={value} />
      </div>
      {sub && <div className="mt-1 text-[14px] text-muted">{sub}</div>}
    </div>
  );
}

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  const staff = await eventStaff(ev);
  const k = kpis(ev);
  const checks = readiness(ev, staff.members.length);
  const left = checks.filter((c) => !c.done).length;
  const base = `/t/${ev.slug}`;
  const published = ev.status !== "draft" && ev.status !== "cancelled";

  return (
    <div className="space-y-10">
      <section aria-labelledby="kpis">
        <h2 id="kpis" className="sr-only">At a glance</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 lg:grid-cols-3">
          <Kpi icon="#0E7A3E" label="Entries" value={k.confirmed} sub={`confirmed, ${k.pending} pending, ${k.withdrawn} withdrawn`} />
          <Kpi icon="#C62828" label="Fees due" value={k.unpaid.count} sub={k.unpaid.count ? `${rupees(k.unpaid.rupees)} unpaid` : "Nothing unpaid"} tone={k.unpaid.count ? "warn" : undefined} />
          <Kpi icon="#FFC93C" label="Says paid, check UPI" value={k.claimed.count} sub={k.claimed.count ? `${rupees(k.claimed.rupees)} to confirm` : "Nothing to check"} tone={k.claimed.count ? "warn" : undefined} />
          <Kpi icon="#3BA7FF" label="Spots left" value={k.spotsLeft} sub="in categories still taking entries" />
          <Kpi icon="#FF6B35" label="Live now" value={k.live} sub={`${k.scheduled} still to play`} tone={k.live ? "live" : undefined} />
          <Kpi icon="#2E9E55" label="Next match" value={k.next ? time(k.next.at) : "None"} sub={k.next ? `${k.next.court ?? "Court to be set"}, ${k.next.category}` : "No match scheduled"} />
        </div>
      </section>

      <section aria-labelledby="ready" className="border-t border-line pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="ready" className="font-display text-2xl font-extrabold">{left === 0 ? "Ready for match day" : `${left} ${left === 1 ? "thing" : "things"} left to sort`}</h2>
          <span className="font-score text-lg font-extrabold">{checks.length - left}/{checks.length}</span>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full border border-line bg-surface-2" aria-hidden>
          <div className="h-full bg-turf transition-[width] duration-[350ms]" style={{ width: `${((checks.length - left) / checks.length) * 100}%` }} />
        </div>
        <ol className="mt-4 space-y-1">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 py-1.5">
              <CheckSticker done={c.done} className="size-6 shrink-0" />
              <span className={`min-w-0 flex-1 ${c.done ? "text-muted line-through decoration-2" : "font-semibold"}`}>
                {c.label}<span className="sr-only">{c.done ? ", done" : ", not done"}</span>
                {c.hint && !c.done && <span className="block text-[13px] font-normal text-muted no-underline">{c.hint}</span>}
              </span>
              {!c.done && <Link href={`${base}${c.href}`} className="inline-flex h-11 shrink-0 items-center rounded-[6px] chunky press bg-flood px-3 text-[14px] font-bold text-on-flood">Sort it</Link>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="do" className="space-y-4">
        <h2 id="do" className="font-display text-2xl font-extrabold">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {readyToDraw(ev) && <Link href={`${base}/manage/fixtures`} className={`${btn} chunky press bg-turf text-on-turf hover:bg-turf-dark`}>Draw fixtures</Link>}
          <Link href={`${base}/desk`} className={`${btn} bg-ink text-on-ink`}>Open desk</Link>
          <a href={`${base}/export/entries`} download className={`${btn} border border-ink`}>Download entries</a>
          {published && <a href={whatsappShare(ev)} target="_blank" rel="noopener noreferrer" className={`${btn} border border-ink`}>Share on WhatsApp</a>}
        </div>
        {published && <div className="max-w-xl"><CopyLink path={base} label="Event link" /></div>}
        <p className="text-[14px] text-muted">Entries close {dateTime(ev.regClosesAt)}. First match {dateTime(ev.startsAt)}.</p>
      </section>
    </div>
  );
}
