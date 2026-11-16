import { describe, expect, it } from "vitest";
import { doubleElim } from "./doubleElim";
import { groups, qualifiers } from "./groups";
import { knockout, seedOrder } from "./knockout";
import { league } from "./league";
import { BYE, type Match } from "./types";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);

// Plays every match in dependency order with the same rules finish_match() must apply in SQL:
// a BYE side loses automatically; the winner/loser is copied into next/loserNext.
function play(matches: Match[], pick = (a: string, b: string) => (Math.random() < 0.5 ? a : b)) {
  const byKey = new Map(matches.map((m) => [m.key, { ...m }]));
  const losses = new Map<string, number>();
  let champion: string | undefined;
  const done = new Set<string>();
  for (let progress = true; progress; ) {
    progress = false;
    for (const m of byKey.values()) {
      if (done.has(m.key) || m.a === null || m.b === null) continue;
      const winner = m.a === BYE ? m.b : m.b === BYE ? m.a : pick(m.a, m.b);
      const loser = winner === m.a ? m.b : m.a;
      if (loser !== BYE) losses.set(loser, (losses.get(loser) ?? 0) + 1);
      for (const [link, who] of [[m.next, winner], [m.loserNext, loser]] as const) {
        if (!link) continue;
        const t = byKey.get(link.key)!;
        expect(t[link.side], `${link.key}.${link.side} filled twice`).toBeNull();
        t[link.side] = who;
      }
      if (!m.next) champion = winner;
      done.add(m.key);
      progress = true;
    }
  }
  return { done: done.size, champion, losses };
}

