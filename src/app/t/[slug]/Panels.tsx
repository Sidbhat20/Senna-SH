"use client";

import { useActionState, useEffect, useState } from "react";
import { addEntries, drawFixtures, drawKnockout, register, reschedule, type ActionState } from "@/app/actions";

const btn = "h-12 rounded-lg px-5 font-semibold disabled:opacity-60";

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

const field = "mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2.5 focus:border-ink focus:outline-none";

/** Registration: singles just register; pairs add a partner; teams name the team and list players. Age-limited categories ask for date of birth. */
export function RegisterForm({ category, slug, kind, aged, ageHint }: {
  category: string; slug: string; kind: "solo" | "pair" | "team"; aged: boolean; ageHint?: string;
}) {
  const [state, action, pending] = useActionState(register, undefined);
  const needDob = aged && kind !== "team";
  return (
    <form action={action} className="mt-4 space-y-3">
      <Hidden values={{ category, slug }} />
      {kind === "team" && (
        <>
          <label className="block">
            <span className="font-medium">Team name</span>
            <input name="team" required minLength={2} maxLength={60} className={field} />
          </label>
          <label className="block">
            <span className="font-medium">Players</span>
            <span className="block text-[14px] text-muted">Optional. One per line; you can add the rest at the desk.</span>
            <textarea name="roster" rows={4} className={field} />
          </label>
        </>
      )}
      {needDob && (
        <label className="block">
          <span className="font-medium">Your date of birth</span>
          {ageHint && <span className="block text-[14px] text-muted">{ageHint}</span>}
          <input name="dob" type="date" required className={field} />
        </label>
      )}
      {kind === "pair" && (
        <>
          <label className="block">
            <span className="font-medium">Partner&apos;s name</span>
            <input name="partner" required maxLength={80} autoComplete="off" className={field} />
          </label>
          {needDob && (
            <label className="block">
              <span className="font-medium">Partner&apos;s date of birth</span>
              <input name="partner_dob" type="date" required className={field} />
            </label>
          )}
        </>
      )}
      <button disabled={pending} className={`${btn} w-full bg-turf text-white hover:bg-turf-dark`}>
        {pending ? "Registering…" : kind === "pair" ? "Register our pair" : kind === "team" ? "Register the team" : "Register"}
      </button>
      <Message state={state} />
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
        className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[14px]" />
      <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
        className="h-10 rounded-lg border border-ink px-3 text-[15px] font-semibold">
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
        <span className="font-medium">Add {team ? "teams or pairs" : "players"}</span>
        <span className="block text-[14px] text-muted">
          One per line, in seeding order. Add a club after a comma to keep clubmates apart: <em>Arjun Rao, Smash Academy</em>
        </span>
        <textarea name="names" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3 py-2.5 focus:border-ink focus:outline-none" />
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
      <button disabled={pending} className={`${btn} bg-ink text-chalk hover:bg-pitch`}>
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
