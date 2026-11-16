import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { moveMatch, rotateRefereeLink, updateEntry, withdrawEntry } from "@/app/actions";
import { Bracket } from "@/components/Bracket";
import { ActionForm } from "@/components/ActionForm";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PosterUpload } from "@/components/PosterUpload";
import { Standings } from "@/components/Standings";
import { ageLimitText, date, dateTime, feeRange, MatchRow, perEntry, scoringText, sportName, StatusPill, time } from "@/components/ui";
import { FORMATS, getEvent, myEntries, refereeLinks, type CategoryDetail, type DbMatch, type EventDetail } from "@/lib/data";
import { standings } from "@/lib/fixtures/standings";
import { placeName, placings } from "@/lib/results";
import { whatsappShare } from "@/lib/notify";
import { BYE } from "@/lib/fixtures/types";
import { EditPanel, ist } from "./EditPanel";
import { AddEntriesForm, CopyLink, DrawButton, RegisterForm, RescheduleButton, ImportEntriesForm } from "./Panels";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; view?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getEvent((await params).slug);
  return t ? { title: t.title, description: `${sportName(t)} at ${t.venue}${t.area ? `, ${t.area}` : ""}. ${feeRange(t.categories)}.` } : {};
}


const scorable = (m: DbMatch) => m.status !== "done" && m.a && m.b && m.a !== BYE && m.b !== BYE;

