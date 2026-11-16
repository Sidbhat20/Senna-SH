// Rally scoring for racquet sports. Mirrors game_over / game_open / update_games in supabase/migrations/0004_sports.sql.

export type GameRules = { bestOf: number; pointsTo: number; cap: number | null };
export type Game = [number, number];

/** True when the game has a winner: first to pointsTo by 2, or first to the cap. */
export function gameOver([a, b]: Game, r: GameRules): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (a < 0 || b < 0) return false;
  return (
    (hi === r.pointsTo && lo <= r.pointsTo - 2) ||
    (lo >= r.pointsTo - 1 && hi - lo === 2 && (r.cap === null || hi <= r.cap)) ||
    (r.cap !== null && hi === r.cap && lo === r.cap - 1)
  );
}

/** True when the game is still being played and the score could really happen. */
export function gameOpen([a, b]: Game, r: GameRules): boolean {
  return a >= 0 && b >= 0 && !gameOver([a, b], r) && (r.cap === null || Math.max(a, b) < r.cap) &&
    (Math.max(a, b) < r.pointsTo || Math.abs(a - b) < 2);
}

export const gamesToWin = (r: GameRules) => Math.floor(r.bestOf / 2) + 1;

/** Games won by each side, and the winner once someone has won the majority. */
export function matchState(games: Game[], r: GameRules) {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (!gameOver(g, r)) continue;
    if (g[0] > g[1]) a++;
    else b++;
  }
  const need = gamesToWin(r);
  return { a, b, winner: a >= need ? ("a" as const) : b >= need ? ("b" as const) : null };
}

/** Adds (or with -1 removes) a point for one side, starting a new game when the last one is over. */
export function addPoint(games: Game[], side: "a" | "b", r: GameRules, by: 1 | -1 = 1): Game[] {
  const out = games.map((g) => [...g] as Game);
  const i = side === "a" ? 0 : 1;
  if (by === -1) {
    // undo: take the point off the current game; if it's empty, step back into the previous game
    while (out.length && out[out.length - 1][0] === 0 && out[out.length - 1][1] === 0) out.pop();
    const last = out[out.length - 1];
    if (last && last[i] > 0) last[i]--;
    return out;
  }
  if (matchState(out, r).winner) return out;
  if (!out.length || gameOver(out[out.length - 1], r)) out.push([0, 0]);
  out[out.length - 1][i]++;
  return out;
}

/** "21-19, 18-21, 21-15" */
export const gamesText = (games: Game[]) => games.filter(([a, b]) => a + b > 0).map(([a, b]) => `${a}-${b}`).join(", ");
