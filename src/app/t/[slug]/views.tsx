// Event views shared by the public page and the organiser workspace.
import { moveMatch, rejectPayment, rotateRefereeLink, updateEntry } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Bracket } from "@/components/Bracket";
import { Standings } from "@/components/Standings";
import { date, MatchRow, time } from "@/components/ui";
import { refereeLinks, type CategoryDetail, type DbMatch, type EventDetail } from "@/lib/data";
import type { Claim } from "@/lib/exports";
import { standings } from "@/lib/fixtures/standings";
import { BYE } from "@/lib/fixtures/types";
import { placeName, placings } from "@/lib/results";
import { ist } from "./EditPanel";
import { AddEntriesForm, CopyLink, DrawButton, ImportEntriesForm, RescheduleButton } from "./Panels";

export const scorable = (m: DbMatch) => m.status !== "done" && m.a && m.b && m.a !== BYE && m.b !== BYE;

export function Fixtures({ matches, by, href }: { matches: DbMatch[]; by: (m: DbMatch) => string; href: (m: DbMatch) => string | undefined }) {
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
export async function OrderOfPlay({ ev, href }: { ev: EventDetail; href: (m: DbMatch) => string | undefined }) {
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

export function ManageCategory({ ev, c, claims }: { ev: EventDetail; c: CategoryDetail; claims: Map<string, Claim> }) {
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
              Entries are closed for {c.name}. Reopen them from Manage, Categories, if you need to add someone before the draw.
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
                    {claims.get(e.id) && e.status === "pending" && (
                      <span className="tabular text-[13px] font-semibold text-turf-dark">Says paid, UTR {claims.get(e.id)!.ref}</span>
                    )}
                    {e.status === "pending" && (
                      <ActionForm action={updateEntry} values={{ entry: e.id, slug: ev.slug, op: "paid" }}>
                        <button className="rounded-md border border-ink px-2 py-0.5 text-[14px] font-semibold">Mark paid</button>
                      </ActionForm>
                    )}
                    {claims.get(e.id) && e.status === "pending" && (
                      <ActionForm action={rejectPayment} values={{ entry: e.id, slug: ev.slug }}>
                        <input name="reason" maxLength={200} aria-label={`Why reject ${e.name}'s payment`} placeholder="Reason (optional)"
                          className="w-36 rounded-md border border-line bg-white px-2 py-0.5 text-[14px]" />
                        <button className="rounded-md border border-danger px-2 py-0.5 text-[14px] font-semibold text-danger hover:bg-danger/10">Reject</button>
                      </ActionForm>
                    )}
                    <ConfirmAction action={updateEntry} values={{ entry: e.id, slug: ev.slug, op: "remove" }} trigger="Remove"
                      triggerClassName="rounded-md px-2 py-0.5 text-[14px] text-danger hover:bg-danger/10" confirmLabel="Remove entry"
                      title={`Remove ${e.name}?`} body="They lose their place in this category. Any fee they paid is between you and them." />
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

export function CategoryView({ ev, c, href }: { ev: EventDetail; c: CategoryDetail; href: (m: DbMatch) => string | undefined }) {
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

