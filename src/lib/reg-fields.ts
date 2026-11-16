// Custom registration questions (P1.3). Stored on events.reg_fields; answers on entries.answers (managers only).

export type RegField = { key: string; label: string; type: "text" | "date" | "choice"; options?: string[]; required: boolean };

/** A stable key from a label ("T-shirt size" -> "t_shirt_size"), unique among the event's other questions. */
export function fieldKey(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 26) || "question";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/** Answers from a submitted form, where each question's input is named q_<key>. The database checks them. */
export function answersFrom(fields: RegField[], get: (name: string) => unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = String(get(`q_${f.key}`) ?? "").trim();
    if (v) out[f.key] = v.slice(0, 200);
  }
  return out;
}
