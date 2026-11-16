// Smart Create (organiser UX brief, P1.3): what a tournament poster gave us, cleaned up for the create wizard.
// The model's output is untrusted: every field is checked here with the wizard's own rules, and anything doubtful is
// dropped rather than guessed. Nothing here publishes: the organiser reviews every field in the wizard first.
import { FORMATS, SPORTS, type EntryType, type Format, type Sport } from "./sports";

export type DraftCategory = { name: string; format: Format | null; entryType: EntryType | null; entryFee: number | null; maxEntries: number | null };
export type PosterDraft = {
  title: string; sport: Sport | ""; venue: string; area: string; startDate: string; startTime: string;
  prize: string; rules: string[]; categories: DraftCategory[];
};

export const EMPTY_DRAFT: PosterDraft = { title: "", sport: "", venue: "", area: "", startDate: "", startTime: "", prize: "", rules: [], categories: [] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const whole = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[₹,\s]/g, "")) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function realDate(v: unknown) {
  const s = text(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(+d) && d.toISOString().slice(0, 10) === s ? s : "";
}
const clock = (v: unknown) => {
  const s = text(v, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : "";
};

/** Untrusted model output in, a draft the wizard can show out. Never throws. */
export function toDraft(raw: unknown): PosterDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_DRAFT;
  const r = raw as Record<string, unknown>;
  const sport = text(r.sport, 30).toLowerCase().replace(/[\s-]+/g, "_");
  const cats = Array.isArray(r.categories) ? r.categories.slice(0, 30) : [];
  const seen = new Set<string>();
  return {
    title: text(r.title, 120),
    sport: sport in SPORTS ? (sport as Sport) : "",
    venue: text(r.venue, 120),
    area: text(r.area, 120),
    startDate: realDate(r.start_date),
    startTime: clock(r.start_time),
    prize: text(r.prize, 200),
    rules: (Array.isArray(r.rules) ? r.rules : []).map((x) => text(x, 200)).filter(Boolean).slice(0, 30),
    categories: cats.flatMap((c): DraftCategory[] => {
      if (!c || typeof c !== "object") return [];
      const o = c as Record<string, unknown>;
      const name = text(o.name, 60);
      if (name.length < 2 || seen.has(name.toLowerCase())) return [];
      seen.add(name.toLowerCase());
      const format = text(o.format, 30);
      const who = text(o.entry_type, 10);
      return [{
        name,
        format: format in FORMATS ? (format as Format) : null,
        entryType: who === "solo" || who === "pair" || who === "team" ? who : null,
        entryFee: whole(o.entry_fee, 0, 1_000_000),
        maxEntries: whole(o.max_entries, 2, 128),
      }];
    }),
  };
}

/** True when the poster gave us nothing worth showing; the organiser then just fills in the wizard. */
export const isEmptyDraft = (d: PosterDraft) => !d.title && !d.venue && !d.startDate && d.categories.length === 0;
