import { getEvent } from "@/lib/data";
import { AddEntriesForm, ImportEntriesForm } from "../../Panels";
import { EntriesTable, type Row } from "./EntriesTable";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> };

export default async function EntriesPage({ params, searchParams }: Props) {
  const ev = (await getEvent((await params).slug))!;
  const { c: catId } = await searchParams;
  const cat = ev.categories.find((c) => c.id === catId);
  const cats = cat ? [cat] : ev.categories;
  const rows: Row[] = cats.flatMap((c) => c.entryRows.filter((e) => e.status !== "withdrawn").map((e) => ({
    id: e.id, name: e.name, club: e.club, category: c.name, source: e.source, status: e.status, payment: e.paymentStatus, seed: e.seed,
  })));
  const field = "line-input w-auto min-w-48 text-[15px]";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Entries</h2>
          <p className="text-muted">{rows.length} {rows.length === 1 ? "entry" : "entries"}{cat ? ` in ${cat.name}` : ""}. Withdrawn entries are left out.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex items-end gap-3">
            <select name="c" defaultValue={cat?.id ?? ""} aria-label="Category" className={field}>
              <option value="">All categories</option>
              {ev.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="h-11 rounded-full bg-ink px-5 font-semibold text-on-ink press">Show</button>
          </form>
          <a href={`/t/${ev.slug}/export/entries`} download className="inline-flex h-11 items-center rounded-lg border border-ink px-3 font-semibold">Download all</a>
        </div>
      </div>

      {rows.length ? (
        <EntriesTable rows={rows} slug={ev.slug} drawn={cats.some((c) => c.matches.length > 0)} />
      ) : (
        <p className="text-muted">No entries yet. Share the event page, or add walk-ins below.</p>
      )}

      {cat ? (
        cat.status === "open" ? (
          <section aria-labelledby="add" className="grid gap-8 lg:grid-cols-2">
            <h3 id="add" className="sr-only">Add entries to {cat.name}</h3>
            <AddEntriesForm category={cat.id} slug={ev.slug} team={cat.entryType === "team"} />
            <ImportEntriesForm category={cat.id} slug={ev.slug} />
          </section>
        ) : (
          <p className="text-[15px] text-muted">Entries are closed for {cat.name}. Reopen them in Categories to add walk-ins.</p>
        )
      ) : (
        <p className="text-[15px] text-muted">Pick a category above to add walk-ins or import a spreadsheet. Seeds are set on each category&apos;s page.</p>
      )}
    </div>
  );
}
