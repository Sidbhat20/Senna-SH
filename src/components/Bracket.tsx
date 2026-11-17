import Link from "next/link";
import type { Played } from "@/lib/fixtures/advance";
import { roundName } from "@/lib/fixtures/rounds";
import { BYE, type StageKind } from "@/lib/fixtures/types";

export { roundName }; // lives in lib/fixtures/rounds so pure code and tests can use it

function Slot({ name, score, won, done }: { name: string | null; score?: number; won: boolean; done: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-1.5 ${done && !won ? "text-muted" : "text-ink"}`}>
      <span className={`truncate text-[14px] ${won ? "font-semibold" : ""} ${!name ? "italic text-muted" : ""}`}>
        {name === BYE ? "Bye" : name ?? "Waiting"}
      </span>
      <span className={`font-score text-lg font-bold leading-none ${won ? "text-turf" : ""}`}>{score ?? ""}</span>
    </div>
  );
}

function Box({ m, href }: { m: Played; href?: string }) {
  const live = m.status === "live";
  const done = m.status === "done";
  const inner = (
    <div className={`relative w-52 divide-y-2 divide-turf/30 rounded-[6px] border-2 bg-surface ${live ? "border-clay" : "border-turf"}`}>
      <Slot name={m.a} score={m.scoreA} won={done && m.winner === m.a} done={done} />
      <Slot name={m.b} score={m.scoreB} won={done && m.winner === m.b} done={done} />
      {live && (
        <span className="absolute -top-2.5 right-2 flex items-center gap-1 rounded-full border border-line bg-clay px-1.5 text-[11px] font-bold text-on-clay">
          <span className="live-dot size-1.5 rounded-full bg-ink" aria-hidden /> Live
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[6px] press" aria-label={`${m.a ?? "TBD"} v ${m.b ?? "TBD"}`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Cell<M extends Played>({ m, hrefFor, hideBye, lead }: { m: M; hrefFor?: (m: M) => string; hideBye: boolean; lead: boolean }) {
  // First-round byes are noise: keep the space so the bracket lines up, show nothing.
  if (hideBye && m.walkover) return <div className="h-[58px] w-52" aria-hidden />;
  return (
    <div className="relative">
      {lead && <span aria-hidden className="absolute top-1/2 -left-5 w-5 border-t-2 border-turf/60" />}
      <Box m={m} href={hrefFor?.(m)} />
    </div>
  );
}

/** Bracket arm joining a pair's centres (at 1/4 and 3/4) to the next match at 1/2; half an arm when one side is a hidden bye. */
function Arm({ topHidden, bottomHidden }: { topHidden: boolean; bottomHidden: boolean }) {
  if (topHidden && bottomHidden) return null;
  const shape = topHidden
    ? "top-1/2 bottom-1/4 border-b rounded-br"
    : bottomHidden
      ? "top-1/4 bottom-1/2 border-t rounded-tr"
      : "top-1/4 bottom-1/4 border-y rounded-r";
  return <span aria-hidden className={`pointer-events-none absolute -right-5 w-5 border-r-2 border-turf/60 ${shape}`} />;
}

const chunk =<T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * One bracket stage as court-green lines on cream.
 * Connectors are drawn for 2-into-1 brackets (knockout, winners); the losers bracket is shown without them.
 */
export function Bracket<M extends Played>({
  matches,
  stage,
  hrefFor,
  rowHeight = 76,
}: {
  matches: M[];
  stage: StageKind;
  hrefFor?: (m: M) => string;
  rowHeight?: number;
}) {
  const ms = matches.filter((m) => m.stage === stage);
  if (!ms.length) return null;
  const rounds = Math.max(...ms.map((m) => m.round));
  const byRound = Array.from({ length: rounds }, (_, i) => ms.filter((m) => m.round === i + 1).sort((x, y) => x.slot - y.slot));
  const height = Math.max(...byRound.map((r) => r.length)) * rowHeight;
  const joined = stage === "knockout" || stage === "winners";

  return (
    <div className="overflow-x-auto rounded-[6px] border border-line bg-bg p-5">
      <div className="flex w-max gap-10">
        {byRound.map((col, ri) => (
          <section key={ri} aria-label={roundName(stage, ri + 1, rounds)} className="flex flex-col">
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.06em] text-turf">{roundName(stage, ri + 1, rounds)}</h3>
            <div className="flex flex-col" style={{ height }}>
              {joined && ri < rounds - 1
                ? chunk(col, 2).map((pair, pi) => (
                    <div key={pi} className="relative flex flex-1 flex-col justify-around">
                      {pair.map((m) => <Cell key={m.key} m={m} hrefFor={hrefFor} hideBye={ri === 0} lead={ri > 0} />)}
                      <Arm topHidden={ri === 0 && !!pair[0].walkover} bottomHidden={ri === 0 && !!pair[1]?.walkover} />
                    </div>
                  ))
                : col.map((m) => (
                    <div key={m.key} className="flex flex-1 flex-col justify-around">
                      <Cell m={m} hrefFor={hrefFor} hideBye={joined && ri === 0} lead={joined && ri > 0} />
                    </div>
                  ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
