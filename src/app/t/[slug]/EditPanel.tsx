import { addCourt, addRegField, setUpiId, cancelEvent, closeAllEntries, removeRegField, renameCourt, setCategoryStatus, updateEvent } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { PosterUpload } from "@/components/PosterUpload";
import type { EventDetail } from "@/lib/data";
import { StaffSection } from "./StaffSection";

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

const STATUS_TEXT: Record<string, string> = {
  open: "Taking entries", locked: "Entries closed", live: "Being played", completed: "Finished", cancelled: "Cancelled", draft: "Draft",
};

export function EditPanel({ ev }: { ev: EventDetail }) {
  if (ev.status === "completed" || ev.status === "cancelled") {
    return (
      <p className="max-w-prose rounded-xl border border-line bg-white p-5">
        This tournament is {ev.status === "completed" ? "finished" : "cancelled"}, so its details can&apos;t change any more.
      </p>
    );
  }
  const start = ist(ev.startsAt);
  const close = ist(ev.regClosesAt);
  const hidden = { event: ev.id, slug: ev.slug };

  return (
    <div className="space-y-10">
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

      <section aria-labelledby="upi">
        <h2 id="upi" className="font-display text-3xl font-bold">Entry fees by UPI</h2>
        <p className="max-w-prose text-muted">
          Players in paid categories pay this UPI ID directly from GPay, PhonePe or Paytm, then send you their UTR. Check it in
          your bank app and tap Mark paid. Leave it empty to collect fees at the desk only.
        </p>
        <ActionForm action={setUpiId} values={hidden} showOk className="mt-3 max-w-xl">
          <input name="upi" defaultValue={ev.upiId ?? ""} placeholder="yourname@okhdfcbank" aria-label="UPI ID" className={`${box} mt-0 min-w-0 flex-1`} />
          <button className={`${btn} bg-ink text-chalk`}>Save</button>
        </ActionForm>
      </section>

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

      <section aria-labelledby="poster">
        <h2 id="poster" className="font-display text-3xl font-bold">Poster</h2>
        <div className="mt-3"><PosterUpload eventId={ev.id} hasPoster={!!ev.posterUrl} /></div>
      </section>

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

      <StaffSection ev={ev} />

      <section aria-labelledby="cats">
        <h2 id="cats" className="font-display text-3xl font-bold">Categories</h2>
        <ul className="mt-3 divide-y divide-line">
          {ev.categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="text-[14px] text-muted">{STATUS_TEXT[c.status]}, {c.entryCount} of {c.maxEntries} entered</div>
              </div>
              {c.status === "open" && (
                <ActionForm action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "locked" }}>
                  <button className={`${btn} border border-ink`}>Close entries</button>
                </ActionForm>
              )}
              {c.status === "locked" && c.matches.length === 0 && (
                <ActionForm action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "open" }}>
                  <button className={`${btn} border border-ink`}>Reopen entries</button>
                </ActionForm>
              )}
              {["open", "locked", "live"].includes(c.status) && (
                <ActionForm action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "cancelled" }}>
                  <label className="flex items-center gap-1.5 text-[14px]"><input type="checkbox" name="confirm" value="yes" /> Sure</label>
                  <button className={`${btn} text-danger hover:bg-danger/10`}>Cancel category</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="whole" className="max-w-xl space-y-6 rounded-xl border-2 border-ink p-5">
        <h2 id="whole" className="font-display text-2xl font-bold">The whole tournament</h2>
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
          <ActionForm action={cancelEvent} values={hidden} className="mt-2">
            <div className="w-full space-y-2">
              <label className="flex items-center gap-2 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" required /> I want to cancel {ev.title}
              </label>
              <button className={`${btn} bg-danger text-white`}>Cancel tournament</button>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
