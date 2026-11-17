import Link from "next/link";
import { FORMATS, getEvent, type DbMatch } from "@/lib/data";
import { BYE } from "@/lib/fixtures/types";
import { matchCounts } from "@/lib/overview";
import { Fullscreen } from "@/components/Fullscreen";
import { StepLive } from "@/components/iso/scenes";
import { DrawButton } from "../../Panels";
import { SwapBoard, type SwapRow } from "./SwapBoard";
import { CategoryView, scorable } from "../../views";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> };

export default async function FixturesPage({ params, searchParams }: Props) {
  const ev = (await getEvent((await params).slug))!;
  const { c: catId } = await searchParams;
  const c = ev.categories.find((x) => x.id === catId) ?? ev.categories[0];
  if (!c) return (
    <div className="flex flex-col gap-5 rounded-[6px] chunky bg-surface p-6 sm:flex-row sm:items-center">
      <StepLive className="w-32 shrink-0" />
      <div>
        <p className="font-display text-2xl font-extrabold leading-tight">No categories, no draw.</p>
        <p className="mt-1 text-muted">Add a category first, then come back here to draw fixtures in one tap.</p>
        <Link href={`/t/${ev.slug}/manage/categories`} className="mt-4 inline-flex h-11 items-center rounded-[6px] chunky press bg-turf px-4 font-bold text-on-turf">Add a category</Link>
      </div>
    </div>
  );
  const href = (m: DbMatch) => (scorable(m) ? `/referee/match/${m.id}` : undefined);
  const counts = matchCounts(c.matches);
  const confirmed = c.entryRows.filter((e) => e.status === "confirmed").length;
  const pending = c.entryRows.filter((e) => e.status === "pending").length;
  const group = c.matches.filter((m) => m.stage === "group");
  const groupStageDone = c.format === "groups_knockout" && group.length > 0 && group.every((m) => m.status === "done" || m.a === BYE || m.b === BYE)
    && !c.matches.some((m) => m.stage === "knockout");
  const canDraw = c.matches.length === 0 && (c.status === "open" || c.status === "locked");
  const firstRound = c.matches.filter((m) => (m.stage === "knockout" || m.stage === "winners") && m.round === 1 && m.a && m.b && m.a !== BYE && m.b !== BYE);
  const swapRows: SwapRow[] = firstRound.map((m) => ({
    id: m.id, label: `Match ${m.slot + 1}`, a: m.a!, b: m.b!, locked: m.status === "live" ? "in play" : m.status === "done" ? "finished" : null,
  }));
  const btn = "inline-flex h-11 items-center rounded-lg border border-ink px-3 text-[15px] font-semibold";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Fixtures</h2>
          <p className="text-muted">{FORMATS[c.format].label}{c.format === "groups_knockout" ? ` with ${c.groupCount} groups` : ""}. {confirmed} confirmed, {pending} awaiting payment.</p>
        </div>
        <form className="flex items-end gap-3">
          <select name="c" defaultValue={c.id} aria-label="Category" className="line-input w-auto min-w-48 text-[15px]">
            {ev.categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button className="h-11 rounded-full bg-ink px-5 font-semibold text-on-ink press">Show</button>
        </form>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:max-w-md">
        {([["Live", counts.live, "border-flood border-2"], ["To play", counts.scheduled, ""], ["Done", counts.done, ""]] as const).map(([k, v, tone]) => (
          <div key={k} className={`rounded-xl border bg-surface p-3 ${v && tone ? tone : "border-line"}`}>
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="tabular font-display text-2xl font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>

      {canDraw && (
        <section aria-labelledby="draw" className="rounded-[6px] border border-line bg-surface p-5">
          <h3 id="draw" className="font-display text-2xl font-extrabold">Draw {c.name}</h3>
          <p className="mt-1 max-w-prose text-[15px] text-muted">
            Drawing closes entries for {c.name}, keeps seeds and clubs apart, then gives every match a court and a time. Only confirmed entries are drawn
            {pending ? `; the ${pending} still awaiting payment are left out` : ""}.
          </p>
          <div className="mt-4"><DrawButton category={c.id} slug={ev.slug} label={`Draw ${c.name}`} /></div>
        </section>
      )}
      {groupStageDone && (
        <section className="rounded-[6px] border border-line bg-surface p-5">
          <p className="text-muted">Every group match is done. Draw the knockout from the top two of each group.</p>
          <div className="mt-4"><DrawButton category={c.id} slug={ev.slug} knockoutStage label="Draw the knockout" /></div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={`/t/${ev.slug}/print`} className={btn}>Print order of play</a>
        <a href={`/t/${ev.slug}/export/fixtures`} download className={btn}>Fixtures and results (CSV)</a>
        <Link href={`/t/${ev.slug}/manage/schedule`} className={btn}>Schedule</Link>
      </div>

      {swapRows.some((r) => !r.locked) && (
        <details className="rounded-[6px] border border-line bg-surface p-5">
          <summary className="cursor-pointer font-display text-xl font-bold">Swap players in the first round</summary>
          <div className="mt-3"><SwapBoard rows={swapRows} slug={ev.slug} /></div>
        </details>
      )}

      <Fullscreen label="Show full screen"><CategoryView ev={ev} c={c} href={href} /></Fullscreen>
    </div>
  );
}
