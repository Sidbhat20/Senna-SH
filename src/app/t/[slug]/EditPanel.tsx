import { addCourt, addRegField, createCoupon, deleteCoupon, setUpiId, cancelEvent, closeAllEntries, removeRegField, renameCourt, updateEvent } from "@/app/actions";
import { ConfirmAction } from "@/components/ConfirmAction";
import { ActionForm } from "@/components/ActionForm";
import { PosterUpload } from "@/components/PosterUpload";
import type { Coupon, EventDetail } from "@/lib/data";

const box = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2.5 focus:border-ink focus:outline-none";
const btn = "h-11 rounded-lg px-4 font-semibold disabled:opacity-60";

/** An ISO timestamp as Bangalore date and time strings, for date/time inputs. */
export function ist(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-[14px] text-muted">{hint}</span>}
      {children}
    </label>
  );
}


/** Finished and cancelled tournaments can't change; sections show this instead. */
export function Frozen({ ev }: { ev: EventDetail }) {
  if (ev.status !== "completed" && ev.status !== "cancelled") return null;
  return (
    <p className="max-w-prose rounded-xl border border-line bg-white p-5">
      This tournament is {ev.status === "completed" ? "finished" : "cancelled"}, so its details can&apos;t change any more.
    </p>
  );
}

/** Name, venue, dates, timings, age checks and rules. */
export function DetailsForm({ ev }: { ev: EventDetail }) {
  const start = ist(ev.startsAt);
  const close = ist(ev.regClosesAt);
  const hidden = { event: ev.id, slug: ev.slug };
  return (
    <section aria-labelledby="details">
      <h2 id="details" className="font-display text-3xl font-bold">Details</h2>
      <p className="text-muted">The sport and each category&apos;s format stay as published, so draws never change underneath players.</p>
      <ActionForm action={updateEvent} values={hidden} showOk className="mt-4 max-w-3xl">
        <div className="w-full space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tournament name"><input name="title" defaultValue={ev.title} required minLength={4} maxLength={120} className={box} /></Field>
            <Field label="Venue"><input name="venue" defaultValue={ev.venue} required maxLength={120} className={box} /></Field>
            <Field label="Area"><input name="area" defaultValue={ev.area} maxLength={120} className={box} /></Field>
            <Field label="Prizes"><input name="prize" defaultValue={ev.prize} maxLength={200} className={box} /></Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First match">
              <span className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <input type="date" name="start_date" defaultValue={start.date} required aria-label="First match date" className={`${box} mt-0`} />
                <input type="time" name="start_time" defaultValue={start.time} step={900} required aria-label="First match time" className={`${box} mt-0`} />
              </span>
            </Field>
            <Field label="Entries close">
              <span className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <input type="date" name="close_date" defaultValue={close.date} required aria-label="Entries close date" className={`${box} mt-0`} />
                <input type="time" name="close_time" defaultValue={close.time} step={900} required aria-label="Entries close time" className={`${box} mt-0`} />
              </span>
            </Field>
            <Field label="One match takes (minutes)">
              <input name="match_minutes" inputMode="numeric" defaultValue={ev.matchMinutes} className={box} />
            </Field>
            <Field label="Break between matches (minutes)">
              <input name="break_minutes" inputMode="numeric" defaultValue={ev.breakMinutes} className={box} />
            </Field>
          </div>
          <fieldset>
            <legend className="font-medium">How you check ages</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="radio" name="age_check" value="self" defaultChecked={ev.ageCheck === "self"} /> Players declare it</label>
              <label className="flex items-center gap-2"><input type="radio" name="age_check" value="desk" defaultChecked={ev.ageCheck === "desk"} /> We check ID at the desk</label>
            </div>
          </fieldset>
          <Field label="Rules" hint="One per line.">
            <textarea name="rules" rows={4} defaultValue={ev.rules.join("\n")} className={box} />
          </Field>
          <button className={`${btn} bg-turf text-white hover:bg-turf-dark`}>Save details</button>
        </div>
      </ActionForm>
    </section>
  );
}

/** The poster players see on the event page. */
export function PosterSection({ ev }: { ev: EventDetail }) {
  return (
    <section aria-labelledby="poster">
      <h2 id="poster" className="font-display text-3xl font-bold">Poster</h2>
      <div className="mt-3"><PosterUpload eventId={ev.id} hasPoster={!!ev.posterUrl} /></div>
    </section>
  );
}

