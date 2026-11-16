"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEvent } from "@/app/actions";
import { posterProblem, uploadPoster } from "@/lib/poster";
import { matchCount } from "@/lib/fixtures/count";
import {
  ageBound, ageFromName, entryShape, FORMATS, LAUNCH_SPORTS, scoreUnits, SPORT_DEFAULTS, SPORTS, type EntryType, type Format, type Sport,
} from "@/lib/sports";

const STEPS = ["Event", "Categories", "Courts", "Review"] as const;
const CLOSE = { "1d": ["1 day before", 1], "2d": ["2 days before", 2], "7d": ["1 week before", 7], custom: ["Pick a date", 0] } as const;
type Close = keyof typeof CLOSE;

type Cat = {
  key: number;
  name: string;
  format: Format;
  groupCount: number;
  entryType: EntryType;
  teamSize: string;
  maxEntries: string;
  entryFee: string; // kept as typed text so the field can be cleared and edited normally
  bestOf: 1 | 3 | 5;
  pointsTo: string;
  ageKind: "none" | "under" | "over";
  age: string;
};

type Draft = {
  title: string;
  sport: Sport | "";
  venue: string;
  area: string;
  startDate: string;
  startTime: string;
  categories: Cat[];
  courts: string;
  matchMinutes: string;
  breakMinutes: string;
  close: Close;
  ageCheck: "self" | "desk";
  closeDate: string;
  closeTime: string;
  prize: string;
  rules: string;
};

const EMPTY: Draft = {
  title: "", sport: "", venue: "", area: "", startDate: "", startTime: "08:00", categories: [], courts: "4",
  matchMinutes: "", breakMinutes: "5", close: "2d", ageCheck: "self", closeDate: "", closeTime: "21:00", prize: "", rules: "",
};

