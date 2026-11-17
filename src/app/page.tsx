import Image from "next/image";
import Link from "next/link";
import { LiveTicker } from "@/components/LiveTicker";
import { PHOTOS, PhotoTile } from "@/components/Photo";
import { EVENT_GRID, EventRow } from "@/components/ui";
import { featuredEvent, listEvents, SPORTS, type DbMatch } from "@/lib/data";
import { BYE } from "@/lib/fixtures/types";
import { LAUNCH_SPORTS } from "@/lib/sports";

const STEPS = [
  { title: "Find", body: "Every tournament in the city, with the venue, the fee and the places left. Filter by sport." },
  { title: "Enter", body: "Register in a tap and pay the organiser directly by UPI. No middleman, no markup." },
  { title: "Play live", body: "Your court and time on your phone. Referees score every point; brackets move as you play." },
];

/** The broadcast panel: a timing-tower view of a live match, or a labelled example when nothing is live. */
function LivePanel({ m, title }: { m?: DbMatch & { category?: string }; title?: string }) {
  const sample = !m;
  const rows = m
    ? [{ name: m.a ?? "", games: (m.games ?? []).map((g) => g[0]), score: m.scoreA, won: m.winner === m.a },
       { name: m.b ?? "", games: (m.games ?? []).map((g) => g[1]), score: m.scoreB, won: m.winner === m.b }]
    : [{ name: "R. Iyer", games: [21, 15], score: 14, won: false }, { name: "A. Menon", games: [18, 21], score: 11, won: false }];
  const facts = sample
    ? [["Court", "2"], ["Game", "3"], ["Next", "18:30"]]
    : [["Court", m?.court ?? "–"], ["Status", "In play"], ["Round", String(m?.round ?? "")]];
  return (
    <div className="rounded-[6px] chunky bg-surface" aria-label={sample ? "Example of a live match panel" : "Live match"}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3 font-score text-[11px] uppercase tracking-[0.16em] text-muted">
        <span>{sample ? "Example · Men's Singles" : `${title} · ${m?.category ?? ""}`}</span>
        <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-clay px-2 py-0.5 text-on-clay"><span className="live-dot size-1.5 rounded-full bg-on-clay" />Live</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-4 font-score">
          <span className="text-muted">{i + 1}</span>
          <span className={`truncate text-[17px] uppercase ${r.won ? "font-semibold" : ""}`}>{r.name}</span>
          <span className="flex gap-3 text-[15px] text-muted">{r.games.map((g, j) => <span key={j}>{g}</span>)}</span>
          <span className="w-10 text-right text-3xl font-semibold text-turf">{r.score ?? 0}</span>
        </div>
      ))}
      <div className="grid grid-cols-3 font-score text-[11px] uppercase tracking-[0.14em] text-muted">
        {facts.map(([k, v]) => (
          <div key={k} className="border-r border-line px-4 py-3 last:border-r-0">{k}<div className="mt-1 text-[15px] normal-case tracking-normal text-ink">{v}</div></div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const [{ events: open }, featured] = await Promise.all([listEvents({ status: "open" }), featuredEvent()]);
  const liveMatches = (featured?.categories ?? []).flatMap((c) => c.matches
    .filter((m) => m.status === "live" && m.a && m.b && m.a !== BYE && m.b !== BYE).map((m) => ({ ...m, category: c.name })));
  const ticker = liveMatches.map((m) => ({ id: m.id, label: [m.category, m.court].filter(Boolean).join(" · "), a: m.a!, b: m.b!, scoreA: m.scoreA, scoreB: m.scoreB, href: `/t/${featured!.slug}` }));
  // On the photo the hero always reads as dark, so its colours are fixed rather than theme tokens.
  const volt = "bg-[#D7FF3A] text-[#0B0B0C]";

  return (
    <>
      <section className="relative isolate min-h-[86vh] overflow-hidden text-chalk">
        <Image src={PHOTOS.smash} alt="" fill priority sizes="100vw" className="photo -z-10 object-cover object-[60%_40%]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/55 to-black/20" />
        <div className="mx-auto flex min-h-[86vh] max-w-7xl flex-col justify-end px-4 pb-14 md:px-6 md:pb-20">
          <p className="font-score text-[12px] uppercase tracking-[0.2em] text-chalk/80">Bangalore · Badminton · Pickleball · TT · Football</p>
          <h1 className="mt-4 font-display text-[clamp(4.5rem,14vw,12rem)] leading-[0.84]">
            Play the<br /><span className="text-[#D7FF3A]">draw.</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
            <p className="max-w-md text-[17px] leading-relaxed text-chalk/85">
              Bangalore&apos;s tournaments. Entered in a tap, drawn automatically, every point scored live.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/tournaments" className={`inline-flex h-13 items-center rounded-full px-8 text-[14px] font-semibold uppercase tracking-[0.1em] press ${volt}`}>Find a tournament</Link>
              <Link href="/organise" className="inline-flex h-13 items-center rounded-full border border-chalk/40 px-8 text-[14px] font-semibold uppercase tracking-[0.1em] text-chalk hover:border-chalk">Host one</Link>
            </div>
          </div>
        </div>
      </section>
      <LiveTicker items={ticker} />

      <nav aria-label="Browse by sport" className="border-b border-line">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 md:px-6">
          {LAUNCH_SPORTS.map((s) => (
            <li key={s} className="shrink-0">
              <Link href={`/tournaments?sport=${s}`} className="inline-flex h-14 items-center px-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">{SPORTS[s]}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mx-auto mt-20 grid max-w-7xl gap-10 px-4 md:grid-cols-[1fr_1.15fr] md:items-center md:px-6" aria-labelledby="live">
        <div>
          <h2 id="live" className="font-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.9]">Every point.<br />Every court.<br />Live.</h2>
          <p className="mt-5 max-w-md text-muted">Referees score from their phones. Players, parents and the desk follow every rally, bracket and order of play in real time.</p>
        </div>
        <LivePanel m={liveMatches[0]} title={featured?.title} />
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-6" aria-labelledby="open">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <h2 id="open" className="font-display text-[clamp(2.25rem,4vw,3.5rem)] leading-[0.95]">Taking entries</h2>
          <Link href="/tournaments" className="inline-flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.12em] hover:text-turf">All tournaments →</Link>
        </div>
        {open.length ? (
          <ul className={`mt-8 ${EVENT_GRID}`}>{open.map((t) => <EventRow key={t.slug} t={t} />)}</ul>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-stretch">
            <div className="relative min-h-72 overflow-hidden rounded-[6px]">
              <PhotoTile src={PHOTOS.court} className="absolute inset-0" sizes="(min-width: 768px) 60vw, 100vw" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-chalk">
                <p className="font-display text-[clamp(2rem,4vw,3rem)] leading-[0.95]">The court&apos;s open.</p>
                <p className="mt-2 max-w-md text-chalk/85">No tournament is taking entries right now. Be the first organiser in your city this season.</p>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-6 rounded-[6px] chunky bg-surface p-6">
              <p className="font-score text-[11px] uppercase tracking-[0.16em] text-muted">For organisers</p>
              <p className="font-display text-[2rem] leading-[0.95]">Publish in two minutes. Free.</p>
              <Link href="/organise/new" className="inline-flex h-12 w-fit items-center rounded-full bg-turf px-7 text-[13px] font-semibold uppercase tracking-[0.1em] text-on-turf press">Create a tournament</Link>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-6" aria-labelledby="how">
        <h2 id="how" className="border-b border-line pb-4 font-display text-[clamp(2.25rem,4vw,3.5rem)] leading-[0.95]">How it works</h2>
        <ol className="grid md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-b border-line py-8 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0">
              <span className="font-score text-[13px] text-turf">0{i + 1}</span>
              <h3 className="mt-3 font-display text-[2.25rem] leading-none">{s.title}</h3>
              <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-6" aria-labelledby="free">
        <div className="relative isolate overflow-hidden rounded-[6px] px-6 py-16 text-chalk md:px-12">
          <Image src={PHOTOS.stadium} alt="" fill sizes="100vw" className="-z-10 object-cover grayscale contrast-125 brightness-110" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
          <div className="grid gap-8 md:grid-cols-[1.5fr_1fr] md:items-end">
            <div>
              <h2 id="free" className="font-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.9]">Free for organisers.</h2>
              <p className="mt-4 max-w-lg text-chalk/85">Automatic draws, courts and times, entries and UPI payments in one list, and referees scoring from their phones. Retire the spreadsheet.</p>
            </div>
            <Link href="/organise/new" className={`inline-flex h-13 w-fit items-center rounded-full px-8 text-[14px] font-semibold uppercase tracking-[0.1em] press md:justify-self-end ${volt}`}>Create a tournament</Link>
          </div>
        </div>
      </section>
    </>
  );
}
