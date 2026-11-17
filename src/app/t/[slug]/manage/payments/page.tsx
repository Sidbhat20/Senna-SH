import Link from "next/link";
import { rejectPayment, updateEntry } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { PhoneQR } from "@/components/iso/scenes";
import { dateTime } from "@/components/ui";
import { getEvent, paymentClaims } from "@/lib/data";
import { filterPayments, PAY_FILTERS, paymentRows, paymentTotals, type PayFilter } from "@/lib/payments";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ f?: string; q?: string }> };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const LABEL: Record<PayFilter, string> = { all: "All", unpaid: "Unpaid", claimed: "Says paid", upi: "UPI", cash: "Cash", refunded: "Refunded" };
const STATUS: Record<string, string> = { unpaid: "Unpaid", claimed: "Says paid", paid: "Paid", refunded: "Refunded" };

export default async function PaymentsPage({ params, searchParams }: Props) {
  const ev = (await getEvent((await params).slug))!;
  const sp = await searchParams;
  const f: PayFilter = PAY_FILTERS.includes(sp.f as PayFilter) ? (sp.f as PayFilter) : "all";
  const rows = paymentRows(ev, await paymentClaims(ev.id));
  const t = paymentTotals(rows);
  const shown = filterPayments(rows, f, sp.q);
  const cards: [string, { count: number; rupees: number }, string?][] = [
    ["Due", t.due, "border-danger/50"], ["Says paid, check your bank", t.claimed, "border-flood border-2"],
    ["Received by UPI", t.upi], ["Received in cash", t.cash], ["Refunded", t.refunded],
  ];
  const qs = (next: Partial<{ f: string; q: string }>) => {
    const p = new URLSearchParams({ ...(f !== "all" ? { f } : {}), ...(sp.q ? { q: sp.q } : {}), ...next });
    if (p.get("f") === "all") p.delete("f");
    return `?${p}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Payments</h2>
          <p className="max-w-prose text-muted">
            Fees go straight to {ev.upiId ? <strong className="text-ink">{ev.upiId}</strong> : "you"}; SportsHunt never holds money.
            Check each UTR against your bank app before you confirm it.
          </p>
        </div>
        <a href={`/t/${ev.slug}/export/payments`} download className="inline-flex h-11 items-center rounded-lg border border-ink px-3 font-semibold">Download (CSV)</a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(([label, v, tone]) => (
          <div key={label} className={`rounded-xl border bg-surface p-4 ${v.count && tone ? tone : "border-line"}`}>
            <div className="text-[13px] text-muted">{label}</div>
            <div className="tabular mt-1 font-display text-2xl font-extrabold leading-none">{rupees(v.rupees)}</div>
            <div className="tabular mt-1 text-[14px] text-muted">{v.count} {v.count === 1 ? "entry" : "entries"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter payments" className="flex flex-wrap gap-1.5">
          {PAY_FILTERS.map((k) => (
            <Link key={k} href={qs({ f: k })} aria-current={f === k ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-[15px] ${f === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface hover:border-ink"}`}>
              {LABEL[k]}
            </Link>
          ))}
        </nav>
        <form role="search" className="ml-auto flex gap-2">
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name or UTR" aria-label="Search payments"
            className="h-11 w-48 rounded-lg border border-line bg-surface px-3 focus:border-ink focus:outline-none" />
          <button className="h-11 rounded-lg chunky press bg-ink px-3 font-semibold text-on-ink">Search</button>
        </form>
      </div>

      {shown.length === 0 ? (
        rows.length ? <p className="text-muted">Nothing matches. Try another filter or search.</p> : (
          <div className="flex flex-col gap-5 rounded-[6px] chunky bg-surface p-6 sm:flex-row sm:items-center">
            <PhoneQR className="w-36 shrink-0" />
            <div>
              <p className="font-display text-2xl font-extrabold leading-tight">Every category is free, so there&apos;s nothing to collect.</p>
              <p className="mt-1 text-muted">Add a fee to a category and players pay your UPI ID straight from their phone. Their UTRs land here for you to check.</p>
              <Link href={`/t/${ev.slug}/manage/categories`} className="mt-4 inline-flex h-11 items-center rounded-[6px] chunky press bg-surface px-4 font-bold">Set a fee</Link>
            </div>
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-[15px]">
            <thead className="border-b border-line text-[13px] text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Entry</th>
                <th scope="col" className="py-2 pr-3 font-medium">Amount</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 font-medium">UTR</th>
                <th scope="col" className="py-2 pr-3 font-medium">Reported</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-2.5 pr-3"><span className="font-medium">{r.entry}</span><span className="block text-[13px] text-muted">{r.category}</span></td>
                  <td className="tabular py-2.5 pr-3">{rupees(r.amount)}</td>
                  <td className="py-2.5 pr-3">{STATUS[r.status] ?? r.status}{r.mode && <span className="text-muted">, {r.mode === "upi" ? "UPI" : "cash"}</span>}</td>
                  <td className="tabular py-2.5 pr-3">{r.utr ?? "–"}</td>
                  <td className="py-2.5 pr-3 text-[14px]">{r.claimedAt ? dateTime(r.claimedAt) : "–"}</td>
                  <td className="py-2">
                    {(r.status === "unpaid" || r.status === "claimed") && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <ActionForm action={updateEntry} values={{ entry: r.id, slug: ev.slug, op: "paid" }}>
                          <button className="h-11 rounded-md border border-ink px-2.5 text-[14px] font-semibold">{r.status === "claimed" ? "Confirm UPI" : "Mark paid (cash)"}</button>
                        </ActionForm>
                        {r.status === "claimed" && (
                          <ActionForm action={rejectPayment} values={{ entry: r.id, slug: ev.slug }}>
                            <input name="reason" maxLength={200} aria-label={`Why reject ${r.entry}'s payment`} placeholder="Reason (optional)"
                              className="h-11 w-36 rounded-md border border-line bg-surface px-2 text-[14px]" />
                            <button className="h-11 rounded-md border border-danger px-2.5 text-[14px] font-semibold text-danger hover:bg-danger/10">Reject</button>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
