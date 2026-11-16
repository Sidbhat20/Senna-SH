import { addCategory, setCategoryStatus, updateCategory } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FORMATS, getEvent } from "@/lib/data";

const STATUS_TEXT: Record<string, string> = {
  open: "Taking entries", locked: "Entries closed", live: "Being played", completed: "Finished", cancelled: "Cancelled", draft: "Draft",
};
const WHO: Record<string, string> = { solo: "Singles", pair: "Pairs", team: "Teams" };
const box = "block w-full rounded-lg border border-line bg-white px-3 py-2 focus:border-ink focus:outline-none";
const btn = "h-10 rounded-lg px-3 text-[15px] font-semibold disabled:opacity-60";

export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  const canAdd = ev.status === "open" || ev.status === "locked";
  return (
    <div className="space-y-10">
      <section aria-labelledby="cats">
        <h2 id="cats" className="font-display text-3xl font-bold">Categories</h2>
        <p className="max-w-prose text-muted">
          Name, fee and entry limit can change until a category&apos;s fixtures are drawn. Format and who enters stay as published.
          The fee is fixed once someone has paid.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-[15px]">
            <thead className="border-b-2 border-ink text-[13px] text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                <th scope="col" className="py-2 pr-3 font-medium">Format</th>
                <th scope="col" className="py-2 pr-3 font-medium">Fee</th>
                <th scope="col" className="py-2 pr-3 font-medium">Entries</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ev.categories.map((c) => {
                const editable = c.matches.length === 0 && c.status !== "cancelled" && c.status !== "completed";
                return (
                  <tr key={c.id} className="align-top">
                    <td className="py-3 pr-3 font-semibold">{c.name}</td>
                    <td className="py-3 pr-3">{FORMATS[c.format].label}, {WHO[c.entryType]}</td>
                    <td className="tabular py-3 pr-3">{c.entryFee ? `₹${c.entryFee.toLocaleString("en-IN")}` : "Free"}</td>
                    <td className="tabular py-3 pr-3">{c.entryCount} of {c.maxEntries}</td>
                    <td className="py-3 pr-3">{STATUS_TEXT[c.status]}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {editable && (
                          <details className="group w-full text-right">
                            <summary className={`${btn} inline-flex cursor-pointer items-center border border-ink`}>Edit</summary>
                            <ActionForm action={updateCategory} values={{ category: c.id, slug: ev.slug }} showOk className="mt-2 gap-y-2 rounded-lg border border-line bg-white p-3 text-left">
                              <label className="w-full"><span className="text-[13px] text-muted">Name</span>
                                <input name="name" defaultValue={c.name} required minLength={2} maxLength={60} className={box} /></label>
                              <label className="flex-1"><span className="text-[13px] text-muted">Fee (₹, 0 for free)</span>
                                <input name="fee" inputMode="numeric" defaultValue={c.entryFee} className={box} /></label>
                              <label className="flex-1"><span className="text-[13px] text-muted">Max entries</span>
                                <input name="max" inputMode="numeric" defaultValue={c.maxEntries} className={box} /></label>
                              <button className={`${btn} mt-2 w-full bg-ink text-chalk`}>Save {c.name}</button>
                            </ActionForm>
                          </details>
                        )}
                        {c.status === "open" && (
                          <ActionForm action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "locked" }}>
                            <button className={`${btn} border border-line hover:border-ink`}>Close entries</button>
                          </ActionForm>
                        )}
                        {c.status === "locked" && c.matches.length === 0 && (
                          <ActionForm action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "open" }}>
                            <button className={`${btn} border border-line hover:border-ink`}>Reopen</button>
                          </ActionForm>
                        )}
                        {["open", "locked", "live"].includes(c.status) && (
                          <ConfirmAction action={setCategoryStatus} values={{ category: c.id, slug: ev.slug, status: "cancelled" }}
                            trigger="Cancel" triggerClassName={`${btn} text-danger hover:bg-danger/10`} confirmLabel={`Cancel ${c.name}`}
                            title={`Cancel ${c.name}?`} body="Players see it as cancelled and no more matches can be scored. Entries and results are kept." />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canAdd && (
        <section aria-labelledby="add" className="max-w-2xl">
          <h2 id="add" className="font-display text-2xl font-bold">Add a category</h2>
          <p className="text-muted">It opens for entries straight away, with the event&apos;s closing time.</p>
          <ActionForm action={addCategory} values={{ event: ev.id, slug: ev.slug, sport: ev.sport }} showOk className="mt-3">
            <div className="grid w-full gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="font-medium">Name</span>
                <input name="name" required minLength={2} maxLength={60} placeholder="e.g. Women's Doubles" className={box} /></label>
              <label><span className="font-medium">Format</span>
                <select name="format" className={box} defaultValue="knockout">
                  {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select></label>
              <label><span className="font-medium">Who enters</span>
                <select name="entry_type" className={box} defaultValue="solo">
                  <option value="solo">Singles</option><option value="pair">Pairs</option><option value="team">Teams</option>
                </select></label>
              <label><span className="font-medium">Max entries</span>
                <input name="max" inputMode="numeric" defaultValue={16} required className={box} /></label>
              <label><span className="font-medium">Fee (₹, 0 for free)</span>
                <input name="fee" inputMode="numeric" defaultValue={0} required className={box} /></label>
              <label><span className="font-medium">Groups</span><span className="block text-[13px] text-muted">Groups + knockout only</span>
                <input name="groups" inputMode="numeric" defaultValue={4} className={box} /></label>
              <label><span className="font-medium">Players per team</span><span className="block text-[13px] text-muted">Teams only</span>
                <input name="team_size" inputMode="numeric" defaultValue={2} className={box} /></label>
              <button className="h-11 rounded-lg bg-turf px-4 font-semibold text-white hover:bg-turf-dark disabled:opacity-60 sm:col-span-2">Add category</button>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
