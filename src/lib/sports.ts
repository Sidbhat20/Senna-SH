// Shared by server and client code, so no server imports here.
export const SPORTS = {
  badminton: "Badminton",
  basketball: "Basketball",
  box_cricket: "Box cricket",
  cricket: "Cricket",
  football: "Football",
  futsal: "Futsal",
  pickleball: "Pickleball",
  table_tennis: "Table tennis",
  tennis: "Tennis",
  volleyball: "Volleyball",
} as const;
export type Sport = keyof typeof SPORTS;

export const FORMATS = {
  knockout: { label: "Knockout", blurb: "Lose once and you're out. Fastest to finish." },
  league: { label: "League", blurb: "Everyone plays everyone. Top of the table wins." },
  groups_knockout: { label: "Groups + knockout", blurb: "Group tables first, then the best teams go into a bracket." },
  double_elim: { label: "Double elimination", blurb: "Lose twice to go out. Losers get a second bracket." },
} as const;
export type Format = keyof typeof FORMATS;

const RACQUET = ["Men's Singles", "Women's Singles", "Men's Doubles", "Women's Doubles", "Mixed Doubles", "U13 Boys", "U13 Girls", "U17 Boys", "U17 Girls", "Veterans 40+"];
const TEAM = ["Open", "Corporate", "Women's", "U16", "Veterans 35+"];

export type EntryType = "solo" | "pair" | "team";
export type Scoring = { kind: "games"; bestOf: 1 | 3 | 5; pointsTo: number; cap: number | null } | { kind: "goals" };

/** The sports organisers can pick today. The rest stay in the database enum for later. */
export const LAUNCH_SPORTS: Sport[] = ["badminton", "table_tennis", "pickleball", "tennis", "football", "volleyball"];

export const SPORT_DEFAULTS: Record<Sport, { categories: string[]; teamSize: number; matchMinutes: number; racquet: boolean; scoring: Scoring }> = {
  badminton: { categories: RACQUET, teamSize: 2, matchMinutes: 25, racquet: true, scoring: { kind: "games", bestOf: 3, pointsTo: 21, cap: 30 } },
  table_tennis: { categories: RACQUET, teamSize: 2, matchMinutes: 20, racquet: true, scoring: { kind: "games", bestOf: 5, pointsTo: 11, cap: null } },
  pickleball: { categories: RACQUET, teamSize: 2, matchMinutes: 20, racquet: true, scoring: { kind: "games", bestOf: 3, pointsTo: 11, cap: null } },
  tennis: { categories: RACQUET, teamSize: 2, matchMinutes: 60, racquet: true, scoring: { kind: "games", bestOf: 3, pointsTo: 6, cap: 7 } },
  football: { categories: TEAM, teamSize: 9, matchMinutes: 40, racquet: false, scoring: { kind: "goals" } },
  futsal: { categories: TEAM, teamSize: 8, matchMinutes: 40, racquet: false, scoring: { kind: "goals" } },
  box_cricket: { categories: TEAM, teamSize: 8, matchMinutes: 50, racquet: false, scoring: { kind: "goals" } },
  cricket: { categories: TEAM, teamSize: 15, matchMinutes: 150, racquet: false, scoring: { kind: "goals" } },
  basketball: { categories: TEAM, teamSize: 8, matchMinutes: 50, racquet: false, scoring: { kind: "goals" } },
  volleyball: { categories: TEAM, teamSize: 8, matchMinutes: 45, racquet: false, scoring: { kind: "games", bestOf: 3, pointsTo: 25, cap: null } },
};

/** Badminton caps deuce games (21 → 30); the others play on until someone leads by two. */
// Badminton caps deuce at 9 over (21 -> 30). A tennis set at 6-6 goes to a tiebreak, recorded as 7-6, so it caps at 7.
export const capFor = (sport: Sport, pointsTo: number) =>
  sport === "badminton" ? pointsTo + 9 : sport === "tennis" ? pointsTo + 1 : null;

/** What the scored pieces are called: tennis counts games within sets, volleyball points within sets. */
export function scoreUnits(sport: Sport): { part: "game" | "set"; point: "point" | "game" } {
  if (sport === "tennis") return { part: "set", point: "game" };
  if (sport === "volleyball") return { part: "set", point: "point" };
  return { part: "game", point: "point" };
}

/** Racquet categories are singles unless the name says doubles; team sports always enter as teams. */
export function entryShape(sport: Sport, categoryName: string): { entryType: EntryType; teamSize: number } {
  const d = SPORT_DEFAULTS[sport];
  if (!d.racquet) return { entryType: "team", teamSize: d.teamSize };
  return /doubles|pairs/i.test(categoryName) ? { entryType: "pair", teamSize: 2 } : { entryType: "solo", teamSize: 1 };
}

/** "U13 Boys" -> age limit "under 13"; "Veterans 40+" -> "40 and over". Organisers can change it. */
export function ageFromName(name: string): { kind: "none" | "under" | "over"; age: number } {
  const u = name.match(/\bU-?(\d{1,2})\b/i);
  if (u) return { kind: "under", age: Number(u[1]) };
  const o = name.match(/(\d{2})\s*\+/);
  if (o) return { kind: "over", age: Number(o[1]) };
  return { kind: "none", age: 0 };
}

/** Birth-date bound for an age limit on a given day: under N = born after (day - N years); N and over = born on/before (day - N years). */
export function ageBound(kind: "under" | "over", age: number, onDay: string): string {
  const d = new Date(`${onDay}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  if (kind === "under") d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