describe("seedOrder", () => {
  it("puts top seeds on opposite halves", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("knockout", () => {
  for (let n = 2; n <= 33; n++) {
    it(`${n} entries -> one champion, everyone placed once`, () => {
      const ms = knockout(ids(n));
      const r1 = ms.filter((m) => m.round === 1).flatMap((m) => [m.a, m.b]).filter((x) => x !== BYE);
      expect(r1.sort()).toEqual(ids(n).sort());
      const { done, champion, losses } = play(ms);
      expect(done).toBe(ms.length);
      expect(ids(n)).toContain(champion);
      expect(losses.size).toBe(n - 1);
    });
  }
  it("top seed wins when the higher seed always wins", () => {
    const seeds = ids(13);
    const { champion } = play(knockout(seeds), (a, b) => (seeds.indexOf(a) < seeds.indexOf(b) ? a : b));
    expect(champion).toBe("e1");
  });
  it("rejects <2", () => expect(() => knockout(["x"])).toThrow());
});

describe("league", () => {
  for (let n = 2; n <= 17; n++) {
    it(`${n} entries -> every pair exactly once, nobody twice per round`, () => {
      const ms = league(ids(n));
      const pairs = ms.map((m) => [m.a, m.b].sort().join("|"));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      for (const r of new Set(ms.map((m) => m.round))) {
        const inRound = ms.filter((m) => m.round === r).flatMap((m) => [m.a, m.b]);
        expect(new Set(inRound).size).toBe(inRound.length);
      }
      expect(new Set(ms.map((m) => m.key)).size).toBe(ms.length);
    });
  }
});

describe("groups", () => {
  it("snake seeds 16 into 4 groups of 4", () => {
    const { groups: g, matches } = groups(ids(16), 4);
    expect(g.A).toEqual(["e1", "e8", "e9", "e16"]);
    expect(g.D).toEqual(["e4", "e5", "e12", "e13"]);
    expect(matches.length).toBe(4 * 6);
    expect(new Set(matches.map((m) => m.key)).size).toBe(matches.length);
  });
  it("handles uneven groups (10 into 3)", () => {
    const { groups: g } = groups(ids(10), 3);
    expect(Object.values(g).flat().sort()).toEqual(ids(10).sort());
  });
  it("qualifiers keep same-group teams apart in the knockout", () => {
    const q = qualifiers({ A: ["a1", "a2"], B: ["b1", "b2"] }, 2);
    expect(q).toEqual(["a1", "b1", "a2", "b2"]);
    const r1 = knockout(q).filter((m) => m.round === 1).map((m) => [m.a, m.b]);
    expect(r1).toEqual([["a1", "b2"], ["b1", "a2"]]);
    // 4 groups: no round-1 match is within one group
    const t = Object.fromEntries("abcd".split("").map((g) => [g.toUpperCase(), [`${g}1`, `${g}2`]]));
    for (const m of knockout(qualifiers(t, 2)).filter((m) => m.round === 1)) expect(m.a![0]).not.toBe(m.b![0]);
  });
});

describe("doubleElim", () => {
  for (let n = 2; n <= 33; n++) {
    it(`${n} entries -> all matches resolve, one champion, max 2 losses`, () => {
      const ms = doubleElim(ids(n));
      expect(new Set(ms.map((m) => m.key)).size).toBe(ms.length);
      for (let trial = 0; trial < 5; trial++) {
        const { done, champion, losses } = play(ms);
        expect(done).toBe(ms.length);
        expect(ids(n)).toContain(champion);
        for (const l of losses.values()) expect(l).toBeLessThanOrEqual(2);
        expect([...losses.keys()].filter((e) => e !== champion).length).toBe(n - 1);
      }
    });
  }
});

import { advance } from "./advance";
import { standings } from "./standings";

describe("advance", () => {
  it("resolves byes and pushes winners and losers forward", () => {
    const ms = doubleElim(ids(3)); // e1 has a bye in WB round 1
    const played = advance(ms, { "winners--1-1": { a: 2, b: 1 } }); // e2 beats e3 (seed order 2 v 3)
    const at = (k: string) => played.find((m) => m.key === k)!;
    expect(at("winners--1-0").walkover).toBe(true);
    expect([at("winners--2-0").a, at("winners--2-0").b]).toEqual(["e1", at("winners--1-1").winner]);
    expect(at("losers--1-0").status).toBe("done"); // loser vs BYE walks over
  });
  it("keeps a bracket tie live and a live result unfinished", () => {
    const played = advance(knockout(ids(2)), { "knockout--1-0": { a: 1, b: 1 } });
    expect(played[0].status).toBe("live");
  });
});

describe("standings", () => {
  it("ranks by points then difference", () => {
    const ms = league(["x", "y", "z"]);
    const res = Object.fromEntries(ms.map((m) => [m.key, m.a === "x" || m.b === "x" ? { a: m.a === "x" ? 3 : 0, b: m.b === "x" ? 3 : 0 } : { a: 1, b: 1 }]));
    const t = standings(["x", "y", "z"], advance(ms, res));
    expect(t.map((r) => [r.entry, r.pts])).toEqual([["x", 6], ["y", 1], ["z", 1]]);
    expect(t[0]).toMatchObject({ p: 2, w: 2, f: 6, a: 0 });
  });
});

import { matchCount } from "./count";

describe("matchCount agrees with the engine", () => {
  const real = (ms: Match[]) => advance(ms, {}).filter((m) => !m.walkover).length; // bye matches resolve with no result
  for (const n of [2, 3, 5, 8, 12, 16, 33]) {
    it(`n=${n}`, () => {
      expect(matchCount("knockout", n, 0)).toBe(real(knockout(ids(n))));
      expect(matchCount("league", n, 0)).toBe(league(ids(n)).length);
      if (n >= 4) {
        const g = Math.min(4, Math.floor(n / 2));
        expect(matchCount("groups_knockout", n, 4)).toBe(groups(ids(n), g).matches.length + knockout(ids(2 * g)).length);
      }
      // double elim: play it out and count matches that were actually contested
      let played = 0;
      play(doubleElim(ids(n)), (a) => (played++, a));
      expect(matchCount("double_elim", n, 0)).toBe(played);
    });
  }
});

import { separateClubs } from "./clubs";
import { schedule, type SchedMatch } from "./schedule";

describe("club separation", () => {
  it("keeps same-club players apart in knockout round 1 when possible", () => {
    const club = (e: string) => (["e1", "e2", "e3", "e4"].includes(e) ? "A" : ["e5", "e6"].includes(e) ? "B" : "C");
    const before = knockout(ids(8)).filter((m) => m.round === 1);
    const after = separateClubs(knockout(ids(8)), club).filter((m) => m.round === 1);
    const clashes = (ms: Match[]) => ms.filter((m) => club(m.a!) === club(m.b!)).length;
    expect(clashes(after)).toBeLessThanOrEqual(clashes(before));
    expect(clashes(after)).toBe(0);
    // same players, each exactly once; side a (the seeds) untouched
    expect(after.flatMap((m) => [m.a, m.b]).sort()).toEqual(ids(8).sort());
    expect(after.map((m) => m.a)).toEqual(before.map((m) => m.a));
  });
  it("never moves byes", () => {
    const ms = separateClubs(knockout(ids(5)), () => "Same");
    expect(ms.filter((m) => m.round === 1).map((m) => m.b)).toEqual(knockout(ids(5)).filter((m) => m.round === 1).map((m) => m.b));
  });
  it("spreads a club across groups", () => {
    const club = (e: string) => (["e1", "e2", "e5", "e6"].includes(e) ? "A" : e);
    const { groups: g } = groups(ids(8), 4, club);
    for (const members of Object.values(g)) expect(members.filter((e) => club(e) === "A").length).toBeLessThanOrEqual(1);
    expect(Object.values(g).flat().sort()).toEqual(ids(8).sort());
  });
});

describe("schedule", () => {
  const T0 = new Date("2026-12-06T08:00:00+05:30");
  const toSched = (cat: string, ms: Match[]): SchedMatch[] =>
    advance(ms, {}).map((m) => ({ ...m, id: `${cat}:${m.key}`, category: cat }));
  const check = (ms: SchedMatch[], slots: ReturnType<typeof schedule>, slotMin: number) => {
    const at = new Map(slots.map((s) => [s.id, s]));
    const dur = slotMin * 60_000;
    // courts never overlap
    const byCourt = new Map<string, number[]>();
    for (const s of slots) byCourt.set(s.court, [...(byCourt.get(s.court) ?? []), +s.at]);
    for (const times of byCourt.values()) {
      times.sort((x, y) => x - y);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(dur);
    }
    // a match starts after every feeder ends
    for (const m of ms) for (const l of [m.next, m.loserNext]) {
      if (!l || !at.has(m.id)) continue;
      const target = at.get(`${m.category}:${l.key}`);
      if (target) expect(+target.at).toBeGreaterThanOrEqual(+at.get(m.id)!.at + dur);
    }
    // known players are never double-booked
    const byPlayer = new Map<string, number[]>();
    for (const m of ms) for (const p of [m.a, m.b]) {
      if (!p || p === BYE || !at.has(m.id)) continue;
      byPlayer.set(p, [...(byPlayer.get(p) ?? []), +at.get(m.id)!.at]);
    }
    for (const times of byPlayer.values()) {
      times.sort((x, y) => x - y);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(dur);
    }
  };

  it("schedules two categories across shared courts with no clashes", () => {
    const ms = [...toSched("MS", knockout(ids(13))), ...toSched("WS", league(ids(6).map((x) => `w${x}`))), ...toSched("MD", doubleElim(ids(6).map((x) => `d${x}`)))];
    const slots = schedule(ms, ["C1", "C2", "C3"], { start: T0, slotMinutes: 25 });
    expect(slots.length).toBe(ms.filter((m) => m.status !== "done").length);
    check(ms, slots, 25);
    expect(+slots.reduce((a, s) => (s.at > a ? s.at : a), T0)).toBeGreaterThanOrEqual(+T0);
    expect(slots.every((s) => +s.at >= +T0)).toBe(true);
  });

  it("uses every court when there is enough work", () => {
    const ms = toSched("X", league(ids(8)));
    const slots = schedule(ms, ["C1", "C2", "C3", "C4"], { start: T0, slotMinutes: 30 });
    expect(new Set(slots.filter((s) => +s.at === +T0).map((s) => s.court)).size).toBe(4);
  });

  it("reschedules from now, leaving live matches on their court", () => {
    const ms = toSched("X", league(ids(4)));
    ms[0] = { ...ms[0], status: "live", court: "C1", startedAt: new Date(+T0 + 3_600_000) };
    const now = new Date(+T0 + 3_600_000 + 10 * 60_000);
    const slots = schedule(ms, ["C1", "C2"], { start: T0, slotMinutes: 30, now });
    expect(slots.every((s) => +s.at >= +now)).toBe(true);
    expect(slots.some((s) => s.court === "C1" && +s.at < +ms[0].startedAt! + 30 * 60_000)).toBe(false);
    for (const s of slots) {
      const m = ms.find((x) => x.id === s.id)!;
      if ([m.a, m.b].some((p) => p === ms[0].a || p === ms[0].b)) expect(+s.at).toBeGreaterThanOrEqual(+ms[0].startedAt! + 30 * 60_000);
    }
  });
});

import { addPoint, gameOpen, gameOver, matchState, type Game } from "./scoring";
import { GAME_CASES } from "./scoring.cases";



describe("rally scoring", () => {
  for (const c of GAME_CASES) {
    it(`${c.g.join("-")} to ${c.to}${c.cap ? ` cap ${c.cap}` : ""}`, () => {
      const r = { bestOf: 3, pointsTo: c.to, cap: c.cap };
      expect(gameOver(c.g, r)).toBe(c.over);
      expect(gameOpen(c.g, r)).toBe(c.open);
    });
  }
  it("plays a best-of-3 badminton match point by point", () => {
    const r = { bestOf: 3, pointsTo: 21, cap: 30 };
    let g: Game[] = [];
    for (let i = 0; i < 21; i++) g = addPoint(g, "a", r);
    expect(g).toEqual([[21, 0]]);
    for (let i = 0; i < 21; i++) g = addPoint(g, "b", r);
    expect(g).toEqual([[21, 0], [0, 21]]);
    for (let i = 0; i < 29; i++) { g = addPoint(g, "a", r); g = addPoint(g, "b", r); }
    expect(g[2]).toEqual([29, 29]);
    g = addPoint(g, "b", r);
    expect(matchState(g, r)).toEqual({ a: 1, b: 2, winner: "b" });
    expect(addPoint(g, "a", r)).toEqual(g); // no points after the match is won
    expect(addPoint(g, "b", r, -1)[2]).toEqual([29, 29]); // undo
  });
  it("undo steps back into the previous game", () => {
    const r = { bestOf: 3, pointsTo: 11, cap: null };
    expect(addPoint([[11, 3], [0, 0]], "a", r, -1)).toEqual([[10, 3]]);
  });
});

import { ageBound, ageFromName, entryShape } from "../sports";

describe("sport profiles", () => {
  it("reads age limits from category names", () => {
    expect(ageFromName("U13 Boys")).toEqual({ kind: "under", age: 13 });
    expect(ageFromName("Veterans 40+")).toEqual({ kind: "over", age: 40 });
    expect(ageFromName("Men's Singles")).toEqual({ kind: "none", age: 0 });
  });
  it("turns an age limit into a birth-date bound on the event day", () => {
    // Under 13 on 20 Dec 2026: born after 20 Dec 2013. 40 and over: born on or before 20 Dec 1986.
    expect(ageBound("under", 13, "2026-12-20")).toBe("2013-12-21");
    expect(ageBound("over", 40, "2026-12-20")).toBe("1986-12-20");
  });
  it("doubles are pairs, football is teams", () => {
    expect(entryShape("badminton", "Mixed Doubles")).toEqual({ entryType: "pair", teamSize: 2 });
    expect(entryShape("table_tennis", "U13 Boys")).toEqual({ entryType: "solo", teamSize: 1 });
    expect(entryShape("football", "Open").entryType).toBe("team");
  });
});

import { safeNext } from "../safe-next";

describe("safeNext (login redirects)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/t/open-cup?c=1")).toBe("/t/open-cup?c=1");
    expect(safeNext("/join/abc")).toBe("/join/abc");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/\tevil", "", null, undefined]) {
      expect(safeNext(bad as string)).toBe("/");
    }
  });
});

