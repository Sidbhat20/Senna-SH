import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { roundName } from "@/components/Bracket";
import { time } from "@/components/ui";
import { getMatch } from "@/lib/data";
import { scoreUnits } from "@/lib/sports";
import { BYE } from "@/lib/fixtures/types";
import { ScorePad } from "./ScorePad";

export const metadata: Metadata = { title: "Score match", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RefereeMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = UUID.test(id) ? await getMatch(id) : null;
  if (!found) notFound();
  const { event: t, category, match: m, canScore } = found;
  const rounds = Math.max(...category.matches.filter((x) => x.stage === m.stage).map((x) => x.round));
  const label = m.group
    ? `Group ${m.group}, round ${m.round}`
    : category.format === "league"
      ? `Round ${m.round}`
      : roundName(m.stage, m.round, rounds);
  const ready = m.a && m.b && m.a !== BYE && m.b !== BYE;

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link href={`/t/${t.slug}`} className="text-[15px] text-muted underline-offset-4 hover:underline">
        {t.title}
      </Link>
      <h1 className="mt-1 font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">{category.name}, {label}</h1>
      <p className="text-muted">
        {[m.court, m.at && time(m.at), t.venue].filter(Boolean).join(", ")}
      </p>

      <div className="mt-6">
        {!canScore ? (
          <p className="rounded-[6px] border border-line bg-surface p-5">
            Only the organiser and the referee for this court can score this match.
          </p>
        ) : ready ? (
          <ScorePad
            matchId={m.id}
            a={m.a!}
            b={m.b!}
            scoring={category.scoring}
            unit={scoreUnits(t.sport).part}
            initialGames={m.games}
            initialA={m.scoreA ?? 0}
            initialB={m.scoreB ?? 0}
            initialPen={[m.penA ?? null, m.penB ?? null]}
            initialStatus={m.status}
            canDraw={m.stage === "league" || m.stage === "group"}
            backHref={`/t/${t.slug}?c=${category.id}`}
          />
        ) : (
          <p className="rounded-[6px] border border-line bg-surface p-5">
            This match is waiting for the winners of earlier rounds. It opens for scoring once both sides are known.
          </p>
        )}
      </div>
    </div>
  );
}
