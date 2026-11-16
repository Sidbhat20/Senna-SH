import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dateTime, time } from "@/components/ui";
import { getEvent } from "@/lib/data";
import { matchLabel } from "@/lib/exports";
import { BYE } from "@/lib/fixtures/types";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Order of play", robots: { index: false } };

/** Printable order of play for the desk and notice board. Managers only; "Save as PDF" in the print dialog makes the PDF. */
export default async function PrintOrderOfPlay({ params }: { params: Promise<{ slug: string }> }) {
  const ev = await getEvent((await params).slug);
  if (!ev || !ev.canManage) notFound();
  const rows = ev.categories.flatMap((c) =>
    c.matches.filter((m) => m.at && m.courtId && !m.walkover && m.a !== BYE && m.b !== BYE).map((m) => ({ c, m })),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 print:max-w-none print:px-0 print:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/t/${ev.slug}?view=edit`} className="text-muted underline-offset-4 hover:underline">Back to editing</Link>
        <PrintButton />
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold print:mt-0">{ev.title}</h1>
      <p className="text-muted">
        Order of play. {ev.venue}{ev.area ? `, ${ev.area}` : ""}. First match {dateTime(ev.startsAt)}.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6">No matches are scheduled yet. Draw a category to fill this in.</p>
      ) : (
        ev.courts.map((court) => {
          const ms = rows.filter((r) => r.m.courtId === court.id).sort((x, y) => x.m.at!.localeCompare(y.m.at!));
          if (!ms.length) return null;
          return (
            <section key={court.id} className="mt-6 break-inside-avoid-page">
              <h2 className="border-b-2 border-ink pb-1 font-display text-2xl font-bold">{court.name}</h2>
              <table className="w-full text-left text-[15px]">
                <thead className="text-[13px] text-muted">
                  <tr>
                    <th className="w-20 py-1.5 font-medium">Time</th>
                    <th className="py-1.5 font-medium">Category</th>
                    <th className="py-1.5 font-medium">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {ms.map(({ c, m }) => (
                    <tr key={m.id} className="border-t border-line align-top">
                      <td className="tabular py-1.5 font-semibold">{time(m.at!)}</td>
                      <td className="py-1.5">{c.name}, {matchLabel(c, m).toLowerCase()}</td>
                      <td className="py-1.5">
                        {m.a ?? "To be decided"} <span className="text-muted">v</span> {m.b ?? "To be decided"}
                        {m.status === "done" && m.winner && <span className="text-muted"> (won by {m.winner})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}
