"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { ActionState } from "@/app/actions";

/**
 * A destructive action behind a modal. The native dialog traps focus and closes on Esc; focus starts on the safe
 * button, and the danger button is the one that submits (with confirm=yes, which the server action checks).
 */
export function ConfirmAction({
  action, values, trigger, title, body, confirmLabel, triggerClassName = "", formId,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: Record<string, string>;
  trigger: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  triggerClassName?: string;
  formId?: string; // lets fields outside the dialog (form="…") travel with the confirmed submit
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [state, run, pending] = useActionState(action, undefined);
  useEffect(() => { if (state?.ok) dialog.current?.close(); }, [state]);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => dialog.current?.showModal()}>{trigger}</button>
      {state?.ok && <p role="status" className="basis-full text-[13px] text-turf-dark">{state.ok}</p>}
      <dialog ref={dialog} aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/50">
        <form id={formId} action={run} className="space-y-4 p-5">
          {Object.entries({ ...values, confirm: "yes" }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <h2 id={`${id}-t`} className="font-display text-2xl font-bold">{title}</h2>
          <div id={`${id}-b`} className="text-[15px]">{body}</div>
          {state?.error && <p role="alert" className="text-[14px] text-danger">{state.error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" autoFocus onClick={() => dialog.current?.close()} className="h-11 rounded-lg border border-ink px-4 font-semibold">
              Keep it
            </button>
            <button disabled={pending} className="h-11 rounded-lg bg-danger px-4 font-semibold text-on-danger disabled:opacity-60">{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
