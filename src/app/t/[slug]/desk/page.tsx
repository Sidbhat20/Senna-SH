import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { awardWalkover, callMatch, checkIn } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ageLimitText, time } from "@/components/ui";
import { getEvent, paymentClaims } from "@/lib/data";
import { BYE } from "@/lib/fixtures/types";

export const metadata: Metadata = { title: "Desk", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> };

const SOON_MIN = 45; // matches starting within this many minutes are "due"

export default async function Desk({ params, searchParams }: Props) {
  const ev = await getEvent((await params).slug);
  if (!ev || !ev.canManage) notFound();
  const claims = await paymentClaims(ev.id);
  const q = ((await searchParams).q ?? "").trim().toLowerCase();

  const entries = ev.categories.flatMap((c) =>
    c.entryRows.filter((e) => e.status !== "withdrawn").map((e) => ({ ...e, category: c.name, aged: !!ageLimitText(c) })),
  );
  const present = new Map(entries.map((e) => [e.id, e.checkedIn]));
  const shown = q ? entries.filter((e) => `${e.name} ${e.club} ${e.roster.join(" ")}`.toLowerCase().includes(q)) : entries;
  const checked = entries.filter((e) => e.checkedIn).length;

  const now = Date.now();
  const due = ev.categories.flatMap((c) => c.matches)
    .filter((m) => m.status === "scheduled" && m.at && m.aId && m.bId && m.a !== BYE && m.b !== BYE)
    .filter((m) => +new Date(m.at!) - now < SOON_MIN * 60_000)
    .filter((m) => !present.get(m.aId!) || !present.get(m.bId!))
    .sort((x, y) => x.at!.localeCompare(y.at!));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8">
      <LiveRefresh eventId={ev.id} />
      <Link href={`/t/${ev.slug}`} className="text-[15px] text-muted underline-offset-4 hover:underline">{ev.title}</Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-5xl font-bold">Desk</h1>
        <p className="tabular text-lg"><strong>{checked}</strong> of {entries.length} checked in</p>
      </div>

      {due.length > 0 && (
        <section className="mt-6 rounded-xl border-2 border-flood bg-white p-4" aria-labelledby="due">
          <h2 id="due" className="font-display text-2xl font-bold">Due on court, not checked in</h2>
          <p className="text-[15px] text-muted">Starting in the next {SOON_MIN} minutes. Call them, or award the match if they don&apos;t turn up.</p>
          <ul className="mt-3 divide-y divide-line">
            {due.map((m) => (
              <li key={m.id} className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                <div className="tabular font-display text-lg font-semibold">{time(m.at!)}<span className="block text-[13px] font-normal text-muted">{m.court}</span></div>
                <div className="min-w-0 text-[15px]">
                  <div className="text-[13px] text-muted">{m.category}</div>
                  {(["a", "b"] as const).map((s) => (
                    <div key={s} className={present.get(s === "a" ? m.aId! : m.bId!) ? "" : "font-semibold text-danger"}>
                      {s === "a" ? m.a : m.b}
                      {!present.get(s === "a" ? m.aId! : m.bId!) && " (not here)"}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={callMatch} values={{ event: ev.id, match: m.id, slug: ev.slug }} showOk>
                    <button className="rounded-lg bg-ink px-3 py-1.5 text-[14px] font-semibold text-chalk">Email both players</button>
                  </ActionForm>
                  {(["a", "b"] as const).map((s) => (
                    <ActionForm key={s} action={awardWalkover} values={{ match: m.id, winner: s, slug: ev.slug }}>
                      <button className="rounded-lg border border-ink px-3 py-1.5 text-[14px] font-semibold">
                        Walkover to {(s === "a" ? m.a : m.b)!.split(" / ")[0]}
                      </button>
                    </ActionForm>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form method="get" className="mt-6" role="search">
        <label htmlFor="q" className="sr-only">Find a player or team</label>
        <input id="q" name="q" defaultValue={q} placeholder="Find a player, pair or team" autoFocus
          className="block w-full rounded-lg border border-line bg-white px-4 py-3 text-lg focus:border-ink focus:outline-none" />
      </form>

      <ul className="mt-4 divide-y divide-line">
        {shown.length === 0 && <li className="py-6 text-muted">No one matches &ldquo;{q}&rdquo;.</li>}
        {shown.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{e.name}</div>
              <div className="text-[14px] text-muted">
                {e.category}
                {e.club && `, ${e.club}`}
                {e.status === "pending" && (claims.get(e.id) ? `, says paid (UTR ${claims.get(e.id)})` : ", fee unpaid")}
                {e.roster.length > 0 && `, ${e.roster.length} players`}
              </div>
            </div>
            {e.checkedIn ? (
              <>
                <span className="text-[15px] font-semibold text-turf-dark">Checked in{e.idChecked && ", ID seen"}</span>
                <ActionForm action={checkIn} values={{ entry: e.id, present: "0", slug: ev.slug }}>
                  <button className="rounded-lg px-3 py-1.5 text-[14px] text-muted hover:bg-line/50">Undo</button>
                </ActionForm>
              </>
            ) : (
              <div className="flex gap-2">
                {e.aged && ev.ageCheck === "desk" && (
                  <ActionForm action={checkIn} values={{ entry: e.id, present: "1", id: "1", slug: ev.slug }}>
                    <button className="h-11 rounded-lg bg-turf px-4 font-semibold text-white">Check in + ID seen</button>
                  </ActionForm>
                )}
                <ActionForm action={checkIn} values={{ entry: e.id, present: "1", slug: ev.slug }}>
                  <button className={`h-11 rounded-lg px-4 font-semibold ${e.aged && ev.ageCheck === "desk" ? "border border-ink" : "bg-turf text-white"}`}>
                    Check in
                  </button>
                </ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
