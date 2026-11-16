// Organisers swap two players between first-round matches (P1.1). Only where it can't break the draw: first round of a
// knockout or winners bracket (later rounds are fed by winners; group and league entries play several matches), both
// matches still scheduled, and no byes (a bye's player has already moved on). Mirrored by swap_entries in SQL.
import { BYE, type Side } from "./types";

export type SwapMatch = { stage: string; round: number; status: string; a: string | null; b: string | null; categoryId?: string };

export function swapProblem(x: SwapMatch, xSide: Side, y: SwapMatch, ySide: Side, same = false): string | null {
  if (same) return "Pick two different matches.";
  if (x.categoryId !== y.categoryId) return "Both matches must be in the same category.";
  for (const m of [x, y]) {
    if (!["knockout", "winners"].includes(m.stage) || m.round !== 1) return "Only first-round knockout matches can be swapped.";
    if (m.status !== "scheduled") return "One of these matches has started or finished.";
    if (m.a === BYE || m.b === BYE) return "Matches with a bye can't be swapped.";
  }
  if (!x[xSide] || !y[ySide]) return "Both sides need a player.";
  return null;
}

/** The two matches after the swap. */
export function swapSides<T extends SwapMatch>(x: T, xSide: Side, y: T, ySide: Side): [T, T] {
  return [{ ...x, [xSide]: y[ySide] }, { ...y, [ySide]: x[xSide] }];
}
