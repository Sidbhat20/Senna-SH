// The payments desk: every fee-paying entry, how it was paid, and the totals. No gateway: UPI goes straight to the
// organiser, so "UPI" means a player reported a UTR and the organiser confirmed it, and "cash" means Mark paid with no UTR.
import type { EventDetail } from "./data";
import type { Claim } from "./exports";

export type PayMode = "upi" | "cash" | null;
export type PayRow = {
  id: string; entry: string; category: string; amount: number; status: string; mode: PayMode;
  utr: string | null; claimedAt: string | null;
};

export function paymentRows(ev: EventDetail, claims: Map<string, Claim>): PayRow[] {
  return ev.categories.flatMap((c) => c.entryRows
    .filter((e) => e.paymentStatus !== "not_required" && (e.status !== "withdrawn" || e.paymentStatus === "paid" || e.paymentStatus === "refunded"))
    .map((e) => {
      const claim = claims.get(e.id);
      const paid = e.paymentStatus === "paid";
      return {
        id: e.id, entry: e.name, category: c.name, amount: c.entryFee, status: e.paymentStatus,
        mode: paid ? (claim ? "upi" : "cash") : null, utr: claim?.ref ?? null, claimedAt: claim?.claimedAt ?? null,
      };
    }));
}

export type PayTotals = Record<"due" | "claimed" | "upi" | "cash" | "refunded", { count: number; rupees: number }>;

export function paymentTotals(rows: PayRow[]): PayTotals {
  const t: PayTotals = { due: { count: 0, rupees: 0 }, claimed: { count: 0, rupees: 0 }, upi: { count: 0, rupees: 0 }, cash: { count: 0, rupees: 0 }, refunded: { count: 0, rupees: 0 } };
  for (const r of rows) {
    const k = r.status === "unpaid" ? "due" : r.status === "claimed" ? "claimed" : r.status === "refunded" ? "refunded" : r.mode;
    if (!k) continue;
    t[k].count++;
    t[k].rupees += r.amount;
  }
  return t;
}

export const PAY_FILTERS = ["all", "unpaid", "claimed", "upi", "cash", "refunded"] as const;
export type PayFilter = (typeof PAY_FILTERS)[number];

/** Filter by state or mode, and search the entry name or UTR. */
export function filterPayments(rows: PayRow[], f: PayFilter, q = ""): PayRow[] {
  const s = q.trim().toLowerCase();
  return rows.filter((r) =>
    (f === "all" || (f === "upi" || f === "cash" ? r.mode === f : r.status === f))
    && (!s || r.entry.toLowerCase().includes(s) || (r.utr ?? "").toLowerCase().includes(s)));
}
