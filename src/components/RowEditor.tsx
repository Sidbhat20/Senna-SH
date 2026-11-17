"use client";

import { useId, useState } from "react";

/** A list row with an Edit button that opens a full-width panel underneath; other actions sit beside it. */
export function RowEditor({ head, actions, panel, label = "Edit", className = "" }: {
  head: React.ReactNode; actions?: React.ReactNode; panel?: React.ReactNode; label?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">{head}</div>
        <div className="flex flex-wrap gap-1">
          {panel && (
            <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
              className={`h-11 rounded-lg border border-ink px-3 text-[15px] font-semibold ${open ? "chunky press bg-ink text-on-ink" : "hover:bg-line/40"}`}>
              {open ? "Close" : label}
            </button>
          )}
          {actions}
        </div>
      </div>
      {panel && <div id={id} hidden={!open} className="mt-3">{panel}</div>}
    </div>
  );
}
