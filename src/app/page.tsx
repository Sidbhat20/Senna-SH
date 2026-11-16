import Link from "next/link";
import { Art } from "@/components/Art";
import { Bracket } from "@/components/Bracket";
import { EventRow } from "@/components/ui";
import { featuredEvent, listEvents } from "@/lib/data";

const STEPS = [
  { art: "calendar" as const, title: "Publish", body: "Pick a sport, a format and a date. Your tournament gets its own page to share on WhatsApp." },
  { art: "notes" as const, title: "Collect entries", body: "Captains register their team and invite players with a link. Solo players sign up themselves." },
  { art: "pen" as const, title: "Draw fixtures", body: "One tap seeds the bracket or league, byes included. Re-draw any time before the first match." },
  { art: "phone" as const, title: "Score live", body: "Referees update the score from their phone. Brackets and tables move on by themselves." },
];

export default async function Home() {
  const [{ events: open }, featured] = await Promise.all([listEvents({ status: "open" }), featuredEvent()]);
  const bracket = featured?.categories.find((c) => c.matches.some((m) => m.stage === "knockout"));

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:pt-16">
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
          <h1 className="font-display text-[clamp(3rem,8vw,6.5rem)] font-bold leading-[0.9] tracking-tight">
            Local tournaments, scored live.
          </h1>
          <div className="max-w-md">
            <p className="text-lg leading-relaxed text-muted">
              Enter a Bangalore tournament in a few taps, or run your own. Fixtures draw themselves and referees score from
              their phones, so everyone can follow every match.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/tournaments" className="rounded-md bg-turf px-5 py-3 font-semibold text-white hover:bg-turf-dark">
                Find a tournament
              </Link>
              <Link href="/organise" className="rounded-md border border-ink px-5 py-3 font-semibold hover:bg-ink hover:text-chalk">
                Organise one
              </Link>
            </div>
          </div>
        </div>
      </section>

      {featured && bracket && (
        <section className="mx-auto max-w-6xl px-4" aria-labelledby="featured">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="featured" className="font-display text-2xl font-semibold">
              {featured.title}, {bracket.name}
            </h2>
            <Link href={`/t/${featured.slug}`} className="font-medium text-turf-dark underline-offset-4 hover:underline">
              Full tournament
            </Link>
          </div>
          <Bracket matches={bracket.matches} stage="knockout" />
        </section>
      )}

      <section className="mx-auto mt-16 max-w-6xl px-4" aria-labelledby="open">
        <h2 id="open" className="font-display text-3xl font-bold">Open for entries</h2>
        {open.length ? (
          <ul className="mt-2 divide-y divide-line">
            {open.map((t) => <EventRow key={t.slug} t={t} />)}
          </ul>
        ) : (
          <div className="mt-4 flex max-w-xl items-center gap-5">
            <Art name="trophy" size={96} />
            <div>
              <p className="text-lg">Nothing is taking entries right now.</p>
              <Link href="/organise/new" className="mt-1 inline-block font-semibold text-turf-dark underline-offset-4 hover:underline">
                Run the first one, it takes two minutes
              </Link>
            </div>
          </div>
        )}
        <Link href="/tournaments" className="mt-4 inline-block font-medium text-turf-dark underline-offset-4 hover:underline">
          See all tournaments
        </Link>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4" aria-labelledby="organise">
        <h2 id="organise" className="max-w-xl font-display text-3xl font-bold">
          Running a tournament? Stop managing it on a spreadsheet.
        </h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.title} className="pt-2">
              <Art name={s.art} size={112} />
              <h3 className="mt-1 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/organise/new" className="mt-8 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-chalk hover:bg-pitch">
          Create a tournament
        </Link>
      </section>
    </>
  );
}