// All times are Bangalore time, whatever the organiser's device is set to.
const at = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00+05:30`) : null);
const startsAt = (d: Draft) => at(d.startDate, d.startTime);
function closesAt(d: Draft) {
  if (d.close === "custom") return at(d.closeDate, d.closeTime);
  const s = startsAt(d);
  return s ? new Date(+s - CLOSE[d.close][1] * 86_400_000) : null;
}
const int = (s: string) => (s.trim() === "" ? NaN : Number(s));
const fmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
});
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const enters = (c: Cat) => (c.entryType === "solo" ? "players" : c.entryType === "pair" ? "pairs" : "teams");
const ageText = (c: Cat) => (c.ageKind === "under" ? `under ${c.age}` : c.ageKind === "over" ? `${c.age} and over` : "");
/** "Knockout, up to 32 players, ₹500, best of 3 to 21, under 13" */
function describe(c: Cat, sport: Sport) {
  const parts = [
    FORMATS[c.format].label, `up to ${c.maxEntries || "?"} ${enters(c)}`,
    c.entryFee ? `₹${Number(c.entryFee).toLocaleString("en-IN")}` : "free",
    SPORT_DEFAULTS[sport].scoring.kind === "games" ? `best of ${c.bestOf} ${scoreUnits(sport).part}s to ${c.pointsTo}` : "",
    ageText(c),
  ];
  return parts.filter(Boolean).join(", ");
}
let nextKey = 1;

function validate(step: number, d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const s = startsAt(d);
  if (step === 0) {
    if (d.title.trim().length < 4) e.title = "Give it a name players will recognise, at least 4 characters.";
    if (!d.sport) e.sport = "Choose a sport.";
    if (!d.venue.trim()) e.venue = "Add the venue name.";
    if (!s) e.startDate = "Pick the day and the time of the first match.";
    else if (+s < Date.now()) e.startDate = "The first match must be in the future.";
  }
  if (step === 1) {
    if (!d.categories.length) e.categories = "Add at least one category.";
    const seen = new Set<string>();
    for (const c of d.categories) {
      const k = `cat${c.key}`;
      const max = int(c.maxEntries);
      const ts = int(c.teamSize);
      const fee = c.entryFee.trim() === "" ? 0 : int(c.entryFee);
      if (c.name.trim().length < 2) e[k] = "Give this category a name.";
      else if (seen.has(c.name.trim().toLowerCase())) e[k] = "Two categories have this name.";
      else if (!Number.isInteger(max) || max < 2 || max > 128) e[k] = "Allow between 2 and 128 entries.";
      else if (c.format === "groups_knockout" && max < c.groupCount * 2) e[k] = `${c.groupCount} groups need at least ${c.groupCount * 2} entries.`;
      else if (c.entryType === "team" && (!Number.isInteger(ts) || ts < 2 || ts > 30)) e[k] = "Teams need 2 to 30 players.";
      else if (!(int(c.pointsTo) >= 5 && int(c.pointsTo) <= 50)) e[k] = "Games are played to between 5 and 50 points.";
      else if (c.ageKind !== "none" && !(int(c.age) >= 5 && int(c.age) <= 90)) e[k] = "Set an age between 5 and 90.";
      else if (!Number.isInteger(fee) || fee < 0 || fee > 100000) e[k] = "Enter the fee in whole rupees, up to ₹1,00,000.";
      seen.add(c.name.trim().toLowerCase());
    }
  }
  if (step === 2) {
    const courts = int(d.courts);
    if (!Number.isInteger(courts) || courts < 1 || courts > 40) e.courts = "Use between 1 and 40 courts.";
    const mm = int(d.matchMinutes);
    if (!Number.isInteger(mm) || mm < 5 || mm > 240) e.matchMinutes = "A match takes between 5 and 240 minutes.";
    const c = closesAt(d);
    if (!c) e.close = "Pick when entries close.";
    else if (s && +c > +s) e.close = "Entries must close before the first match.";
    else if (+c < Date.now()) e.close = "That's already passed. Pick a later time.";
  }
  return e;
}

const box = "block w-full rounded-lg border border-line bg-white px-3 py-3 text-base outline-none focus:border-ink aria-[invalid=true]:border-danger";
const pill = (on: boolean) => `rounded-full border px-3 py-1 text-[14px] ${on ? "border-ink bg-ink text-chalk" : "border-line bg-white hover:border-ink"}`;

function Label({ text, hint, error, id, children }: { text: string; hint?: string; error?: string; id?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="font-medium">{text}</label>
      {hint && <p className="text-[14px] text-muted">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1.5 text-[14px] text-danger">{error}</p>}
    </div>
  );
}

/** Tappable options that behave like radio buttons (arrow keys, one tab stop). */
function Choice<T extends string | number>({
  name, value, options, onChange, cols = "", size = "md",
}: {
  name: string; value: T | ""; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void; cols?: string; size?: "md" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={name} className={`grid gap-2 ${cols}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={`relative cursor-pointer rounded-lg border-2 text-left has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-flood ${
              size === "sm" ? "px-3 py-2" : "px-4 py-3"
            } ${on ? "border-ink bg-ink text-chalk" : "border-line bg-white hover:border-ink"}`}
          >
            <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
            <span className={`block font-semibold ${size === "sm" ? "text-[15px]" : ""}`}>{o.label}</span>
            {o.sub && <span className={`mt-0.5 block text-[14px] ${on ? "text-chalk/75" : "text-muted"}`}>{o.sub}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Whole-number text field: digits only, so it can be cleared and retyped without the browser fighting back. */
function Digits({ id, value, onChange, prefix, suffix, invalid, placeholder, label }: {
  id?: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; invalid?: boolean; placeholder?: string; label?: string;
}) {
  return (
    <div className={`flex items-center rounded-lg border bg-white focus-within:border-ink ${invalid ? "border-danger" : "border-line"}`}>
      {prefix && <span className="pl-3 text-lg text-muted">{prefix}</span>}
      <input
        id={id} aria-label={label} inputMode="numeric" autoComplete="off" placeholder={placeholder} value={value} aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 6))}
        className="tabular w-full min-w-0 bg-transparent px-3 py-2.5 text-lg outline-none"
      />
      {suffix && <span className="pr-3 text-muted">{suffix}</span>}
    </div>
  );
}

