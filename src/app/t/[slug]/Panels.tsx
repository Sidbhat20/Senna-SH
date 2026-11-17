"use client";

import { useActionState, useEffect, useState } from "react";
import { addEntries, drawFixtures, drawKnockout, importEntries, register, reschedule, type ActionState } from "@/app/actions";
import { IMPORT_TEMPLATE } from "@/lib/csv-import";
import type { RegField } from "@/lib/reg-fields";
import { Celebration } from "@/components/rive/Celebration";

const btn = "h-12 rounded-full px-6 font-semibold disabled:opacity-60";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={`mt-3 text-[15px] ${state.error ? "text-danger" : "text-turf-dark"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

const Hidden = ({ values }: { values: Record<string, string> }) => (
  <>
    {Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
  </>
);

const field = "mt-1 line-input";

/** Registration: singles just register; pairs add a partner; teams name the team and list players. Age-limited categories ask for date of birth. */
export function RegisterForm({ category, slug, kind, aged, ageHint, fields = [], paid = false }: {
  category: string; slug: string; kind: "solo" | "pair" | "team"; aged: boolean; ageHint?: string; fields?: RegField[]; paid?: boolean;
}) {
  const [state, action, pending] = useActionState(register, undefined);
  const needDob = aged && kind !== "team";
  return (
    <form action={action} className="mt-4 space-y-3">
      <Hidden values={{ category, slug }} />
      {kind === "team" && (
        <>
          <label className="block">
            <span className="block text-[14px] text-muted">Team name</span>
            <input name="team" required minLength={2} maxLength={60} className={field} />
          </label>
          <label className="block">
            <span className="block text-[14px] text-muted">Players</span>
            <span className="block text-[14px] text-muted">Optional. One per line; you can add the rest at the desk.</span>
            <textarea name="roster" rows={4} className={field} />
          </label>
        </>
      )}
      {needDob && (
        <label className="block">
          <span className="block text-[14px] text-muted">Your date of birth</span>
          {ageHint && <span className="block text-[14px] text-muted">{ageHint}</span>}
          <input name="dob" type="date" required className={field} />
        </label>
      )}
      {kind === "pair" && (
        <>
          <label className="block">
            <span className="block text-[14px] text-muted">Partner&apos;s name</span>
            <input name="partner" required maxLength={80} autoComplete="off" className={field} />
          </label>
          {needDob && (
            <label className="block">
              <span className="block text-[14px] text-muted">Partner&apos;s date of birth</span>
              <input name="partner_dob" type="date" required className={field} />
            </label>
          )}
        </>
      )}
      {fields.map((q) => (
        <div key={q.key}>
          {q.type === "choice" ? (
            <fieldset>
              <legend className="text-[14px] text-muted">{q.label}{!q.required && <span className="font-normal text-muted"> (optional)</span>}</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {q.options!.map((o) => (
                  <label key={o} className="cursor-pointer rounded-full border border-line px-3 py-1 text-[15px] has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-on-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-flood">
                    <input type="radio" name={`q_${q.key}`} value={o} required={q.required} className="sr-only" />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label className="block">
              <span className="block text-[14px] text-muted">{q.label}{!q.required && <span className="font-normal text-muted"> (optional)</span>}</span>
              <input name={`q_${q.key}`} type={q.type === "date" ? "date" : "text"} maxLength={200} required={q.required} className={field} />
            </label>
          )}
        </div>
      ))}
      {paid && (
        <label className="block">
          <span className="block text-[14px] text-muted">Discount code</span> <span className="text-muted">(optional)</span>
          <input name="code" maxLength={20} autoCapitalize="characters" autoComplete="off" className={`${field} uppercase`} />
        </label>
      )}
      <button disabled={pending} className={`${btn} w-full chunky press bg-turf text-on-turf hover:bg-turf-dark`}>
        {pending ? "Registering…" : kind === "pair" ? "Register our pair" : kind === "team" ? "Register the team" : "Register"}
      </button>
      <Message state={state} />
      {state?.ok && <Celebration />}
    </form>
  );
}

export function CopyLink({ path, label }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []); // after hydration, so server and client render the same first
  const url = `${origin}${path}`;
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 font-medium">{label}</span>}
      <input readOnly value={url} aria-label={label ? `${label} link` : "Link"}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[14px]" />
      <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
        className="h-11 rounded-lg border border-ink px-3 text-[15px] font-semibold">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function AddEntriesForm({ category, slug, team }: { category: string; slug: string; team: boolean }) {
  const [state, action, pending] = useActionState(addEntries, undefined);
  const [text, setText] = useState("");
  const count = text.split("\n").filter((l) => l.trim()).length;
  return (
    <form
      action={async (f) => {
        await action(f);
        setText("");
      }}
    >
      <Hidden values={{ category, slug }} />
      <label className="block">
        <span className="block text-[14px] text-muted">Add {team ? "teams or pairs" : "players"}</span>
        <span className="block text-[14px] text-muted">
          One per line, in seeding order. Add a club after a comma to keep clubmates apart: <em>Arjun Rao, Smash Academy</em>
        </span>
        <textarea name="names" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-line bg-surface px-3 py-2.5 focus:border-ink focus:outline-none" />
      </label>
      <button disabled={pending || !count} className={`${btn} mt-2 border border-ink`}>
        {pending ? "Adding…" : count ? `Add ${count}` : "Add"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function DrawButton({ category, slug, knockoutStage = false, label }: { category: string; slug: string; knockoutStage?: boolean; label: string }) {
  const [state, action, pending] = useActionState(knockoutStage ? drawKnockout : drawFixtures, undefined);
  return (
    <form action={action}>
      <Hidden values={{ category, slug }} />
      <button disabled={pending} className={`${btn} bg-ink text-on-ink hover:bg-ink/85`}>
        {pending ? "Drawing…" : label}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RescheduleButton({ event, slug }: { event: string; slug: string }) {
  const [state, action, pending] = useActionState(reschedule, undefined);
  return (
    <form action={action}>
      <Hidden values={{ event, slug }} />
      <button disabled={pending} className={`${btn} border border-ink`}>
        {pending ? "Updating…" : "Re-plan from now"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function ImportEntriesForm({ category, slug }: { category: string; slug: string }) {
  const [state, action, pending] = useActionState(importEntries, undefined);
  return (
    <form action={action} className="mt-4 border-t border-line pt-4">
      <Hidden values={{ category, slug }} />
      <p className="font-medium">Or import a spreadsheet</p>
      <p className="text-[14px] text-muted">A CSV with columns name, club and seed. Save from Excel or Google Sheets as CSV.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,text/csv" required aria-label="CSV file of entries"
          className="max-w-full text-[14px] file:mr-3 file:rounded-lg file:border file:border-ink file:bg-surface file:px-3 file:py-1.5 file:font-semibold" />
        <button disabled={pending} className={`${btn} border border-ink`}>{pending ? "Importing…" : "Import"}</button>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`} download="entries-template.csv"
          className="text-[14px] font-semibold underline underline-offset-2">Download template</a>
      </div>
      <Message state={state} />
    </form>
  );
}
