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
];