function CategoryCard({ c, sport, open, error, onOpen, onChange, onRemove }: {
  c: Cat; sport: Sport; open: boolean; error?: string; onOpen: () => void; onChange: (c: Cat) => void; onRemove: () => void;
}) {
  const set = <K extends keyof Cat>(k: K, v: Cat[K]) => onChange({ ...c, [k]: v });
  const racquet = SPORT_DEFAULTS[sport].racquet;
  const scored = SPORT_DEFAULTS[sport].scoring.kind === "games"; // racquet sports, plus volleyball sets
  const u = scoreUnits(sport);
  if (!open) {
    return (
      <li className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 ${error ? "border-danger" : "border-line"}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-semibold">{c.name || "Unnamed category"}</div>
          <div className="text-[14px] text-muted">{describe(c, sport)}</div>
          {error && <div className="text-[14px] text-danger">{error}</div>}
        </div>
        <button type="button" onClick={onOpen} className="rounded-lg border border-ink px-3 py-1.5 font-semibold">Edit</button>
      </li>
    );
  }
  return (
    <li className="space-y-5 rounded-xl border-2 border-ink bg-white p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label text="Category name" id={`n${c.key}`}>
            <input id={`n${c.key}`} className={box} value={c.name} maxLength={60}
              onChange={(e) => {
                const name = e.target.value;
                const shape = entryShape(sport, name);
                const age = ageFromName(name);
                onChange({
                  ...c, name,
                  ...(racquet ? { entryType: shape.entryType, teamSize: String(shape.teamSize) } : {}),
                  ...(age.kind !== "none" ? { ageKind: age.kind, age: String(age.age) } : {}),
                });
              }} />
          </Label>
        </div>
        <button type="button" onClick={onRemove} className="h-12 rounded-lg px-3 text-danger hover:bg-danger/10">Remove</button>
      </div>
      <Label text="Format">
        <Choice name={`Format for ${c.name}`} value={c.format} onChange={(v) => set("format", v)} size="sm" cols="grid-cols-2"
          options={(Object.keys(FORMATS) as Format[]).map((f) => ({ value: f, label: FORMATS[f].label }))} />
      </Label>
      {c.format === "groups_knockout" && (
        <Label text="Groups" hint="The top two of each group go into the knockout.">
          <Choice name={`Groups for ${c.name}`} value={c.groupCount} onChange={(v) => set("groupCount", v)} size="sm" cols="grid-cols-4 max-w-xs"
            options={[2, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))} />
        </Label>
      )}
      <Label text="Who enters">
        <Choice<EntryType> name={`Who enters ${c.name}`} value={c.entryType} size="sm" cols="grid-cols-3"
          onChange={(v) => onChange({ ...c, entryType: v, teamSize: v === "pair" ? "2" : v === "solo" ? "1" : String(SPORT_DEFAULTS[sport].teamSize) })}
          options={[
            { value: "solo", label: "Players", sub: "Singles" },
            { value: "pair", label: "Pairs", sub: "One player registers both" },
            { value: "team", label: "Teams", sub: "Captain and roster" },
          ]} />
      </Label>
      <div className="grid gap-5 sm:grid-cols-3">
        <Label text={`Most ${enters(c)}`}>
          <Digits label={`Most ${enters(c)} in ${c.name}`} value={c.maxEntries} onChange={(v) => set("maxEntries", v)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["8", "16", "32", "64"].map((n) => (
              <button key={n} type="button" onClick={() => set("maxEntries", n)} className={pill(c.maxEntries === n)}>{n}</button>
            ))}
          </div>
        </Label>
        <Label text={`Fee per ${c.entryType === "solo" ? "player" : enters(c).slice(0, -1)}`}>
          <Digits label={`Entry fee for ${c.name}`} prefix="₹" placeholder="Free" value={c.entryFee} onChange={(v) => set("entryFee", v)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[["", "Free"], ["300", "300"], ["500", "500"], ["1000", "1,000"]].map(([v, l]) => (
              <button key={l} type="button" onClick={() => set("entryFee", v)} className={pill(c.entryFee === v)}>{l}</button>
            ))}
          </div>
        </Label>
        {c.entryType === "team" && (
          <Label text="Players per team" hint="Including substitutes.">
            <Digits label={`Players per team in ${c.name}`} value={c.teamSize} onChange={(v) => set("teamSize", v)} />
          </Label>
        )}
      </div>
      {scored && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Label text={`${u.part === "set" ? "Sets" : "Games"} per match`}>
            <Choice<1 | 3 | 5> name={`Games per match in ${c.name}`} value={c.bestOf} size="sm" cols="grid-cols-3"
              onChange={(v) => set("bestOf", v)}
              options={[{ value: 1, label: `1 ${u.part}` }, { value: 3, label: "Best of 3" }, { value: 5, label: "Best of 5" }]} />
          </Label>
          <Label text={`${u.point === "game" ? "Games" : "Points"} per ${u.part}`}
            hint={sport === "badminton" ? "Win by 2, capped at 9 over (21 caps at 30)."
              : sport === "tennis" ? "Win by 2 games; 6-6 goes to a tiebreak, entered as 7-6."
              : sport === "volleyball" ? "Win by 2. Every set is played to this score." : "Win by 2."}>
            <div className="flex flex-wrap items-center gap-1.5">
              {(sport === "tennis" ? ["4", "6"] : sport === "volleyball" ? ["15", "21", "25"] : ["11", "15", "21"]).map((n) => (
                <button key={n} type="button" onClick={() => set("pointsTo", n)} className={pill(c.pointsTo === n)}>{n}</button>
              ))}
              <div className="w-24"><Digits label={`Points per game in ${c.name}`} value={c.pointsTo} onChange={(v) => set("pointsTo", v)} /></div>
            </div>
          </Label>
        </div>
      )}
      <Label text="Age limit" hint="Checked against date of birth on the day of the first match.">
        <div className="flex flex-wrap items-center gap-2">
          <Choice<"none" | "under" | "over"> name={`Age limit for ${c.name}`} value={c.ageKind} size="sm" cols="grid-cols-3 flex-1 min-w-64"
            onChange={(v) => set("ageKind", v)}
            options={[{ value: "none", label: "Open to all" }, { value: "under", label: "Under…" }, { value: "over", label: "…and over" }]} />
          {c.ageKind !== "none" && (
            <div className="w-24"><Digits label={`Age for ${c.name}`} suffix="yrs" value={c.age} onChange={(v) => set("age", v)} /></div>
          )}
        </div>
      </Label>
      {error && <p className="text-[14px] text-danger">{error}</p>}
    </li>
  );
}