import { vi } from "vitest";
import { debounce, REFRESH_DEBOUNCE_MS } from "../debounce";

describe("live refresh debounce", () => {
  it("collapses a burst of score changes into one refresh", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const run = debounce(fn, REFRESH_DEBOUNCE_MS);
    for (let i = 0; i < 25; i++) {
      run();
      vi.advanceTimersByTime(50); // a fast referee: a point every 50 ms
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    run();
    run.cancel();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

import { expectTypeOf } from "vitest";
import type { ScoringQueue } from "../data";

describe("referee queue stays slim", () => {
  it("carries only the event's id, slug and title, not a full event with every past match", () => {
    expectTypeOf<keyof ScoringQueue["event"]>().toEqualTypeOf<"id" | "slug" | "title">();
  });
});

import { organiserOrder } from "../organise";

describe("organiser home order", () => {
  it("lists events still to run first (soonest first), then finished ones (newest first)", () => {
    const ev = (id: string, status: "draft" | "open" | "live" | "completed" | "cancelled", startsAt: string) => ({ id, status, startsAt });
    const { active, past } = organiserOrder([
      ev("old-final", "completed", "2026-10-01T04:00:00Z"),
      ev("next-week", "open", "2026-12-20T04:00:00Z"),
      ev("today", "live", "2026-11-16T04:00:00Z"),
      ev("idea", "draft", "2027-01-05T04:00:00Z"),
      ev("rained-off", "cancelled", "2026-11-01T04:00:00Z"),
    ]);
    expect(active.map((e) => e.id)).toEqual(["today", "next-week", "idea"]);
    expect(past.map((e) => e.id)).toEqual(["rained-off", "old-final"]);
  });
});

import { csvCell, entriesCsv, istStamp, orderOfPlayCsv, toCsv } from "../exports";
import type { EventDetail } from "../data";

describe("CSV exports", () => {
  it("escapes commas, quotes and new lines, and neutralises spreadsheet formulas", () => {
    expect(csvCell('Rao, Arjun')).toBe('"Rao, Arjun"');
    expect(csvCell('The "Smashers"')).toBe('"The ""Smashers"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell(-3)).toBe("-3"); // numbers are numbers, not formulas
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "b"]])).toBe("﻿a,b\r\n");
  });

  it("writes times in Bangalore time", () => {
    expect(istStamp("2026-12-20T03:00:00Z")).toBe("2026-12-20 08:30");
  });

  const ev = {
    slug: "test-open",
    courts: [{ id: "c1", name: "Court 1" }, { id: "c2", name: "Court 2" }],
    categories: [{
      name: "Men's Singles", format: "knockout",
      entryRows: [
        { id: "e1", name: "Arjun Rao", club: "Smash", seed: 1, status: "confirmed", paymentStatus: "paid", checkedIn: true, idChecked: false, roster: [] },
        { id: "e2", name: "Walk-in", club: "", seed: null, status: "confirmed", paymentStatus: "not_required", checkedIn: false, idChecked: false, roster: [] },
      ],
      matches: [
        { id: "m1", key: "k1", stage: "knockout", round: 1, slot: 0, a: "Arjun Rao", b: "Walk-in", status: "scheduled", games: [], courtId: "c2", court: "Court 2", at: "2026-12-20T03:30:00Z" },
        { id: "m2", key: "k2", stage: "knockout", round: 1, slot: 1, a: "Bye", b: "Kavya", status: "done", games: [], courtId: null, walkover: true },
        { id: "m3", key: "k3", stage: "knockout", round: 2, slot: 0, a: "Ravi", b: "Meera", status: "scheduled", games: [], courtId: "c1", court: "Court 1", at: "2026-12-20T04:00:00Z" },
      ],
    }],
  } as unknown as EventDetail;

  it("entries include payment and contacts for managers", () => {
    const csv = entriesCsv(ev, new Map([["e1", { email: "arjun@example.com", phone: "+919000000000" }]]));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Category,Entry,Club,Seed,Status,Payment,Checked in,ID seen,Players,Email,Phone,UPI reference");
    expect(lines[1]).toBe("Men's Singles,Arjun Rao,Smash,1,Confirmed,Paid,Yes,No,,arjun@example.com,'+919000000000,");
    expect(lines[2]).toBe("Men's Singles,Walk-in,,,Confirmed,Free,No,No,,,,");
  });

  it("order of play is by court then time, without byes", () => {
    const lines = orderOfPlayCsv(ev).replace("﻿", "").trim().split("\r\n");
    expect(lines.slice(1)).toEqual([
      "Court 1,2026-12-20 09:30,Men's Singles,Final,Ravi,Meera,Scheduled",
      "Court 2,2026-12-20 09:00,Men's Singles,Semi-finals,Arjun Rao,Walk-in,Scheduled",
    ]);
  });
});

import { deliver, render, whatsappShare, type Queued } from "../notify";
import { EMAIL_NOT_SET_UP } from "../email";

describe("notifications", () => {
  const payload = { event: "Whitefield Open", slug: "whitefield-open-ab12", venue: "Smash Arena", category: "Men's Singles",
    entry: "Arjun Rao", court: "Court 2", at: "2026-12-20T03:30:00Z", opponent: "Rohan Shetty" };
  const rows: Queued[] = ["a@x.in", "b@x.in", "c@x.in"].map((email, i) => ({ id: `n${i}`, email, kind: "fixtures_released", payload }));

  it("sends one email per queued player and reports failures without losing them", async () => {
    const outbox: string[] = [];
    const ok = await deliver(rows, async (e) => (outbox.push(e.to), { ok: true }));
    expect(outbox).toEqual(["a@x.in", "b@x.in", "c@x.in"]);
    expect(ok).toEqual({ sent: ["n0", "n1", "n2"], failed: [], error: null });
    const half = await deliver(rows, async (e) => (e.to === "b@x.in" ? { ok: false, error: "bounced" } : { ok: true }));
    expect(half).toEqual({ sent: ["n0", "n2"], failed: ["n1"], error: "bounced" });
    const off = await deliver(rows, async () => ({ ok: false, error: EMAIL_NOT_SET_UP }));
    expect(off.failed).toHaveLength(3);
  });

  it("writes a plain email with the court, Bangalore time, opponent and the public link", () => {
    const e = render("fixtures_released", payload, "https://sportshunt.in");
    expect(e.subject).toBe("Men's Singles draw is out: Whitefield Open");
    expect(e.text).toContain("Your first match: Court 2, Sun, 20 Dec, 9:00 am, against Rohan Shetty.");
    expect(e.text).toContain("Tournament page: https://sportshunt.in/t/whitefield-open-ab12");
    expect(render("event_cancelled", payload, "https://x.in").text).toContain("has been cancelled");
  });

  it("shares the public tournament page on WhatsApp", () => {
    const url = whatsappShare({ title: "Whitefield Open", slug: "whitefield-open-ab12", venue: "Smash Arena", startsAt: payload.at }, "https://sportshunt.in");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("https://sportshunt.in/t/whitefield-open-ab12");
  });
});

import { IMPORT_TEMPLATE, parseCsv, readEntriesCsv } from "../csv-import";

describe("CSV import", () => {
  it("parses quotes, commas and line breaks inside quotes, and Excel's BOM", () => {
    expect(parseCsv('﻿name,club\r\n"Rao, Arjun","The ""Smash"" Club"\r\n"Two\nLines",\r\n\r\n')).toEqual([
      ["name", "club"], ["Rao, Arjun", 'The "Smash" Club'], ["Two\nLines", ""],
    ]);
  });
  it("reads the template, a header in any order, or no header", () => {
    expect(readEntriesCsv(IMPORT_TEMPLATE).rows).toEqual([
      { name: "Arjun Rao", club: "Smash Academy", seed: 1 }, { name: "Kavya Menon", club: "", seed: 2 }, { name: "Rohan Shetty", club: "Shuttle Club", seed: null },
    ]);
    expect(readEntriesCsv("Seed,Name\n3,Meera").rows).toEqual([{ name: "Meera", club: "", seed: 3 }]);
    expect(readEntriesCsv("Ravi,Hawks,4\nDivya").rows).toEqual([{ name: "Ravi", club: "Hawks", seed: 4 }, { name: "Divya", club: "", seed: null }]);
  });
  it("lists every bad row and imports nothing", () => {
    const r = readEntriesCsv("name,club,seed\nAsha,,1\n,Hawks,2\nBala,,zero\nChitra,,1000");
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      "Row 3: the name is missing.",
      'Row 4: the seed "zero" isn\'t a number from 1 to 999.',
      'Row 5: the seed "1000" isn\'t a number from 1 to 999.',
    ]);
    expect(readEntriesCsv("name\n" + "x\n".repeat(129)).errors[0]).toMatch(/at most 128/);
    expect(readEntriesCsv("").errors).toEqual(["The file is empty."]);
  });
});

