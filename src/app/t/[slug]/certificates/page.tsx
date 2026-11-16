import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { date, sportName } from "@/components/ui";
import { getEvent } from "@/lib/data";
import { placeName, placings } from "@/lib/results";
import { PrintButton } from "../print/PrintButton";

export const metadata: Metadata = { title: "Certificates", robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> };

/** One certificate per sheet for each placed entry in a finished category. Print, or save as PDF from the dialog. */
export default async function Certificates({ params, searchParams }: Props) {
  const [{ slug }, { c: catId }] = await Promise.all([params, searchParams]);
  const ev = await getEvent(slug);
  const c = ev?.categories.find((x) => x.id === catId);
  if (!ev || !c || c.status !== "completed") notFound();
  const results = placings(c);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/t/${ev.slug}?c=${c.id}`} className="text-muted underline-offset-4 hover:underline">Back to {c.name}</Link>
        <PrintButton />
      </div>
      {results.map((r) => (
        <article key={`${r.place}-${r.name}`}
          className="mt-8 flex min-h-[60vh] flex-col items-center justify-center rounded-xl border-4 border-double border-pitch p-10 text-center print:mt-0 print:min-h-screen print:break-after-page print:rounded-none">
          <p className="font-display text-xl font-semibold tracking-wide text-turf-dark">Certificate of achievement</p>
          <p className="mt-8 text-lg text-muted">This certifies that</p>
          <p className="mt-2 font-display text-5xl font-bold">{r.name}</p>
          <p className="mt-6 text-lg">
            finished <strong>{placeName(r.place, results.filter((x) => x.place === r.place).length > 1).toLowerCase()}</strong> in {c.name}
          </p>
          <p className="mt-1 text-lg">at {ev.title}, {sportName(ev)}</p>
          <p className="mt-1 text-muted">{ev.venue}{ev.area ? `, ${ev.area}` : ""}, {date(ev.startsAt)}</p>
          <p className="mt-12 border-t border-ink px-10 pt-2 text-[15px]">{ev.organiser}, organiser</p>
        </article>
      ))}
    </div>
  );
}
