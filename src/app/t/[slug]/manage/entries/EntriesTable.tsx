"use client";

import { useState } from "react";
import { bulkEntries } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";

export type Row = { id: string; name: string; club: string; category: string; source: "online" | "offline"; status: string; payment: string; seed: number | null };

const PAY: Record<string, string> = { not_required: "Free", unpaid: "Unpaid", claimed: "Says paid", paid: "Paid", refunded: "Refunded" };

/** The entries desk table: tick rows, then mark them paid (cash), remove them, or download just those. */
export function EntriesTable({ rows, slug, drawn }: { rows: Row[]; slug: string; drawn: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const ids = [...picked].filter((id) => rows.some((r) => r.id === id));
  const all = rows.length > 0 && ids.length === rows.length;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const btn = "h-11 rounded-lg px-3 text-[15px] font-semibold disabled:opacity-50";

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-bg py-2">
        <span className="tabular mr-2 text-[15px] text-muted">{ids.length ? `${ids.length} ticked` : "Tick entries for bulk actions"}</span>
        <ActionForm action={bulkEntries} values={{ ids: ids.join(","), slug, op: "paid" }} showOk>
          <button disabled={!ids.length} className={`${btn} border border-ink`}>Mark paid (cash)</button>
        </ActionForm>
        <a href={ids.length ? `/t/${slug}/export/entries?ids=${ids.join(",")}` : undefined} aria-disabled={!ids.length} download
          className={`${btn} inline-flex items-center border border-line ${ids.length ? "hover:border-ink" : "pointer-events-none opacity-50"}`}>
          Download ticked
        </a>
        {!drawn && ids.length > 0 && (
          <ConfirmAction action={bulkEntries} values={{ ids: ids.join(","), slug, op: "remove" }} trigger={`Remove ${ids.length}`}
            triggerClassName={`${btn} ml-auto text-danger hover:bg-danger/10`} confirmLabel={`Remove ${ids.length}`}
            title={`Remove ${ids.length} ${ids.length === 1 ? "entry" : "entries"}?`}
            body="They lose their places. Fees they paid are between you and them." />
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-[15px]">
          <thead className="text-[13px] text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="w-8 py-2">
                <input type="checkbox" aria-label="Tick all" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">Entry</th>
              <th scope="col" className="py-2 pr-3 font-medium">Category</th>
              <th scope="col" className="py-2 pr-3 font-medium">Came in</th>
              <th scope="col" className="py-2 pr-3 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={picked.has(r.id) ? "bg-turf/5" : ""}>
                <td className="py-2"><input type="checkbox" aria-label={`Tick ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="py-2 pr-3">
                  <span className="font-medium">{r.name}</span>
                  {r.seed && <span className="tabular ml-1 text-[13px] text-muted">seed {r.seed}</span>}
                  {r.club && <span className="block text-[13px] text-muted">{r.club}</span>}
                </td>
                <td className="py-2 pr-3">{r.category}</td>
                <td className="py-2 pr-3">{r.source === "online" ? "Online" : "Walk-in"}</td>
                <td className="py-2 pr-3">{r.status === "confirmed" ? "Confirmed" : "Pending"}</td>
                <td className={`py-2 ${r.payment === "unpaid" || r.payment === "claimed" ? "font-semibold" : ""}`}>{PAY[r.payment] ?? r.payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
