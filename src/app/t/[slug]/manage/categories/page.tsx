import { addCategory, setCategoryStatus, updateCategory } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { RowEditor } from "@/components/RowEditor";
import { FORMATS, getEvent } from "@/lib/data";

const STATUS_TEXT: Record<string, string> = {
  open: "Taking entries", locked: "Entries closed", live: "Being played", completed: "Finished", cancelled: "Cancelled", draft: "Draft",
};
const WHO: Record<string, string> = { solo: "Singles", pair: "Pairs", team: "Teams" };
const box = "line-input";
const btn = "h-11 rounded-full px-4 text-[15px] font-semibold disabled:opacity-60";

export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  const canAdd = ev.status === "open" || ev.status === "locked";
  return (
    <div className="space-y-10">
      <section aria-labelledby="cats">
        <h2 id="cats" className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Categories</h2>
        <p className="max-w-prose text-muted">
          Name, fee and entry limit can change until a category&apos;s fixtures are drawn. Format and who enters stay as published.
          The fee is fixed once someone has paid.
        </p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {ev.categories.map((c) => {
            const editable = c.matches.length === 0 && c.status !== "cancelled" && c.status !== "completed";
            return (
              <li key={c.id} className="py-3">
                <RowEditor
                  head={<>
                    <div className="font-semibold">{c.name}</div>
                    <div className="tabular text-[14px] text-muted">
                      {FORMATS[c.format].label}, {WHO[c.entryType]} · {c.entryFee ? `₹${c.entryFee.toLocaleString("en-IN")}` : "Free"} · {c.entryCount} of {c.maxEntries} entered · {STATUS_TEXT[c.status]}
                    </div>
                  </>}
                  actions={<>
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
                  </>}
                  panel={editable ? (
                    <ActionForm action={updateCategory} values={{ category: c.id, slug: ev.slug }} showOk className="max-w-2xl">
                      <div className="grid w-full gap-3 rounded-[6px] border border-line bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                        <label><span className="text-[13px] text-muted">Name</span>
                          <input name="name" defaultValue={c.name} required minLength={2} maxLength={60} className={box} /></label>
                        <label><span className="text-[13px] text-muted">Fee (₹, 0 = free)</span>
                          <input name="fee" inputMode="numeric" defaultValue={c.entryFee} className={box} /></label>
                        <label><span className="text-[13px] text-muted">Max entries</span>
                          <input name="max" inputMode="numeric" defaultValue={c.maxEntries} className={box} /></label>
                        <button className={`${btn} bg-ink text-on-ink`}>Save</button>
                      </div>
                    </ActionForm>
                  ) : undefined}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {canAdd && (
        <section aria-labelledby="add" className="max-w-2xl">
          <h2 id="add" className="font-display text-2xl font-extrabold">Add a category</h2>
          <p className="text-muted">It opens for entries straight away, with the event&apos;s closing time.</p>
          <ActionForm action={addCategory} values={{ event: ev.id, slug: ev.slug, sport: ev.sport }} showOk className="mt-3">
            <div className="grid w-full gap-3 rounded-[6px] border border-line bg-surface p-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="block text-[14px] text-muted">Name</span>
                <input name="name" required minLength={2} maxLength={60} placeholder="e.g. Women's Doubles" className={box} /></label>
              <label><span className="block text-[14px] text-muted">Format</span>
                <select name="format" className={box} defaultValue="knockout">
                  {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select></label>
              <label><span className="block text-[14px] text-muted">Who enters</span>
                <select name="entry_type" className={box} defaultValue="solo">
                  <option value="solo">Singles</option><option value="pair">Pairs</option><option value="team">Teams</option>
                </select></label>
              <label><span className="block text-[14px] text-muted">Max entries</span>
                <input name="max" inputMode="numeric" defaultValue={16} required className={box} /></label>
              <label><span className="block text-[14px] text-muted">Fee (₹, 0 for free)</span>
                <input name="fee" inputMode="numeric" defaultValue={0} required className={box} /></label>
              <label><span className="block text-[14px] text-muted">Groups</span><span className="block text-[13px] text-muted">Groups + knockout only</span>
                <input name="groups" inputMode="numeric" defaultValue={4} className={box} /></label>
              <label><span className="block text-[14px] text-muted">Players per team</span><span className="block text-[13px] text-muted">Teams only</span>
                <input name="team_size" inputMode="numeric" defaultValue={2} className={box} /></label>
              <button className="h-11 rounded-lg chunky press bg-turf px-4 font-semibold text-on-turf hover:bg-turf-dark disabled:opacity-60 sm:col-span-2">Add category</button>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