import { findClash, type Placed } from "./clash";

describe("moving one match", () => {
  const at = (hhmm: string) => `2030-03-01T${hhmm}:00+05:30`;
  const ms: Placed[] = [
    { id: "m1", court: "A", at: at("09:30"), a: "Arjun", b: "Kavya" },
    { id: "m2", court: "B", at: at("09:30"), a: "Rohan", b: "Meera" },
    { id: "m3", court: "B", at: at("10:05"), a: "Arjun", b: "Divya" },
    { id: "w", court: "C", at: at("09:30"), a: "Bye", b: "Ravi", walkover: true },
  ];
  it("refuses a busy court", () => {
    expect(findClash(ms, { id: "m2", court: "A", at: at("09:50") }, 35)).toEqual({ kind: "court", with: ms[0] });
  });
  it("refuses a player who is playing elsewhere", () => {
    expect(findClash(ms, { id: "m3", court: "C", at: at("09:45") }, 35)?.kind).toBe("player");
  });
  it("allows back-to-back slots and free courts, and ignores walkovers", () => {
    expect(findClash(ms, { id: "m2", court: "A", at: at("10:05") }, 35)).toBeNull();
    expect(findClash(ms, { id: "m2", court: "C", at: at("09:30") }, 35)).toBeNull();
  });
});

