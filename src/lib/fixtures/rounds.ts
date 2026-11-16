import type { StageKind } from "./types";

/** "Final", "Semi-finals", "Quarter-finals", "Round 1", "Losers round 2", "Grand final". */
export function roundName(stage: StageKind, round: number, rounds: number) {
  if (stage === "grand_final") return "Grand final";
  if (stage === "losers") return `Losers round ${round}`;
  const fromEnd = rounds - round;
  return fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semi-finals" : fromEnd === 2 ? "Quarter-finals" : `Round ${round}`;
}
