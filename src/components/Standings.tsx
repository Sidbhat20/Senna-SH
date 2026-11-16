import type { Row } from "@/lib/fixtures/standings";

/** League table. The top `qualify` rows get a turf bar to show who goes through. */
export function Standings({ rows, qualify = 0, caption }: { rows: Row[]; qualify?: number; caption?: string }) {
  return (
    <table className="w-full text-left text-[15px]">
      {caption && <caption className="mb-2 text-left font-display text-lg font-semibold">{caption}</caption>}
      <thead className="text-[13px] text-muted">
        <tr className="border-b border-line">
          <th className="py-2 pl-3 font-medium">Team</th>
          {["P", "W", "D", "L", "+/−", "Pts"].map((h) => (
            <th key={h} className="w-8 py-2 text-right font-medium last:w-10 last:pr-1">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r, i) => (
          <tr key={r.entry} className="border-b border-line/70">
            <td className={`max-w-0 truncate py-2 pl-3 ${i < qualify ? "border-l-4 border-turf pl-2" : ""}`}>
              <span className="mr-2 text-muted">{i + 1}</span>
              {r.entry}
            </td>
            <td className="text-right">{r.p}</td>
            <td className="text-right">{r.w}</td>
            <td className="text-right">{r.d}</td>
            <td className="text-right">{r.l}</td>
            <td className="text-right">{r.f - r.a > 0 ? `+${r.f - r.a}` : r.f - r.a}</td>
            <td className="pr-1 text-right font-display text-lg font-bold">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
