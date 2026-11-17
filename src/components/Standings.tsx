import type { Row } from "@/lib/fixtures/standings";

/** League table. The top `qualify` rows are marked Q and a floodlight rule shows the cut. */
export function Standings({ rows, qualify = 0, caption }: { rows: Row[]; qualify?: number; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-[6px] border border-line bg-surface">
      <table className="w-full min-w-[22rem] text-left text-[15px]">
        {caption && <caption className="px-3 pt-3 pb-2 text-left font-display text-xl font-bold">{caption}</caption>}
        <thead className="sticky top-0 bg-surface-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
          <tr>
            <th scope="col" className="py-2 pl-3">Team</th>
            {["P", "W", "D", "L", "+/−", "Pts"].map((h) => (
              <th key={h} scope="col" className="w-9 py-2 text-right last:w-12 last:pr-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="font-score">
          {rows.map((r, i) => (
            <tr key={r.entry} className={i === qualify - 1 && i < rows.length - 1 ? "border-b-2 border-flood" : "border-b border-line last:border-0"}>
              <td className="max-w-0 truncate py-2.5 pl-3 font-sans">
                <span className="font-score mr-2 text-muted">{i + 1}</span>
                {r.entry}
                {i < qualify && <span className="ml-2 rounded bg-turf-soft px-1 font-score text-[11px] font-bold text-turf" title="Goes through">Q<span className="sr-only">, goes through</span></span>}
              </td>
              <td className="text-right">{r.p}</td>
              <td className="text-right">{r.w}</td>
              <td className="text-right">{r.d}</td>
              <td className="text-right">{r.l}</td>
              <td className="text-right">{r.f - r.a > 0 ? `+${r.f - r.a}` : r.f - r.a}</td>
              <td className="pr-3 text-right text-lg font-bold">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