import { capFor, LAUNCH_SPORTS, scoreUnits } from "../sports";

describe("tennis and volleyball", () => {
  it("are launch sports with the right words and caps", () => {
    expect(LAUNCH_SPORTS).toEqual(expect.arrayContaining(["tennis", "volleyball"]));
    expect(scoreUnits("tennis")).toEqual({ part: "set", point: "game" });
    expect(scoreUnits("volleyball")).toEqual({ part: "set", point: "point" });
    expect(scoreUnits("badminton")).toEqual({ part: "game", point: "point" });
    expect([capFor("tennis", 6), capFor("badminton", 21), capFor("volleyball", 25)]).toEqual([7, 30, null]);
  });
  it("a tennis match is won in sets, including a tiebreak set", () => {
    const r = { bestOf: 3, pointsTo: 6, cap: capFor("tennis", 6) };
    expect(matchState([[6, 4], [6, 7], [7, 6]], r)).toEqual({ a: 2, b: 1, winner: "a" });
  });
});

import { answersFrom, fieldKey } from "../reg-fields";

describe("registration questions", () => {
  it("makes stable, unique keys from labels", () => {
    expect(fieldKey("T-shirt size", [])).toBe("t_shirt_size");
    expect(fieldKey("T-shirt size!", ["t_shirt_size"])).toBe("t_shirt_size_2");
    expect(fieldKey("??", [])).toBe("question");
  });
  it("collects only the event's questions from a form", () => {
    const fields = [{ key: "tshirt", label: "T-shirt", type: "choice" as const, options: ["S", "M"], required: true },
      { key: "note", label: "Note", type: "text" as const, required: false }];
    const form: Record<string, string> = { q_tshirt: "M", q_note: "  ", q_other: "x" };
    expect(answersFrom(fields, (k) => form[k])).toEqual({ tshirt: "M" });
  });
});

