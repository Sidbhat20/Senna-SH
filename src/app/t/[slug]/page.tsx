import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { applyCoupon, claimPayment, withdrawEntry } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PosterUpload } from "@/components/PosterUpload";
import { ageLimitText, dateTime, feeRange, MatchRow, perEntry, scoringText, sportName, StatusPill } from "@/components/ui";
import { FORMATS, getEvent, myEntries, paymentClaims, type DbMatch } from "@/lib/data";
import { whatsappShare } from "@/lib/notify";
import { qrPath } from "@/lib/qr";
import { amountDue } from "@/lib/payments";
import { payRef, upiLink } from "@/lib/upi";
import type { Claim } from "@/lib/exports";
import { CopyLink, RegisterForm } from "./Panels";
import { CategoryView, ManageCategory, OrderOfPlay, scorable } from "./views";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; view?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getEvent((await params).slug);
  return t ? { title: t.title, description: `${sportName(t)} at ${t.venue}${t.area ? `, ${t.area}` : ""}. ${feeRange(t.categories)}.` } : {};
}


export default async function EventPage({ params, searchParams }: Props) {
  const ev = await getEvent((await params).slug);
  if (!ev) notFound();
  const { c: catId, view } = await searchParams;
  if (view === "edit") redirect(ev.canManage ? `/t/${ev.slug}/manage/settings` : `/t/${ev.slug}`); // old Edit tab links
  const me = await myEntries(ev);
  const claims = ev.canManage ? await paymentClaims(ev.id) : new Map<string, Claim>();
  const schedule = view === "schedule";
  const onCategory = !schedule;
  const c = ev.categories.find((x) => x.id === catId) ?? ev.categories[0];
  const href = (m: DbMatch) => (ev.canManage && scorable(m) ? `/referee/match/${m.id}` : undefined);
  const hasTimes = ev.categories.some((x) => x.matches.some((m) => m.at));
  const live = ev.categories.flatMap((x) => x.matches).filter((m) => m.status === "live");
  const mine = c && me.byCategory.get(c.id);
  // one UPI link for the Pay button and the QR
  const payLink = mine && c && ev.upiId ? upiLink({ upiId: ev.upiId, payee: ev.organiser, rupees: amountDue(c, mine), ref: payRef(mine.id), note: `${payRef(mine.id)} ${c.name} entry` }) : null;
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
          {ev.canManage && (
            <Link href={`/t/${ev.slug}/manage`}
              className="mr-3 mt-5 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-chalk hover:bg-pitch print:hidden">
              Manage tournament
            </Link>
          )}
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
      </nav>

      {schedule ? (
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
          {ev.canManage && <div className="mt-6"><ManageCategory ev={ev} c={c} claims={claims} /></div>}
          <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_18rem]">
            <div className="min-w-0"><CategoryView ev={ev} c={c} href={href} /></div>
            <aside className="space-y-8">
              {(regOpen || mine) && (
                <div className="rounded-xl border border-line bg-white p-5">
                  {mine ? (
                    <>
                      <div className="font-display text-2xl font-bold">{mine.status !== "pending" ? "You're in" : mine.paymentStatus === "claimed" ? "Paid, awaiting confirmation" : "Registered, payment due"}</div>
                      {mine.status === "pending" && (
                        <div className="mt-2 space-y-3 text-[15px]">
                          {mine.paymentStatus === "unpaid" && (
                            <p className="text-muted">Pay before entries close on {dateTime(ev.regClosesAt)}. Unpaid places are released then, and you can&apos;t sign up again yourself.</p>
                          )}
                          {mine.paymentStatus === "unpaid" && mine.feeDue === null && (
                            <details className="text-[15px]">
                              <summary className="cursor-pointer font-semibold">Have a discount code?</summary>
                              <ActionForm action={applyCoupon} values={{ entry: mine.id, slug: ev.slug }} showOk className="mt-2">
                                <input name="code" maxLength={20} autoComplete="off" aria-label="Discount code"
                                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 uppercase focus:border-ink focus:outline-none" />
                                <button className="h-10 rounded-lg border border-ink px-3 font-semibold disabled:opacity-60">Apply</button>
                              </ActionForm>
                            </details>
                          )}
                          {mine.paymentNote && (
                            <p role="status" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2">
                              The organiser couldn&apos;t match your payment: {mine.paymentNote.replace(/[.!]+$/, "")}. Check the UTR and send it again.
                            </p>
                          )}
                          {mine.paymentStatus === "claimed" ? (
                            <p className="text-muted">The organiser has your UPI reference and will confirm your place once they see the payment.</p>
                          ) : ev.upiId ? (
                            <>
                              <a href={payLink!}
                                className="block rounded-lg bg-turf px-5 py-3 text-center font-semibold text-white hover:bg-turf-dark">
                                Pay ₹{amountDue(c, mine).toLocaleString("en-IN")} with UPI
                              </a>
                              <div className="flex items-center gap-4">
                                {(() => {
                                  const qr = qrPath(payLink!);
                                  return (
                                    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={132} height={132} shapeRendering="crispEdges" role="img"
                                      aria-label={`QR code to pay ₹${amountDue(c, mine).toLocaleString("en-IN")} to ${ev.upiId}`} className="shrink-0 rounded-md border border-line">
                                      <rect width={qr.size} height={qr.size} fill="#fff" />
                                      <path d={qr.d} fill="#17251b" />
                                    </svg>
                                  );
                                })()}
                                <p className="text-muted">
                                  Scan with any UPI app, or pay <strong className="text-ink">₹{amountDue(c, mine).toLocaleString("en-IN")}</strong> to{" "}
                                  <strong className="text-ink">{ev.upiId}</strong> with the note <strong className="text-ink">{payRef(mine.id)}</strong>.
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="text-muted">Pay {perEntry(c).toLowerCase()} to the organiser. They&apos;ll confirm your place.</p>
                          )}
                          {ev.upiId && (
                            <ActionForm action={claimPayment} values={{ entry: mine.id, slug: ev.slug }} showOk>
                              <input name="ref" inputMode="numeric" maxLength={40} required aria-label="UPI reference (UTR)"
                                placeholder={mine.paymentStatus === "claimed" ? "Wrong UTR? Send it again" : "UTR from your UPI app"}
                                className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 focus:border-ink focus:outline-none" />
                              <button className="h-10 rounded-lg border border-ink px-3 font-semibold disabled:opacity-60">I&apos;ve paid</button>
                            </ActionForm>
                          )}
                        </div>
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
                          <RegisterForm category={c.id} slug={ev.slug} kind={c.entryType} aged={!!(c.bornOnOrAfter || c.bornOnOrBefore)} ageHint={ageLimitText(c)} fields={ev.regFields} paid={c.entryFee > 0} />
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