function Fixtures({ matches, by, href }: { matches: DbMatch[]; by: (m: DbMatch) => string; href: (m: DbMatch) => string | undefined }) {
  const sections = new Map<string, DbMatch[]>();
  for (const m of matches) sections.set(by(m), [...(sections.get(by(m)) ?? []), m]);
  return (
    <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
      {[...sections].map(([title, ms]) => (
        <section key={title}>
          <h3 className="border-b border-ink pb-1 font-display text-lg font-semibold">{title}</h3>
          <div className="divide-y divide-line">
            {ms.map((m) => <MatchRow key={m.id} m={m} href={href(m)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Every court's queue, in time order: what organisers print and players check on match day. */
async function OrderOfPlay({ ev, href }: { ev: EventDetail; href: (m: DbMatch) => string | undefined }) {
  const all = ev.categories.flatMap((c) => c.matches).filter((m) => !m.walkover && m.at);
  const links = ev.canManage ? await refereeLinks(ev.id) : [];
  return (
    <div className="space-y-8">
      {ev.canManage && (
        <section className="rounded-xl border-2 border-ink p-5" aria-labelledby="run">
          <h2 id="run" className="font-display text-2xl font-bold">Running late or early?</h2>
          <p className="mt-1 max-w-prose text-muted">
            Re-planning keeps live matches where they are and moves everything still to play to the next free court from now.
          </p>
          <div className="mt-4"><RescheduleButton event={ev.id} slug={ev.slug} /></div>
          {links.length > 0 && (
            <>
              <h3 className="mt-6 font-display text-xl font-semibold">Referee links</h3>
              <p className="text-[15px] text-muted">Send a court&apos;s link to its referee. They log in once and can score only that court. A new link stops the old one from working; referees who already joined keep scoring.</p>
              <div className="mt-3 space-y-2">
                {[...links].sort((a, b) => (a.court_id ? 1 : 0) - (b.court_id ? 1 : 0) || (ev.courts.findIndex((c) => c.id === a.court_id) - ev.courts.findIndex((c) => c.id === b.court_id)))
                  .map((l) => {
                    const expired = +new Date(l.expires_at) <= Date.now();
                    return (
                      <div key={l.token} className="space-y-1">
                        <CopyLink path={`/ref/${l.token}`} label={l.court_id ? ev.courts.find((c) => c.id === l.court_id)?.name : "All courts"} />
                        <ActionForm action={rotateRefereeLink} values={{ token: l.token, slug: ev.slug }} className="pl-26 text-[13px]" showOk>
                          <span className={expired ? "font-semibold text-danger" : "text-muted"}>
                            {expired ? "Expired" : "Works until"} {date(l.expires_at)}.
                          </span>
                          <button className="font-semibold underline underline-offset-2">New link</button>
                        </ActionForm>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </section>
      )}
      {all.length === 0 ? (
        <p className="text-muted">Match times appear here once the organiser draws fixtures.</p>
      ) : (
        <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {ev.courts.map((court) => {
            const ms = all.filter((m) => m.courtId === court.id).sort((a, b) => a.at!.localeCompare(b.at!));
            if (!ms.length) return null;
            return (
              <section key={court.id}>
                <h3 className="border-b-2 border-ink pb-1 font-display text-2xl font-bold">{court.name}</h3>
                <ol className="divide-y divide-line">
                  {ms.map((m) => (
                    <li key={m.id} className="grid grid-cols-[3.75rem_1fr] gap-x-3">
                      <span className={`tabular pt-3 font-display text-lg font-semibold ${m.status === "done" ? "text-muted" : ""}`}>{time(m.at!)}</span>
                      <MatchRow m={{ ...m, court: undefined, at: undefined }} label={m.category} href={href(m)} />
                      {ev.canManage && m.status === "scheduled" && (
                        <details className="col-start-2 pb-3 text-[14px]">
                          <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Move</summary>
                          <ActionForm action={moveMatch} values={{ match: m.id, slug: ev.slug }} className="mt-2 gap-y-2">
                            <fieldset className="flex w-full flex-wrap gap-1.5">
                              <legend className="sr-only">Court</legend>
                              {ev.courts.map((c) => (
                                <label key={c.id} className="cursor-pointer rounded-full border border-line px-2.5 py-1 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-chalk">
                                  <input type="radio" name="court" value={c.id} defaultChecked={c.id === m.courtId} className="sr-only" />
                                  {c.name}
                                </label>
                              ))}
                            </fieldset>
                            <input type="date" name="date" defaultValue={ist(m.at!).date} aria-label="Date" className="rounded-lg border border-line px-2 py-1" />
                            <input type="time" name="time" defaultValue={ist(m.at!).time} step={300} aria-label="Start time" className="rounded-lg border border-line px-2 py-1" />
                            <button className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-chalk disabled:opacity-60">Move</button>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ManageCategory({ ev, c }: { ev: EventDetail; c: CategoryDetail }) {
  const groupStageDone = c.format === "groups_knockout" && c.matches.some((m) => m.stage === "group")
    && c.matches.filter((m) => m.stage === "group").every((m) => m.status === "done")
    && !c.matches.some((m) => m.stage === "knockout");
  // Open categories take entries; locked ones (entries closed) still need seeding and the draw.
  if (c.status !== "open" && c.status !== "locked" && !groupStageDone) return null;
  const confirmed = c.entryRows.filter((e) => e.status === "confirmed").length;
  const active = c.entryRows.filter((e) => e.status !== "withdrawn");

  return (
    <section className="rounded-xl border-2 border-ink p-5" aria-labelledby="manage">
      <h2 id="manage" className="font-display text-2xl font-bold">Run {c.name}</h2>
      {groupStageDone ? (
        <>
          <p className="mt-1 text-muted">Every group match is done. Draw the knockout from the top two of each group.</p>
          <div className="mt-4"><DrawButton category={c.id} slug={ev.slug} knockoutStage label="Draw the knockout" /></div>
        </>
      ) : (
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          {c.status === "open" ? (
            <div>
              <AddEntriesForm category={c.id} slug={ev.slug} team={c.entryType === "team"} />
              <ImportEntriesForm category={c.id} slug={ev.slug} />
            </div>
          ) : (
            <p className="text-[15px] text-muted">
              Entries are closed for {c.name}. Reopen them from the Edit tab if you need to add someone before the draw.
            </p>
          )}
          <div>
            <h3 className="font-medium">Entries and seeds</h3>
            <p className="text-[14px] text-muted">Type a seed and press Enter. Seeds 1, 2, 3… are kept apart in the draw; unseeded entries follow in the order they joined.</p>
            {active.length === 0 ? (
              <p className="mt-2 text-[15px] text-muted">No entries yet.</p>
            ) : (
              <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto pr-1">
                {active.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[15px]">
                    <ActionForm action={updateEntry} values={{ entry: e.id, slug: ev.slug, op: "seed" }} className="shrink-0">
                      <input name="seed" defaultValue={e.seed ?? ""} inputMode="numeric" aria-label={`Seed for ${e.name}`} placeholder="–"
                        className="tabular w-10 rounded-md border border-line bg-white px-1.5 py-1 text-center" />
                      <button className="sr-only">Save seed</button>
                    </ActionForm>
                    <span className="min-w-0 flex-1 truncate">
                      {e.name}
                      {e.club && <span className="text-muted">, {e.club}</span>}
                    </span>
                    {e.status === "pending" && (
                      <ActionForm action={updateEntry} values={{ entry: e.id, slug: ev.slug, op: "paid" }}>
                        <button className="rounded-md border border-ink px-2 py-0.5 text-[14px] font-semibold">Mark paid</button>
                      </ActionForm>
                    )}
                    <ActionForm action={updateEntry} values={{ entry: e.id, slug: ev.slug, op: "remove" }}>
                      <button className="rounded-md px-2 py-0.5 text-[14px] text-danger hover:bg-danger/10" aria-label={`Remove ${e.name}`}>Remove</button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="lg:col-span-2">
            <p className="mb-3 text-[15px] text-muted">
              {confirmed} confirmed. Drawing closes entries for {c.name}, then gives every match a court and a time.
            </p>
            <DrawButton category={c.id} slug={ev.slug} label={`Draw ${c.name}`} />
          </div>
        </div>
      )}
    </section>
  );
}

function CategoryView({ ev, c, href }: { ev: EventDetail; c: CategoryDetail; href: (m: DbMatch) => string | undefined }) {
  const results = c.status === "completed" ? placings(c) : [];
  const bracketHref = ev.canManage ? (m: DbMatch) => href(m) ?? "" : undefined;
  return (
    <div className="space-y-10">
      {results.length > 0 && (
        <section aria-labelledby={`results-${c.id}`} className="overflow-hidden rounded-xl border border-line bg-white">
          <h2 id={`results-${c.id}`} className="bg-pitch px-6 py-3 font-display text-xl font-semibold text-chalk">{c.name} results</h2>
          <ol className="divide-y divide-line">
            {results.map((r) => (
              <li key={`${r.place}-${r.name}`} className={`flex items-baseline gap-4 px-6 py-3 ${r.place === 1 ? "bg-pitch/5" : ""}`}>
                <span className="tabular w-20 shrink-0 font-display text-lg font-bold">
                  {placeName(r.place, results.filter((x) => x.place === r.place).length > 1)}
                </span>
                <span className={r.place === 1 ? "font-display text-2xl font-bold" : "text-lg"}>{r.name}</span>
              </li>
            ))}
          </ol>
          <a href={`/t/${ev.slug}/certificates?c=${c.id}`} className="block border-t border-line px-6 py-3 text-[15px] font-semibold underline-offset-4 hover:underline">
            Certificates to print
          </a>
        </section>
      )}
      {c.matches.length === 0 && (
        <section>
          <h2 className="font-display text-3xl font-bold">Fixtures</h2>
          <p className="mt-2 max-w-prose text-muted">
            The draw happens after entries close on {date(ev.regClosesAt)}. Your first opponent, court and time will show up here.
          </p>
        </section>
      )}
      {(c.format === "knockout" || c.format === "double_elim") && c.matches.length > 0 && (
        <section className="space-y-6">
          <h2 className="font-display text-3xl font-bold">Bracket</h2>
          {c.format === "knockout" ? (
            <Bracket matches={c.matches} stage="knockout" hrefFor={bracketHref} />
          ) : (
            <>
              <Bracket matches={c.matches} stage="winners" hrefFor={bracketHref} />
              <h3 className="font-display text-2xl font-semibold">Losers bracket</h3>
              <Bracket matches={c.matches} stage="losers" hrefFor={bracketHref} />
              <Bracket matches={c.matches} stage="grand_final" hrefFor={bracketHref} />
            </>
          )}
          <h3 className="font-display text-2xl font-semibold">Match times</h3>
          <Fixtures matches={c.matches.filter((m) => !m.walkover)} by={(m) => (m.stage === "losers" ? `Losers round ${m.round}` : m.stage === "grand_final" ? "Grand final" : `Round ${m.round}`)} href={href} />
        </section>
      )}
      {c.format === "league" && c.matches.length > 0 && (
        <>
          <section>
            <h2 className="mb-3 font-display text-3xl font-bold">Table</h2>
            <Standings rows={standings(c.entries, c.matches)} qualify={1} />
          </section>
          <section>
            <h2 className="mb-4 font-display text-3xl font-bold">Fixtures</h2>
            <Fixtures matches={c.matches} by={(m) => `Round ${m.round}`} href={href} />
          </section>
        </>
      )}
      {c.format === "groups_knockout" && c.groups && (
        <>
          {c.matches.some((m) => m.stage === "knockout") && (
            <section className="space-y-4">
              <h2 className="font-display text-3xl font-bold">Knockout</h2>
              <Bracket matches={c.matches} stage="knockout" hrefFor={bracketHref} />
            </section>
          )}
          <section>
            <h2 className="font-display text-3xl font-bold">Groups</h2>
            <p className="mt-1 text-muted">Top two in each group go through to the knockout.</p>
            <div className="mt-5 grid gap-8 md:grid-cols-2">
              {Object.entries(c.groups).sort().map(([g, entries]) => (
                <Standings key={g} caption={`Group ${g}`} rows={standings(entries, c.matches.filter((m) => m.group === g))} qualify={2} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-4 font-display text-3xl font-bold">Group fixtures</h2>
            <Fixtures matches={c.matches.filter((m) => m.stage === "group")} by={(m) => `Group ${m.group}, round ${m.round}`} href={href} />
          </section>
        </>
      )}
    </div>
  );
}

export default async function EventPage({ params, searchParams }: Props) {
  const ev = await getEvent((await params).slug);
  if (!ev) notFound();
  const { c: catId, view } = await searchParams;
  const me = await myEntries(ev);
  const schedule = view === "schedule";
  const editing = view === "edit" && ev.canManage;
  const onCategory = !schedule && !editing;
  const c = ev.categories.find((x) => x.id === catId) ?? ev.categories[0];
  const href = (m: DbMatch) => (ev.canManage && scorable(m) ? `/referee/match/${m.id}` : undefined);
  const hasTimes = ev.categories.some((x) => x.matches.some((m) => m.at));
  const live = ev.categories.flatMap((x) => x.matches).filter((m) => m.status === "live");
  const mine = c && me.byCategory.get(c.id);
  const left = c ? c.maxEntries - c.entries.length : 0;
  const regOpen = ev.status === "open" && c?.status === "open" && +new Date(ev.regClosesAt) > Date.now();

  const facts: [string, string][] = [
    ["First match", dateTime(ev.startsAt)],
    ["Venue", [ev.venue, ev.area].filter(Boolean).join(", ")],
    ["Entries close", dateTime(ev.regClosesAt)],
    ...(ev.prize ? ([["Prizes", ev.prize]] as [string, string][]) : []),
    ["Organiser", ev.organiser],
  ];
  const tab = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-[15px] ${active ? "border-ink bg-ink text-chalk" : "border-line bg-white hover:border-ink"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      {(ev.status === "live" || ev.status === "open") && <LiveRefresh eventId={ev.id} />}
      <header className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={ev.status} />
            <span className="text-muted">{sportName(ev)}</span>
          </div>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[0.95]">{ev.title}</h1>
          <dl className="mt-6 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {ev.status !== "draft" && ev.status !== "cancelled" && (
            <a href={whatsappShare(ev)} target="_blank" rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-ink bg-white px-4 py-2 text-[15px] font-semibold hover:bg-line/40 print:hidden">
              Share on WhatsApp
            </a>
          )}
          {ev.canManage && !ev.posterUrl && <div className="mt-6"><PosterUpload eventId={ev.id} hasPoster={false} /></div>}
        </div>
        {ev.posterUrl && (
          <div className="w-full max-w-xs md:w-64">
            <a href={ev.posterUrl} target="_blank" rel="noopener" className="block" aria-label="Open the full poster">
              <Image src={ev.posterUrl} alt={`Poster for ${ev.title}`} width={512} height={724} sizes="(min-width: 768px) 256px, 320px"
                className="h-auto w-full rounded-xl border border-line object-cover" priority />
            </a>
            {ev.canManage && <div className="mt-3"><PosterUpload eventId={ev.id} hasPoster /></div>}
          </div>
        )}
      </header>

      {ev.status === "cancelled" && (
        <p role="status" className="mt-8 rounded-xl border-2 border-danger bg-white px-5 py-4 font-semibold text-danger">
          This tournament has been cancelled. Contact {ev.organiser} about entry fees.
        </p>
      )}

      {live.length > 0 && (
        <section className="mt-8 rounded-xl border-2 border-flood bg-white px-5 py-2" aria-label="Live now">
          <div className="divide-y divide-line">
            {live.map((m) => <MatchRow key={m.id} m={m} label={m.category} href={href(m)} />)}
          </div>
        </section>
      )}

      <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
        {ev.categories.map((x) => (
          <Link key={x.id} href={`/t/${ev.slug}?c=${x.id}`} aria-current={onCategory && x.id === c?.id ? "page" : undefined}
            className={tab(onCategory && x.id === c?.id)}>
            {x.name} <span className="tabular opacity-70">{x.entries.length}/{x.maxEntries}</span>
          </Link>
        ))}
        {(hasTimes || ev.canManage) && (
          <Link href={`/t/${ev.slug}?view=schedule`} aria-current={schedule ? "page" : undefined} className={tab(schedule)}>
            Order of play
          </Link>
        )}
        {ev.canManage && (
          <Link href={`/t/${ev.slug}/desk`} className={tab(false)}>
            Desk
          </Link>
        )}
        {ev.canManage && (
          <Link href={`/t/${ev.slug}?view=edit`} aria-current={editing ? "page" : undefined} className={tab(editing)}>
            Edit
          </Link>
        )}
      </nav>

      {editing ? (
        <div className="mt-8"><EditPanel ev={ev} /></div>
      ) : schedule ? (
        <div className="mt-8"><OrderOfPlay ev={ev} href={href} /></div>
      ) : c ? (
        <>
          <p className="mt-4 text-muted">
            {FORMATS[c.format].label}
            {c.format === "groups_knockout" ? ` with ${c.groupCount} groups` : ""}. {perEntry(c)}.
            {scoringText(c, ev.sport) && ` ${scoringText(c, ev.sport)}.`}
            {ageLimitText(c) && ` ${ageLimitText(c)}.`}
            {c.status === "locked" && " Entries are closed."}
            {c.status === "cancelled" && " This category is cancelled."}
          </p>
          {ev.canManage && <div className="mt-6"><ManageCategory ev={ev} c={c} /></div>}
          <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_18rem]">
            <div className="min-w-0"><CategoryView ev={ev} c={c} href={href} /></div>
            <aside className="space-y-8">
              {(regOpen || mine) && (
                <div className="rounded-xl border border-line bg-white p-5">
                  {mine ? (
                    <>
                      <div className="font-display text-2xl font-bold">{mine.status === "pending" ? "Registered, payment due" : "You're in"}</div>
                      {mine.status === "pending" && (
                        <p className="mt-1 text-[15px] text-muted">Pay {perEntry(c).toLowerCase()} to the organiser. They&apos;ll confirm your place.</p>
                      )}
                      {mine.invite && (
                        <div className="mt-3">
                          <p className="mb-2 text-[15px]">Send this to your players so they join the team:</p>
                          <CopyLink path={`/join/${mine.invite}`} />
                        </div>
                      )}
                      {mine.canWithdraw && (
                        c.status === "open" ? (
                          <ActionForm action={withdrawEntry} values={{ entry: mine.id, slug: ev.slug }} className="mt-4 border-t border-line pt-4">
                            <div className="w-full space-y-2">
                              <label className="flex items-start gap-2 text-[15px]">
                                <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
                                <span>
                                  I can&apos;t play. Free my spot in {c.name}.
                                  {c.entryFee > 0 && " Refunds are up to the organiser."}
                                </span>
                              </label>
                              <button className="h-10 rounded-lg px-3 text-[15px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">
                                Withdraw
                              </button>
                            </div>
                          </ActionForm>
                        ) : (
                          <p className="mt-4 border-t border-line pt-4 text-[14px] text-muted">
                            Entries are closed, so to pull out, tell the organiser ({ev.organiser}).
                          </p>
                        )
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-display text-2xl font-bold">{left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} left` : "Full"}</div>
                      <p className="mt-1 text-[15px] text-muted">{perEntry(c)}. Entries close {dateTime(ev.regClosesAt)}.</p>
                      {left > 0 &&
                        (me.loggedIn ? (
                          <RegisterForm category={c.id} slug={ev.slug} kind={c.entryType} aged={!!(c.bornOnOrAfter || c.bornOnOrBefore)} ageHint={ageLimitText(c)} fields={ev.regFields} />
                        ) : (
                          <Link href={`/login?next=${encodeURIComponent(`/t/${ev.slug}?c=${c.id}`)}`}
                            className="mt-4 block rounded-lg bg-turf px-5 py-3 text-center font-semibold text-white hover:bg-turf-dark">
                            Log in to register
                          </Link>
                        ))}
                    </>
                  )}
                </div>
              )}
              {ev.rules.length > 0 && (
                <section>
                  <h2 className="font-display text-xl font-semibold">Rules</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
                    {ev.rules.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </section>
              )}
              <section>
                <h2 className="font-display text-xl font-semibold">{c.entries.length} of {c.maxEntries} entered</h2>
                {c.entries.length === 0 ? (
                  <p className="mt-1 text-[15px] text-muted">No one yet. Share this page to get the first entries.</p>
                ) : (
                  <ol className="mt-2 columns-2 gap-4 text-[15px] lg:columns-1">
                    {c.entryRows.filter((e) => e.status !== "withdrawn").map((e, i) => (
                      <li key={e.id} className="break-inside-avoid py-0.5">
                        <span className="tabular mr-2 inline-block w-5 text-right text-muted">{i + 1}</span>
                        {e.name || "Unnamed player"}
                        {e.status === "pending" && <span className="ml-1 text-[13px] text-muted">(unpaid)</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : (
        <p className="mt-8 text-muted">This tournament has no categories yet.</p>
      )}
    </div>
  );
}