import { placings } from "../results";

describe("results", () => {
  const win = (seeds: string[]) => (a: string, b: string) => (seeds.indexOf(a) < seeds.indexOf(b) ? a : b);
  const finish = (ms: Match[], pick: (a: string, b: string) => string) => {
    let played = advance(ms, {});
    for (let guard = 0; guard < 200; guard++) {
      const m = played.find((x) => x.status === "scheduled" && x.a && x.b);
      if (!m) break;
      const w = pick(m.a!, m.b!);
      played = advance(ms, { ...Object.fromEntries(played.filter((x) => x.status === "done" && !x.walkover).map((x) => [x.key, { a: x.scoreA!, b: x.scoreB! }])),
        [m.key]: w === m.a ? { a: 2, b: 0 } : { a: 0, b: 2 } });
    }
    return played;
  };
  it("knockout: 1st, 2nd and joint 3rd", () => {
    const seeds = ids(8);
    const r = placings({ format: "knockout", entries: seeds, matches: finish(knockout(seeds), win(seeds)) });
    expect(r).toEqual([{ place: 1, name: "e1" }, { place: 2, name: "e2" }, { place: 3, name: "e4" }, { place: 3, name: "e3" }]);
  });
  it("league: the top four of the table", () => {
    const seeds = ids(5);
    expect(placings({ format: "league", entries: seeds, matches: finish(league(seeds), win(seeds)) }).map((p) => p.name)).toEqual(["e1", "e2", "e3", "e4"]);
  });
  it("double elimination: grand final, then the losers-bracket final", () => {
    const seeds = ids(4);
    const r = placings({ format: "double_elim", entries: seeds, matches: finish(doubleElim(seeds), win(seeds)) });
    expect(r.map((p) => [p.place, p.name])).toEqual([[1, "e1"], [2, "e2"], [3, "e3"]]);
  });
  it("nothing until the final is played", () => {
    expect(placings({ format: "knockout", entries: ids(4), matches: advance(knockout(ids(4)), {}) })).toEqual([]);
  });
});

import { payRef, upiLink, validUpiId } from "../upi";

describe("UPI to the organiser", () => {
  it("builds a UPI link any app opens, with amount, payee and reference", () => {
    const link = upiLink({ upiId: "ravi@okhdfcbank", payee: "Smash Arena", rupees: 500, note: "SH 3F9A2C1B Men's Singles" });
    expect(link.startsWith("upi://pay?")).toBe(true);
    const q = new URLSearchParams(link.split("?")[1]);
    expect([q.get("pa"), q.get("pn"), q.get("am"), q.get("cu"), q.get("tn")]).toEqual(["ravi@okhdfcbank", "Smash Arena", "500.00", "INR", "SH 3F9A2C1B Men's Singles"]);
    expect(link).not.toContain("+");
  });
  it("checks UPI IDs and makes short references", () => {
    expect(["ravi@okhdfcbank", "smash.arena-1@ybl"].every(validUpiId)).toBe(true);
    expect(["ravi", "ravi@", "@ybl", "ravi@ok hdfc", "ravi@123"].some(validUpiId)).toBe(false);
    expect(payRef("3f9a2c1b-0000-4000-8000-000000000000")).toBe("SH 3F9A2C1B");
  });
});
