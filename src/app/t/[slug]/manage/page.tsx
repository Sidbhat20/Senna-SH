import Link from "next/link";
import { dateTime, time } from "@/components/ui";
import { eventStaff, getEvent } from "@/lib/data";
import { whatsappShare } from "@/lib/notify";
import { kpis, readiness, readyToDraw } from "@/lib/overview";
import { CopyLink } from "../Panels";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const btn = "inline-flex h-11 items-center rounded-lg px-4 font-semibold";

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" | "live" }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${tone === "live" ? "border-2 border-flood" : tone === "warn" ? "border-danger/50" : "border-line"}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="tabular mt-1 font-display text-3xl font-bold leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[14px] text-muted">{sub}</div>}
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Entries" value={k.confirmed} sub={`confirmed, ${k.pending} pending, ${k.withdrawn} withdrawn`} />
          <Kpi label="Fees due" value={k.unpaid.count} sub={k.unpaid.count ? `${rupees(k.unpaid.rupees)} unpaid` : "Nothing unpaid"} tone={k.unpaid.count ? "warn" : undefined} />
          <Kpi label="Says paid, check UPI" value={k.claimed.count} sub={k.claimed.count ? `${rupees(k.claimed.rupees)} to confirm` : "Nothing to check"} tone={k.claimed.count ? "warn" : undefined} />
          <Kpi label="Spots left" value={k.spotsLeft} sub="in categories still taking entries" />
          <Kpi label="Live now" value={k.live} sub={`${k.scheduled} still to play`} tone={k.live ? "live" : undefined} />
          <Kpi label="Next match" value={k.next ? time(k.next.at) : "None"} sub={k.next ? `${k.next.court ?? "Court to be set"}, ${k.next.category}` : "No match scheduled"} />
        </div>
      </section>

      <section aria-labelledby="ready" className="rounded-xl border-2 border-ink bg-white p-5">
        <h2 id="ready" className="font-display text-2xl font-bold">{left === 0 ? "Ready for match day" : `${left} ${left === 1 ? "thing" : "things"} left to sort`}</h2>
        <ul className="mt-3 divide-y divide-line">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-bold ${c.done ? "bg-turf text-white" : "border-2 border-line"}`}>
                {c.done ? "✓" : ""}
              </span>
              <span className={`min-w-0 flex-1 ${c.done ? "text-muted" : "font-medium"}`}>
                {c.label}<span className="sr-only">{c.done ? ", done" : ", not done"}</span>
                {c.hint && !c.done && <span className="block text-[13px] font-normal text-muted">{c.hint}</span>}
              </span>
              {!c.done && <Link href={`${base}${c.href}`} className="shrink-0 text-[15px] font-semibold underline underline-offset-4">Sort it</Link>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="do" className="space-y-4">
        <h2 id="do" className="font-display text-2xl font-bold">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {readyToDraw(ev) && <Link href={`${base}/manage/fixtures`} className={`${btn} bg-turf text-white hover:bg-turf-dark`}>Draw fixtures</Link>}
          <Link href={`${base}/desk`} className={`${btn} bg-ink text-chalk`}>Open desk</Link>
          <a href={`${base}/export/entries`} download className={`${btn} border border-ink`}>Download entries</a>
          {published && <a href={whatsappShare(ev)} target="_blank" rel="noopener noreferrer" className={`${btn} border border-ink`}>Share on WhatsApp</a>}
        </div>
        {published && <div className="max-w-xl"><CopyLink path={base} label="Event link" /></div>}
        <p className="text-[14px] text-muted">Entries close {dateTime(ev.regClosesAt)}. First match {dateTime(ev.startsAt)}.</p>
      </section>
    </div>
  );
}
