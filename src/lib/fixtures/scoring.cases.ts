import type { Game } from "./scoring";

// Shared with the SQL test: the same cases must agree with game_over / game_open in 0004_sports.sql.
export const GAME_CASES: { g: Game; to: number; cap: number | null; over: boolean; open: boolean }[] = [
  { g: [21, 19], to: 21, cap: 30, over: true, open: false },
  { g: [21, 20], to: 21, cap: 30, over: false, open: true },
  { g: [22, 20], to: 21, cap: 30, over: true, open: false },
  { g: [23, 20], to: 21, cap: 30, over: false, open: false },
  { g: [30, 29], to: 21, cap: 30, over: true, open: false },
  { g: [29, 29], to: 21, cap: 30, over: false, open: true },
  { g: [31, 29], to: 21, cap: 30, over: false, open: false },
  { g: [25, 10], to: 21, cap: 30, over: false, open: false },
  { g: [11, 9], to: 11, cap: null, over: true, open: false },
  { g: [15, 13], to: 11, cap: null, over: true, open: false },
  { g: [10, 10], to: 11, cap: null, over: false, open: true },
  { g: [0, 0], to: 11, cap: null, over: false, open: true },
  // tennis: games within a set, 6-6 tiebreak recorded as 7-6
  { g: [6, 4], to: 6, cap: 7, over: true, open: false },
  { g: [7, 5], to: 6, cap: 7, over: true, open: false },
  { g: [7, 6], to: 6, cap: 7, over: true, open: false },
  { g: [6, 6], to: 6, cap: 7, over: false, open: true },
  { g: [6, 5], to: 6, cap: 7, over: false, open: true },
  { g: [8, 6], to: 6, cap: 7, over: false, open: false },
  // volleyball: sets to 25, win by 2, no cap
  { g: [25, 23], to: 25, cap: null, over: true, open: false },
  { g: [25, 24], to: 25, cap: null, over: false, open: true },
  { g: [31, 29], to: 25, cap: null, over: true, open: false },
];
