// A side is an entry id, BYE (nobody), or null until a feeder match finishes.
export const BYE = "BYE";
export type Side = "a" | "b";
export type StageKind = "league" | "group" | "knockout" | "winners" | "losers" | "grand_final";
export type Link = { key: string; side: Side };

export type Match = {
  key: string; // `${stage}-${group}-${round}-${slot}`, unique per tournament
  stage: StageKind;
  group?: string;
  round: number; // 1-based
  slot: number; // 0-based within round
  a: string | null;
  b: string | null;
  next?: Link; // where the winner goes
  loserNext?: Link; // double elim only
};

export const key = (stage: StageKind, round: number, slot: number, group = "") =>
  `${stage}-${group}-${round}-${slot}`;
