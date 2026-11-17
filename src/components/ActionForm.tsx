"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

/**
 * A small form around a server action that reports back: buttons disable while it runs, and the action's
 * error (or confirmation) shows next to them. Use it for every privileged write so a refused change never looks done.
 */
export function ActionForm({
  action, values, children, className = "", showOk = false, success,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  showOk?: boolean;
  success?: React.ReactNode; // shown once the action succeeds (e.g. a celebration)
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={`flex flex-wrap items-center gap-x-2 ${className}`}>
      {Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {state?.error && <p role="alert" className="basis-full text-[13px] text-danger">{state.error}</p>}
      {showOk && state?.ok && <p role="status" className="basis-full text-[13px] text-turf-dark">{state.ok}</p>}
      {state?.ok && success}
    </form>
  );
}