export function Wizard() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [openCat, setOpenCat] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [publishError, setPublishError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [poster, setPoster] = useState<{ file: File; preview: string } | null>(null);
  const [posterError, setPosterError] = useState("");
  const choosePoster = (f?: File) => {
    if (!f) return;
    const problem = posterProblem(f);
    setPosterError(problem ?? "");
    if (!problem) setPoster({ file: f, preview: URL.createObjectURL(f) });
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const sport = d.sport || "badminton";

  const addCategory = (name: string) => {
    const shape = entryShape(sport, name);
    const sc = SPORT_DEFAULTS[sport].scoring;
    const age = ageFromName(name);
    const c: Cat = {
      key: nextKey++, name, format: "knockout", groupCount: 4, entryType: shape.entryType, teamSize: String(shape.teamSize),
      maxEntries: SPORT_DEFAULTS[sport].racquet ? "32" : "16", entryFee: "",
      bestOf: sc.kind === "games" ? sc.bestOf : 1, pointsTo: String(sc.kind === "games" ? sc.pointsTo : 21),
      ageKind: age.kind, age: age.age ? String(age.age) : "",
    };
    setD((x) => ({ ...x, categories: [...x.categories, c] }));
    setOpenCat(c.key);
  };
  const updateCat = (c: Cat) => setD((x) => ({ ...x, categories: x.categories.map((y) => (y.key === c.key ? c : y)) }));
  const removeCat = (key: number) => setD((x) => ({ ...x, categories: x.categories.filter((y) => y.key !== key) }));

  const next = () => {
    const e = validate(step, d);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step === 0 && !d.matchMinutes) set("matchMinutes", String(SPORT_DEFAULTS[sport].matchMinutes));
    if (step === 1) setOpenCat(null);
    setStep((s) => s + 1);
  };

  // On success the action redirects to the new event page; it only returns on error.
  const publish = () =>
    startTransition(async () => {
      setPublishError("");
      const res = await createEvent({
        title: d.title, sport: d.sport, venue: d.venue, area: d.area, prize: d.prize, rules: d.rules,
        startsAt: startsAt(d)!.toISOString(), regClosesAt: closesAt(d)!.toISOString(),
        courts: int(d.courts), matchMinutes: int(d.matchMinutes), breakMinutes: int(d.breakMinutes) || 0,
        ageCheck: d.ageCheck,
        categories: d.categories.map((c) => ({
          name: c.name.trim(), format: c.format, groupCount: c.groupCount, entryType: c.entryType,
          teamSize: int(c.teamSize) || 1, maxEntries: int(c.maxEntries), entryFee: c.entryFee ? int(c.entryFee) : 0,
          bestOf: c.bestOf, pointsTo: int(c.pointsTo),
          bornOnOrAfter: c.ageKind === "under" ? ageBound("under", int(c.age), d.startDate) : null,
          bornOnOrBefore: c.ageKind === "over" ? ageBound("over", int(c.age), d.startDate) : null,
        })),
      });
      if (res?.error || !res?.slug || !res.id) return setPublishError(res?.error ?? "Couldn't publish. Try again.");
      // The event exists now; a failed poster upload shouldn't lose it. It can be added again from the event page.
      if (poster) await uploadPoster(res.id, poster.file);
      router.push(`/t/${res.slug}`);
    });

  const totalMatches = d.categories.reduce((s, c) => s + matchCount(c.format, int(c.maxEntries) || 0, c.groupCount), 0);
  const slot = (int(d.matchMinutes) || 0) + (int(d.breakMinutes) || 0);
  const courts = int(d.courts) || 0;
  const c = closesAt(d);
  const today = new Date().toISOString().slice(0, 10);
  const unused = SPORT_DEFAULTS[sport].categories.filter((n) => !d.categories.some((x) => x.name === n));

  return (
    <div>
      <ol className="flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={`flex-1 border-t-4 pt-2 text-[14px] font-medium ${i <= step ? "border-turf text-ink" : "border-line text-muted"}`}>
            <span className="tabular mr-1">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <form
        className="mt-8 space-y-7"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else publish();
        }}
      >
        {step === 0 && (
          <>
            <Label text="Tournament name" error={errors.title} id="title">
              <input id="title" className={box} value={d.title} onChange={(e) => set("title", e.target.value)}
                placeholder="Whitefield Badminton Open" aria-invalid={!!errors.title} maxLength={120} />
            </Label>
            <Label text="Sport" error={errors.sport}>
              <Choice name="Sport" value={d.sport} size="sm" cols="grid-cols-2 sm:grid-cols-4"
                onChange={(v) => setD((x) => ({ ...x, sport: v, categories: v === x.sport ? x.categories : [] }))}
                options={LAUNCH_SPORTS.map((s) => ({ value: s, label: SPORTS[s] }))} />
            </Label>
            <div className="grid gap-5 sm:grid-cols-2">
              <Label text="Venue" error={errors.venue} id="venue">
                <input id="venue" className={box} value={d.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Smash Arena" aria-invalid={!!errors.venue} />
              </Label>
              <Label text="Area" id="area" hint="Helps players nearby find it.">
                <input id="area" className={box} value={d.area} onChange={(e) => set("area", e.target.value)} placeholder="Whitefield, ITPL Main Road" />
              </Label>
            </div>
            <Label text="First match" error={errors.startDate} id="startDate">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input id="startDate" type="date" min={today} className={box} value={d.startDate}
                  onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!errors.startDate} />
                <input type="time" aria-label="Start time" step={900} className={box} value={d.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </div>
            </Label>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h2 className="font-display text-2xl font-bold">Categories</h2>
              <p className="text-muted">Each category is its own draw with its own entries, fee and bracket.</p>
            </div>
            {d.categories.length > 0 && (
              <ul className="space-y-3">
                {d.categories.map((cat) => (
                  <CategoryCard key={cat.key} c={cat} sport={sport} open={openCat === cat.key} error={errors[`cat${cat.key}`]}
                    onOpen={() => setOpenCat(cat.key)} onChange={updateCat} onRemove={() => removeCat(cat.key)} />
                ))}
              </ul>
            )}
            <div>
              <p className="font-medium">{d.categories.length ? "Add another" : "Add a category"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unused.map((n) => (
                  <button key={n} type="button" onClick={() => addCategory(n)} className={pill(false)}>+ {n}</button>
                ))}
                <button type="button" onClick={() => addCategory("")} className="rounded-full border border-dashed border-ink px-3 py-1 text-[14px]">
                  + Your own
                </button>
              </div>
              {errors.categories && <p className="mt-2 text-[14px] text-danger">{errors.categories}</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-5 sm:grid-cols-3">
              <Label text="Courts" error={errors.courts}>
                <Digits label="Number of courts" value={d.courts} onChange={(v) => set("courts", v)} invalid={!!errors.courts} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["1", "2", "4", "6", "8"].map((n) => (
                    <button key={n} type="button" onClick={() => set("courts", n)} className={pill(d.courts === n)}>{n}</button>
                  ))}
                </div>
              </Label>
              <Label text="One match takes" error={errors.matchMinutes}>
                <Digits label="Match length in minutes" suffix="min" value={d.matchMinutes} onChange={(v) => set("matchMinutes", v)} invalid={!!errors.matchMinutes} />
              </Label>
              <Label text="Break between matches">
                <Digits label="Break in minutes" suffix="min" placeholder="0" value={d.breakMinutes} onChange={(v) => set("breakMinutes", v)} />
              </Label>
            </div>
            {totalMatches > 0 && courts > 0 && slot > 0 && (
              <p className="rounded-lg bg-line/50 px-4 py-3 text-[15px]" aria-live="polite">
                If every category fills, that&apos;s <strong className="tabular">{totalMatches} matches</strong>, about{" "}
                <strong>{hours(Math.ceil(totalMatches / courts) * slot)}</strong> of play on {courts} {courts === 1 ? "court" : "courts"}.
              </p>
            )}
            {d.categories.some((x) => x.ageKind !== "none") && (
              <Label text="How do you check ages?">
                <Choice<"self" | "desk"> name="Age check" value={d.ageCheck} onChange={(v) => set("ageCheck", v)} cols="sm:grid-cols-2"
                  options={[
                    { value: "self", label: "Players declare it", sub: "Date of birth at registration; the app blocks anyone outside the limit" },
                    { value: "desk", label: "We check ID at the desk", sub: "Players still declare it; your desk ticks ID checked at check-in" },
                  ]} />
              </Label>
            )}
            <Label text="Entries close" error={errors.close}>
              <Choice name="Entries close" value={d.close} onChange={(v) => set("close", v)} size="sm" cols="grid-cols-2 sm:grid-cols-4"
                options={(Object.keys(CLOSE) as Close[]).map((k) => ({ value: k, label: CLOSE[k][0] }))} />
              {d.close === "custom" && (
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <input type="date" aria-label="Closing date" min={today} max={d.startDate || undefined} className={box}
                    value={d.closeDate} onChange={(e) => set("closeDate", e.target.value)} />
                  <input type="time" aria-label="Closing time" step={900} className={box} value={d.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
                </div>
              )}
              {c && !errors.close && <p className="mt-2 text-[14px] text-muted">Closes {fmt.format(c)}.</p>}
            </Label>
          </>
        )}

        {step === 3 && (
          <>
            <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-line bg-white p-5 sm:grid-cols-2">
              {[
                ["Name", d.title],
                ["Sport", d.sport ? SPORTS[d.sport] : ""],
                ["Venue", [d.venue, d.area].filter(Boolean).join(", ")],
                ["First match", startsAt(d) ? fmt.format(startsAt(d)!) : ""],
                ["Courts", `${d.courts}, ${d.matchMinutes} min matches`],
                ["Entries close", c ? fmt.format(c) : ""],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              <div className="sm:col-span-2">
                <dt className="text-[13px] text-muted">Categories</dt>
                <dd>
                  <ul className="mt-1 space-y-0.5">
                    {d.categories.map((x) => (
                      <li key={x.key}>
                        <span className="font-medium">{x.name}</span>
                        <span className="text-muted">, {describe(x, sport).toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
            <Label text="Poster" id="poster" hint="Optional. JPG, PNG or WebP under 5 MB. Players see it on the tournament page." error={posterError}>
              <div className="flex items-start gap-4">
                {poster && (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimisable
                  <img src={poster.preview} alt="Poster preview" className="h-40 w-auto rounded-lg border border-line object-cover" />
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-ink bg-white px-4 py-2.5 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-flood">
                    <input id="poster" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => choosePoster(e.target.files?.[0])} />
                    {poster ? "Choose another" : "Choose an image"}
                  </label>
                  {poster && (
                    <button type="button" onClick={() => setPoster(null)} className="self-start text-[15px] text-danger underline-offset-4 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </Label>
            <Label text="Prizes" id="prize" hint="Optional. Shown on the tournament page.">
              <input id="prize" className={box} value={d.prize} maxLength={200} onChange={(e) => set("prize", e.target.value)} placeholder="Trophies and ₹25,000 across categories" />
            </Label>
            <Label text="Rules" id="rules" hint="One per line. Players see these before they register.">
              <textarea id="rules" rows={4} className={box} value={d.rules} onChange={(e) => set("rules", e.target.value)}
                placeholder={"Best of three games to 21.\nReport 15 minutes before your match."} />
            </Label>
          </>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="h-12 rounded-lg border border-ink px-5 font-semibold">Back</button>
          )}
          <button type="submit" disabled={pending}
            className="h-12 flex-1 rounded-lg bg-turf px-6 font-semibold text-white hover:bg-turf-dark disabled:opacity-60 sm:flex-none">
            {step < STEPS.length - 1 ? `Next: ${STEPS[step + 1]}` : pending ? "Publishing…" : "Publish tournament"}
          </button>
        </div>
        {publishError && <p role="alert" className="text-[15px] text-danger">{publishError}</p>}
      </form>
    </div>
  );
}
