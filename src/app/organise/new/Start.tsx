"use client";

import { useState, useTransition } from "react";
import { draftFromPoster } from "@/app/actions";
import { POSTER_TYPES, posterProblem } from "@/lib/poster";
import type { PosterDraft } from "@/lib/poster-draft";
import { Wizard } from "./Wizard";

type Mode = { kind: "choose" } | { kind: "manual" } | { kind: "poster"; draft?: PosterDraft; file: File; note: string };

/** Smart Create: start from scratch, or from a poster that Claude reads into the same wizard for review. */
export function Start() {
  const [mode, setMode] = useState<Mode>({ kind: "choose" });
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  const read = (file?: File) => {
    if (!file) return;
    const problem = posterProblem(file);
    if (problem) { setError(problem); return; }
    setError("");
    const form = new FormData();
    form.set("poster", file);
    start(async () => {
      const res = await draftFromPoster(form);
      setMode({
        kind: "poster", file, draft: res.draft,
        note: res.ok ? "We filled in what the poster shows. Check every field before you publish." : `${res.error ?? "We couldn't read the poster."} Fill in the rest below.`,
      });
    });
  };

  if (mode.kind === "manual") return <Wizard />;
  if (mode.kind === "poster") {
    return (
      <div className="space-y-6">
        <p role="status" className="rounded-xl border-2 border-flood bg-white px-4 py-3 text-[15px]">{mode.note}</p>
        <Wizard initial={mode.draft} initialPoster={mode.file} />
      </div>
    );
  }

  const card = "block w-full rounded-xl border-2 border-ink bg-white p-5 text-left hover:bg-line/30 disabled:opacity-60";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" className={card} onClick={() => setMode({ kind: "manual" })} disabled={busy}>
        <span className="block font-display text-2xl font-bold">Create manually</span>
        <span className="mt-1 block text-[15px] text-muted">Pick the sport, categories and courts step by step.</span>
      </button>
      <label className={`${card} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-flood`}>
        <span className="block font-display text-2xl font-bold">{busy ? "Reading your poster…" : "Create from a poster"}</span>
        <span className="mt-1 block text-[15px] text-muted">
          Upload the poster you already made. We fill in the name, venue, dates and categories, and you check everything before publishing.
        </span>
        <input type="file" accept={POSTER_TYPES.join(",")} className="sr-only" disabled={busy} onChange={(e) => read(e.target.files?.[0])} />
      </label>
      {error && <p role="alert" className="text-[15px] text-danger sm:col-span-2">{error}</p>}
    </div>
  );
}
