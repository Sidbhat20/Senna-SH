"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { addPoint, gameOver, matchState, type Game, type GameRules } from "@/lib/fixtures/scoring";
import type { Scoring } from "@/lib/sports";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  matchId: string;
  a: string;
  b: string;
  scoring: Scoring;
  initialGames: Game[];
  initialA: number;
  initialB: number;
  initialPen: [number | null, number | null];
  initialStatus: "scheduled" | "live" | "done";
  canDraw: boolean;
  backHref: string;
};

const big = "h-20 rounded-lg bg-flood font-display text-3xl font-bold text-ink active:brightness-90 disabled:opacity-30";
const small = "mt-2 h-11 rounded-lg border border-chalk/30 font-semibold disabled:opacity-30";

export function ScorePad(p: Props) {
  const rules: GameRules | null = p.scoring.kind === "games" ? { bestOf: p.scoring.bestOf, pointsTo: p.scoring.pointsTo, cap: p.scoring.cap } : null;
  const [games, setGames] = useState<Game[]>(p.initialGames);
  const [goals, setGoals] = useState({ a: p.initialA, b: p.initialB });
  const [pen, setPen] = useState<{ a: string; b: string }>({ a: p.initialPen[0]?.toString() ?? "", b: p.initialPen[1]?.toString() ?? "" });
  const [status, setStatus] = useState(p.initialStatus);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(0);
  // Saves run one after another so a slow request can't overwrite a newer score.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const save = (rpc: () => PromiseLike<{ error: { message: string } | null }>) => {
    setSaving((n) => n + 1);
    queue.current = queue.current.then(async () => {
      const { error } = await rpc();
      setSaving((n) => n - 1);
      if (error) setError(`Score not saved: ${error.message}`);
    });
  };
  const saveGames = (g: Game[]) => save(() => supabaseBrowser().rpc("update_games", { p_match: p.matchId, p_games: g }));
  const saveGoals = (g: { a: number; b: number }, pn = pen) =>
    save(() => supabaseBrowser().rpc("update_score", {
      p_match: p.matchId, p_a: g.a, p_b: g.b, p_pen_a: pn.a === "" ? null : Number(pn.a), p_pen_b: pn.b === "" ? null : Number(pn.b),
    }));

  const state = rules ? matchState(games, rules) : null;
  const current: Game = rules && games.length && !gameOver(games[games.length - 1], rules) ? games[games.length - 1] : [0, 0];
  const finishedGames = rules ? games.filter((g) => gameOver(g, rules)) : [];
  const levelKnockout = !rules && goals.a === goals.b && !p.canDraw;
  const pensDecided = pen.a !== "" && pen.b !== "" && pen.a !== pen.b;
  const canEnd = rules ? !!state?.winner : !levelKnockout || pensDecided;
  const winnerName = rules
    ? state?.winner === "a" ? p.a : p.b
    : goals.a > goals.b || (levelKnockout && Number(pen.a) > Number(pen.b)) ? p.a : p.b;
  const scoreLine = rules ? `${state?.a ?? 0}-${state?.b ?? 0} in games` : `${goals.a}-${goals.b}${levelKnockout ? `, ${pen.a}-${pen.b} on penalties` : ""}`;

  const tap = (side: "a" | "b", by: 1 | -1) => {
    setError("");
    if (rules) {
      const next = addPoint(games, side, rules, by);
      setGames(next);
      saveGames(next);
    } else {
      const next = { ...goals, [side]: Math.max(0, goals[side] + by) };
      setGoals(next);
      saveGoals(next);
    }
  };

  const start = () => {
    setStatus("live");
    if (rules) saveGames([]);
    else saveGoals(goals);
  };

  const end = async () => {
    await queue.current; // the last score must be saved first
    const { error } = await supabaseBrowser().rpc("finish_match", { p_match: p.matchId });
    if (error) {
      setError(error.message);
      setConfirming(false);
    } else setStatus("done");
  };

  if (status === "done") {
    return (
      <div className="rounded-xl bg-pitch p-6 text-chalk">
        <div className="text-chalk/70">Match over</div>
        <div className="mt-1 font-display text-4xl font-bold">{winnerName} won</div>
        <p className="tabular mt-1 text-lg">{rules ? finishedGames.map(([x, y]) => `${x}-${y}`).join(", ") : scoreLine}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/referee" className="rounded-md bg-flood px-5 py-3 font-semibold text-ink">Next match</Link>
          <Link href={p.backHref} className="rounded-md bg-chalk px-5 py-3 font-semibold text-ink">Back to tournament</Link>
        </div>
      </div>
    );
  }

  const shown = rules ? current : ([goals.a, goals.b] as Game);
  return (
    <div>
      {rules && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[15px]" aria-label="Games">
          {finishedGames.map(([x, y], i) => (
            <span key={i} className="tabular rounded-md bg-ink px-2.5 py-1 font-semibold text-chalk">
              Game {i + 1}: {x}-{y}
            </span>
          ))}
          {!state?.winner && status === "live" && (
            <span className="text-muted">
              Game {finishedGames.length + 1} of up to {rules.bestOf}, to {rules.pointsTo}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((side, i) => (
          <div key={side} className="flex flex-col rounded-xl bg-pitch p-4 text-chalk">
            <div className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-snug">{side === "a" ? p.a : p.b}</div>
            <div className="flex items-baseline justify-between">
              <output aria-live="polite" className="tabular my-2 font-display text-7xl font-bold leading-none">{shown[i]}</output>
              {rules && <span className="tabular text-[15px] text-chalk/70">{side === "a" ? state?.a : state?.b} games</span>}
            </div>
            <button type="button" disabled={status !== "live" || (!!rules && !!state?.winner)} onClick={() => tap(side, 1)} className={big}
              aria-label={`Point to ${side === "a" ? p.a : p.b}`}>
              +1
            </button>
            <button type="button" disabled={status !== "live" || (rules ? !games.length : goals[side] === 0)} onClick={() => tap(side, -1)}
              className={small} aria-label={`Take a point off ${side === "a" ? p.a : p.b}`}>
              Undo
            </button>
          </div>
        ))}
      </div>

      {levelKnockout && status === "live" && (
        <fieldset className="mt-4 rounded-xl border border-line bg-white p-4">
          <legend className="px-1 font-semibold">Penalty shoot-out</legend>
          <p className="text-[14px] text-muted">Level after full time. Enter the shoot-out score to decide the winner.</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["a", "b"] as const).map((side) => (
              <label key={side} className="block text-[15px]">
                <span className="line-clamp-1">{side === "a" ? p.a : p.b}</span>
                <input inputMode="numeric" value={pen[side]} aria-label={`Penalties scored by ${side === "a" ? p.a : p.b}`}
                  onChange={(e) => {
                    const next = { ...pen, [side]: e.target.value.replace(/\D/g, "").slice(0, 2) };
                    setPen(next);
                    saveGoals(goals, next);
                  }}
                  className="tabular mt-1 block w-full rounded-lg border border-line px-3 py-2 text-xl" />
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-3 h-5 text-[14px] text-muted" aria-live="polite">
        {saving > 0 ? "Saving…" : status === "live" ? "Saved. Everyone following sees this score." : ""}
      </p>
      {error && <p role="alert" className="mt-1 text-[15px] text-danger">{error}</p>}

      <div className="mt-4">
        {status === "scheduled" && (
          <button type="button" onClick={start} className="h-14 w-full rounded-lg bg-turf text-lg font-semibold text-white">Start match</button>
        )}
        {status === "live" && !confirming && (
          <>
            <button type="button" onClick={() => setConfirming(true)} disabled={!canEnd}
              className="h-14 w-full rounded-lg bg-ink text-lg font-semibold text-chalk disabled:opacity-40">
              End match
            </button>
            {!canEnd && (
              <p className="mt-2 text-[15px] text-muted">
                {rules ? `The match ends when someone wins ${Math.floor(rules.bestOf / 2) + 1} ${rules.bestOf === 1 ? "game" : "games"}.` : "Enter the penalty shoot-out score to finish a level knockout match."}
              </p>
            )}
          </>
        )}
        {confirming && (
          <div className="rounded-xl border-2 border-ink p-4" role="alertdialog" aria-labelledby="confirm-end">
            <p id="confirm-end" className="font-medium">
              End the match? {!rules && goals.a === goals.b && p.canDraw ? `It finishes as a ${goals.a}-${goals.b} draw.` : `${winnerName} win, ${scoreLine}.`} You
              can&apos;t change the score after this.
            </p>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={end} className="h-12 flex-1 rounded-lg bg-ink font-semibold text-chalk">End match</button>
              <button type="button" onClick={() => setConfirming(false)} className="h-12 flex-1 rounded-lg border border-ink font-semibold">Keep playing</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