/** The UPI ID players pay. Owner-only in the database (set_upi_id). */
export function FeesSection({ ev }: { ev: EventDetail }) {
  const hidden = { event: ev.id, slug: ev.slug };
  return (
    <section aria-labelledby="upi">
      <h2 id="upi" className="font-display text-3xl font-bold">Entry fees by UPI</h2>
      <p className="max-w-prose text-muted">
        Players in paid categories pay this UPI ID directly from GPay, PhonePe or Paytm, then send you their UTR. Check it in
        your bank app and tap Mark paid. Leave it empty to collect fees at the desk only.
      </p>
      <p className="max-w-prose text-[14px] text-muted">
        For regular collections, use a business or merchant UPI ID from your bank or a UPI business app rather than a
        personal one if you can. SportsHunt doesn&apos;t set up merchant accounts for you.
      </p>
      <ActionForm action={setUpiId} values={hidden} showOk className="mt-3 max-w-xl">
        <input name="upi" defaultValue={ev.upiId ?? ""} placeholder="yourname@okhdfcbank" aria-label="UPI ID" className={`${box} mt-0 min-w-0 flex-1`} />
        <button className={`${btn} bg-ink text-chalk`}>Save</button>
      </ActionForm>
    </section>
  );
}

/** Extra registration questions. */
export function QuestionsSection({ ev }: { ev: EventDetail }) {
  const hidden = { event: ev.id, slug: ev.slug };
  return (
    <section aria-labelledby="questions">
      <h2 id="questions" className="font-display text-3xl font-bold">Registration questions</h2>
      <p className="max-w-prose text-muted">Ask every player something extra, like a T-shirt size. Answers show only to organisers, in the entries download.</p>
      {ev.regFields.length > 0 && (
        <ul className="mt-3 max-w-2xl divide-y divide-line">
          {ev.regFields.map((q) => (
            <li key={q.key} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{q.label}</span>
                <span className="text-[14px] text-muted">
                  {" "}{q.type === "choice" ? `(${q.options!.join(", ")})` : q.type === "date" ? "(a date)" : "(text)"}{q.required ? ", required" : ", optional"}
                </span>
              </div>
              <ActionForm action={removeRegField} values={{ ...hidden, key: q.key }}>
                <button className="h-10 rounded-lg px-3 text-[15px] font-semibold text-danger hover:bg-danger/10">Remove</button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      {ev.regFields.length < 10 && (
        <ActionForm action={addRegField} values={hidden} showOk className="mt-3 max-w-2xl">
          <div className="w-full space-y-3 rounded-xl border border-line bg-white p-4">
            <input name="label" required maxLength={60} placeholder="Question, e.g. T-shirt size" aria-label="Question" className={`${box} mt-0`} />
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Kind of answer</legend>
              {[["text", "Text"], ["date", "A date"], ["choice", "Pick from options"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2"><input type="radio" name="type" value={v} defaultChecked={v === "text"} /> {l}</label>
              ))}
            </fieldset>
            <input name="options" maxLength={400} placeholder="Options, separated by commas (for Pick from options): S, M, L, XL" aria-label="Options" className={`${box} mt-0`} />
            <label className="flex items-center gap-2"><input type="checkbox" name="required" value="yes" /> Players must answer</label>
            <button className={`${btn} bg-ink text-chalk`}>Add question</button>
          </div>
        </ActionForm>
      )}
    </section>
  );
}

/** Courts: add and rename. */
export function CourtsSection({ ev }: { ev: EventDetail }) {
  const hidden = { event: ev.id, slug: ev.slug };
  return (
    <section aria-labelledby="courts">
      <h2 id="courts" className="font-display text-3xl font-bold">Courts</h2>
      <p className="text-muted">Renaming keeps every match and referee link on that court. A new court gets its own referee link.</p>
      <ul className="mt-3 max-w-xl space-y-2">
        {ev.courts.map((c) => (
          <li key={c.id}>
            <ActionForm action={renameCourt} values={{ court: c.id, slug: ev.slug }} showOk>
              <input name="name" defaultValue={c.name} maxLength={40} aria-label={`Name for ${c.name}`} className={`${box} mt-0 min-w-0 flex-1`} />
              <button className={`${btn} border border-ink`}>Rename</button>
            </ActionForm>
          </li>
        ))}
      </ul>
      <ActionForm action={addCourt} values={hidden} showOk className="mt-3 max-w-xl">
        <input name="name" placeholder={`Court ${ev.courts.length + 1}`} maxLength={40} aria-label="New court name" className={`${box} mt-0 min-w-0 flex-1`} />
        <button className={`${btn} bg-ink text-chalk`}>Add court</button>
      </ActionForm>
    </section>
  );
}

/** Spreadsheets and print. */
export function DownloadsSection({ ev }: { ev: EventDetail }) {
  return (
    <section aria-labelledby="downloads">
      <h2 id="downloads" className="font-display text-3xl font-bold">Downloads</h2>
      <p className="text-muted">Spreadsheets open in Excel or Google Sheets. Entries include each player&apos;s or captain&apos;s email and phone, so keep that file private.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {[
          ["Entries (CSV)", `/t/${ev.slug}/export/entries`],
          ["Fixtures and results (CSV)", `/t/${ev.slug}/export/fixtures`],
          ["Order of play (CSV)", `/t/${ev.slug}/export/order-of-play`],
        ].map(([label, href]) => (
          <li key={href}><a href={href} download className={`${btn} inline-flex items-center border border-ink`}>{label}</a></li>
        ))}
        <li><a href={`/t/${ev.slug}/print`} className={`${btn} inline-flex items-center bg-ink text-chalk`}>Printable order of play</a></li>
      </ul>
    </section>
  );
}

/** Close all entries, or cancel the tournament (behind a confirm dialog). */
export function DangerZone({ ev }: { ev: EventDetail }) {
  const hidden = { event: ev.id, slug: ev.slug };
  return (
    <section aria-labelledby="whole" className="max-w-xl space-y-6 rounded-xl border-2 border-danger/60 p-5">
      <h2 id="whole" className="font-display text-2xl font-bold">Danger zone</h2>
      <div>
        <p className="text-[15px]">Stop new entries in every category. Draws can still happen.</p>
        <ActionForm action={closeAllEntries} values={hidden} showOk className="mt-2">
          <button className={`${btn} border border-ink`}>Close all entries</button>
        </ActionForm>
      </div>
      <div className="border-t border-line pt-5">
        <p className="text-[15px]">
          Cancelling shows the tournament as cancelled to everyone and stops entries, draws and scoring. Entries and results are kept.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ConfirmAction action={cancelEvent} values={hidden} trigger="Cancel tournament" triggerClassName={`${btn} border-2 border-danger text-danger hover:bg-danger/10`}
            title={`Cancel ${ev.title}?`} confirmLabel="Cancel tournament"
            body={<>Everyone sees it as cancelled, and entries, draws and scoring stop. Players with an email on file are told. This can&apos;t be undone.</>} />
        </div>
      </div>
    </section>
  );
}


/** Discount codes: managers see every code and how often it's been used; players only ever type one in. */
export function CouponsSection({ ev, coupons }: { ev: EventDetail; coupons: Coupon[] }) {
  const hidden = { event: ev.id, slug: ev.slug };
  const paid = ev.categories.filter((c) => c.entryFee > 0 && c.status !== "cancelled");
  const off = (c: Coupon) => (c.kind === "percent" ? `${c.amount}% off` : `₹${c.amount.toLocaleString("en-IN")} off`);
  return (
    <section aria-labelledby="coupons">
      <h2 id="coupons" className="font-display text-3xl font-bold">Discount codes</h2>
      <p className="max-w-prose text-muted">Players type a code when they register, and the UPI amount drops to match. Codes stay private: only organisers see this list.</p>
      {coupons.length > 0 && (
        <ul className="mt-3 max-w-2xl divide-y divide-line">
          {coupons.map((c) => {
            const expired = !!c.expiresAt && +new Date(c.expiresAt) <= Date.now();
            const usedUp = c.maxUses !== null && c.uses >= c.maxUses;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="tabular font-semibold tracking-wide">{c.code}</span>
                  <span className="text-[14px] text-muted">
                    {" "}{off(c)}{c.categoryId ? `, ${ev.categories.find((x) => x.id === c.categoryId)?.name ?? "one category"} only` : ""}.
                    {" "}Used {c.uses}{c.maxUses !== null ? ` of ${c.maxUses}` : ""}{c.expiresAt ? `, ${expired ? "expired" : "until"} ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(c.expiresAt))}` : ""}.
                    {(expired || usedUp) && <strong className="text-ink"> No longer works.</strong>}
                  </span>
                </div>
                <ConfirmAction action={deleteCoupon} values={{ ...hidden, coupon: c.id }} trigger="Remove"
                  triggerClassName="h-10 rounded-lg px-3 text-[15px] font-semibold text-danger hover:bg-danger/10" confirmLabel={`Remove ${c.code}`}
                  title={`Remove ${c.code}?`} body="Nobody can use it from now on. Entries that already used it keep their discount." />
              </li>
            );
          })}
        </ul>
      )}
      {paid.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted">Every category is free, so there&apos;s nothing to discount.</p>
      ) : (
        <ActionForm action={createCoupon} values={hidden} showOk className="mt-3 max-w-2xl">
          <div className="grid w-full gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
            <label><span className="font-medium">Code</span>
              <input name="code" required maxLength={20} placeholder="EARLY20" autoComplete="off" className={`${box} uppercase`} /></label>
            <fieldset><legend className="font-medium">Discount</legend>
              <span className="mt-1 flex gap-2">
                <input name="amount" required inputMode="numeric" placeholder="20" aria-label="Amount" className={`${box} mt-0 w-24`} />
                <select name="kind" aria-label="Kind of discount" className={`${box} mt-0`} defaultValue="percent">
                  <option value="percent">% off</option><option value="flat">₹ off</option>
                </select>
              </span>
            </fieldset>
            <label><span className="font-medium">Category</span>
              <select name="category" className={box} defaultValue="">
                <option value="">Any paid category</option>
                {paid.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label><span className="font-medium">Uses allowed</span> <span className="text-[13px] text-muted">(empty for no limit)</span>
              <input name="max" inputMode="numeric" className={box} /></label>
            <label><span className="font-medium">Last day</span> <span className="text-[13px] text-muted">(optional)</span>
              <input name="expires" type="date" className={box} /></label>
            <button className={`${btn} self-end bg-ink text-chalk`}>Create code</button>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
