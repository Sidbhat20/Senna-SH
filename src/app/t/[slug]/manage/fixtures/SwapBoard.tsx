"use client";

import { useState, useTransition } from "react";
import { swapEntries } from "@/app/actions";

export type SwapRow = { id: string; label: string; a: string; b: string; locked: string | null };
type Pick = { match: string; side: "a" | "b" };

/** First-round matches; pick (or drag) one player onto another to swap them. Rules are re-checked on the server. */
export function SwapBoard({ rows, slug }: { rows: SwapRow[]; slug: string }) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, start] = useTransition();

  const swap = (x: Pick, y: Pick) => {
    setPick(null);
    if (x.match === y.match) { setMsg({ error: "Pick a player in a different match." }); return; }
    const f = new FormData();
    Object.entries({ match_a: x.match, side_a: x.side, match_b: y.match, side_b: y.side, slug }).forEach(([k, v]) => f.set(k, v));
    start(async () => setMsg((await swapEntries(undefined, f)) ?? {}));
  };
  const click = (p: Pick) => (pick ? (pick.match === p.match && pick.side === p.side ? setPick(null) : swap(pick, p)) : setPick(p));

  return (
    <div>
      <p className="text-[15px] text-muted">
        Tap a player, then tap who they should swap with. On a computer you can also drag one onto the other. Only first-round matches that haven&apos;t started can change.
      </p>
      <p role={msg.error ? "alert" : "status"} className={`mt-2 min-h-6 text-[14px] ${msg.error ? "text-danger" : "text-turf-dark"}`}>
        {busy ? "Swapping…" : msg.error ?? msg.ok ?? (pick ? "Now pick who to swap with. Tap again to cancel." : "")}
      </p>
      <ol className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-surface p-2">
            <div className="mb-1 text-[12px] text-muted">{r.label}{r.locked && `, ${r.locked}`}</div>
            {(["a", "b"] as const).map((side) => {
              const on = pick?.match === r.id && pick.side === side;
              return (
                <button key={side} type="button" disabled={!!r.locked || busy} aria-pressed={on}
                  draggable={!r.locked} onClick={() => click({ match: r.id, side })}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ match: r.id, side }))}
                  onDragOver={(e) => { if (!r.locked) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); try { swap(JSON.parse(e.dataTransfer.getData("text/plain")), { match: r.id, side }); } catch { /* not one of ours */ } }}
                  className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-[15px] ${on ? "bg-ink text-on-ink" : r.locked ? "text-muted" : "cursor-grab hover:bg-line/50"}`}>
                  {side === "a" ? r.a : r.b}
                </button>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
