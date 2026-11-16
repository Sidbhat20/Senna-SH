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
        { id: "e1", name: "Arjun Rao", club: "Smash", seed: 1, status: "confirmed", paymentStatus: "paid", checkedIn: true, idChecked: false, roster: [], source: "online" },
        { id: "e2", name: "Walk-in", club: "", seed: null, status: "confirmed", paymentStatus: "not_required", checkedIn: false, idChecked: false, roster: [], source: "offline" },
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
    expect(lines[0]).toBe("Category,Entry,Club,Source,Seed,Status,Payment,Amount (INR),Paid to UPI ID,UPI reference,Reported at,Checked in,ID seen,Players,Email,Phone");
    expect(lines[1]).toBe("Men's Singles,Arjun Rao,Smash,Online,1,Confirmed,Paid,,,,,Yes,No,,arjun@example.com,'+919000000000");
    expect(lines[2]).toBe("Men's Singles,Walk-in,,Walk-in / import,,Confirmed,Free,,,,,No,No,,,");
  });

  it("entries download can be limited to the ticked rows", () => {
    const lines = entriesCsv(ev, new Map(), new Map(), new Map(), new Set(["e2"])).replace("\uFEFF", "").trim().split("\r\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("Walk-in / import");
  });

  it("entries carry amount, organiser VPA, UTR and when it was reported, for reconciliation", () => {
    const paid = { ...ev, upiId: "smash@okhdfcbank", categories: ev.categories.map((c) => ({ ...c, entryFee: 500 })) } as EventDetail;
    const lines = entriesCsv(paid, new Map(), new Map(), new Map([["e1", { ref: "412345678901", claimedAt: "2026-12-01T04:30:00Z" }]]))
      .replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[1]).toContain(",Paid,500,smash@okhdfcbank,412345678901,2026-12-01 10:00,");
    expect(lines[2]).toContain(",Free,500,smash@okhdfcbank,,,");
  });

  it("order of play is by court then time, without byes", () => {
    const lines = orderOfPlayCsv(ev).replace("﻿", "").trim().split("\r\n");
    expect(lines.slice(1)).toEqual([
      "Court 1,2026-12-20 09:30,Men's Singles,Final,Ravi,Meera,Scheduled",
      "Court 2,2026-12-20 09:00,Men's Singles,Semi-finals,Arjun Rao,Walk-in,Scheduled",
    ]);
  });
});

import { courtFor } from "../courtFor";

describe("scoring queue", () => {
  it("co-organisers score every court, referees only theirs, owners every court", () => {
    const m = courtFor([
      { event_id: "ev1", court_id: null, role: "co_organiser" },
      { event_id: "ev2", court_id: "c2", role: "referee" },
    ], [{ id: "ev3" }]);
    expect([...m]).toEqual([["ev1", null], ["ev2", "c2"], ["ev3", null]]);
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
    const ref = payRef("3f9a2c1b-0000-4000-8000-000000000000");
    const link = upiLink({ upiId: "ravi@okhdfcbank", payee: "Smash Arena", rupees: 500, ref, note: `${ref} Men's Singles entry` });
    expect(link.startsWith("upi://pay?")).toBe(true);
    const q = new URLSearchParams(link.split("?")[1]);
    expect([q.get("pa"), q.get("pn"), q.get("am"), q.get("cu"), q.get("tn")]).toEqual(["ravi@okhdfcbank", "Smash Arena", "500.00", "INR", "SH3F9A2C1B Men's Singles entry"]);
    const tr = q.get("tr")!;
    expect(tr).toBe(ref);
    expect(tr.length).toBeLessThanOrEqual(35);
    expect(tr).not.toMatch(/\s/);
    expect(upiLink({ upiId: "a@ybl", payee: "x", rupees: 1, ref: "A B ".repeat(20), note: "n" }).match(/tr=([^&]+)/)![1].length).toBeLessThanOrEqual(35);
    expect(link).not.toContain("+");
  });
  it("checks UPI IDs and makes short references", () => {
    expect(["ravi@okhdfcbank", "smash.arena-1@ybl"].every(validUpiId)).toBe(true);
    expect(["ravi", "ravi@", "@ybl", "ravi@ok hdfc", "ravi@123"].some(validUpiId)).toBe(false);
    expect(payRef("3f9a2c1b-0000-4000-8000-000000000000")).toBe("SH3F9A2C1B");
  });
});

import { QUIET, qrPath } from "../qr";

describe("UPI QR", () => {
  const link = upiLink({ upiId: "ravi@okhdfcbank", payee: "Smash Arena", rupees: 500, ref: "SH3F9A2C1B", note: "SH3F9A2C1B Men's Singles entry" });
  it("encodes the pay link at a standard QR size with the quiet zone", () => {
    const { size, d } = qrPath(link);
    const modules = size - QUIET * 2;
    expect((modules - 21) % 4).toBe(0); // QR versions are 21, 25, 29... modules wide
    expect(modules).toBeGreaterThanOrEqual(29);
    expect(d.length).toBeGreaterThan(100);
    expect(qrPath(link)).toEqual({ size, d }); // deterministic
  });
  it("has the three finder squares in the corners", () => {
    const { size, d } = qrPath(link);
    const dark = new Set(d.match(/M\d+ \d+/g)!.map((m) => m.slice(1)));
    const n = size - QUIET * 2;
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      expect(dark.has(`${x + QUIET} ${y + QUIET}`)).toBe(true); // finder corner
      expect(dark.has(`${x + QUIET + 1} ${y + QUIET + 1}`)).toBe(false); // finder's white ring
    }
  });
});

import { CONFIRM_ERROR, isConfirmed } from "../confirm";
import { kpis, readiness, readyToDraw } from "../overview";

describe("confirm dialog guard", () => {
  it("only confirm=yes lets a destructive action run", () => {
    const f = new FormData();
    expect(isConfirmed(f)).toBe(false);
    f.set("confirm", "on");
    expect(isConfirmed(f)).toBe(false);
    f.set("confirm", "yes");
    expect(isConfirmed(f)).toBe(true);
    expect(CONFIRM_ERROR).toMatch(/confirm/);
  });
});

describe("organiser overview", () => {
  const entry = (id: string, status: string, paymentStatus: string) =>
    ({ id, name: id, club: "", seed: null, status, paymentStatus, checkedIn: false, idChecked: false, roster: [] });
  const base = {
    slug: "x", venue: "Smash Arena", rules: ["Feather shuttles"], upiId: null, regClosesAt: "2099-01-01T00:00:00Z", startsAt: "2099-01-02T00:00:00Z",
    courts: [{ id: "c1", name: "Court 1" }],
    categories: [{
      id: "k1", name: "Open", format: "knockout", status: "open", maxEntries: 8, entryFee: 500, matches: [],
      entryRows: [entry("a", "confirmed", "paid"), entry("b", "pending", "unpaid"), entry("c", "pending", "claimed"), entry("d", "withdrawn", "unpaid")],
    }],
  } as unknown as EventDetail;

  it("counts entries, fees due and spots left", () => {
    const k = kpis(base);
    expect([k.confirmed, k.pending, k.withdrawn]).toEqual([1, 2, 1]);
    expect(k.unpaid).toEqual({ count: 1, rupees: 500 });
    expect(k.claimed).toEqual({ count: 1, rupees: 500 });
    expect(k.spotsLeft).toBe(5); // 8 places, 3 still held (withdrawn frees one)
    expect(k.next).toBeNull();
  });

  it("isn't ready to draw until there are enough confirmed entries", () => {
    expect(readyToDraw(base)).toBe(false); // one confirmed
    const two = structuredClone(base);
    two.categories[0].entryRows[1].status = "confirmed";
    expect(readyToDraw(two)).toBe(true);
    const groups = structuredClone(two);
    groups.categories[0].format = "groups_knockout"; // groups need four
    expect(readyToDraw(groups)).toBe(false);
  });

  it("readiness asks for a UPI ID only when a category has a fee, and links each row", () => {
    const checks = readiness(base, 0);
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
    expect(byKey.upi.done).toBe(false);
    expect(byKey.upi.href).toBe("/manage/settings#fees");
    expect(byKey.details.done).toBe(true);
    expect(byKey.enough.done).toBe(false);
    expect(byKey.drawn.done).toBe(false);
    expect(byKey.staff.done).toBe(false);
    const free = structuredClone(base);
    free.categories[0].entryFee = 0;
    expect(readiness(free, 1).some((c) => c.key === "upi")).toBe(false);
  });
});

import { filterEvents } from "../organise";
import { shareLinks } from "../notify";

describe("organiser home", () => {
  const evs = [
    { title: "Whitefield Smash Open", sport: "badminton", status: "open" as const },
    { title: "Koramangala Futsal Cup", sport: "futsal", status: "completed" as const },
  ];
  it("searches titles and filters by sport and status", () => {
    expect(filterEvents(evs, {}).length).toBe(2);
    expect(filterEvents(evs, { q: "  smash " }).map((e) => e.sport)).toEqual(["badminton"]);
    expect(filterEvents(evs, { sport: "futsal" }).map((e) => e.status)).toEqual(["completed"]);
    expect(filterEvents(evs, { status: "open", sport: "futsal" })).toEqual([]);
  });

  it("every share target points at the public event page", () => {
    const s = shareLinks({ title: "Whitefield Open", slug: "whitefield-open-ab12", venue: "Smash Arena", startsAt: "2026-12-20T03:30:00Z" }, "https://sportshunt.in");
    const page = "https://sportshunt.in/t/whitefield-open-ab12";
    expect(s.url).toBe(page);
    for (const href of [s.whatsapp, s.x, s.facebook]) expect(decodeURIComponent(href)).toContain(page);
  });
});

import { filterPayments, paymentRows, paymentTotals } from "../payments";
import { paymentsCsv } from "../exports";

describe("payments desk", () => {
  const e = (id: string, status: string, paymentStatus: string) =>
    ({ id, name: `Player ${id}`, club: "", seed: null, status, paymentStatus, checkedIn: false, idChecked: false, roster: [], source: "online" });
  const ev = {
    upiId: "smash@okhdfcbank",
    categories: [
      { name: "Open", entryFee: 500, entryRows: [e("a", "pending", "unpaid"), e("b", "pending", "claimed"), e("c", "confirmed", "paid"), e("d", "confirmed", "paid"), e("x", "withdrawn", "unpaid")] },
      { name: "Kids", entryFee: 0, entryRows: [e("f", "confirmed", "not_required")] },
      { name: "Vets", entryFee: 300, entryRows: [e("r", "withdrawn", "refunded")] },
    ],
  } as unknown as EventDetail;
  const claims = new Map([["b", { ref: "412345678901", claimedAt: "2026-12-01T04:30:00Z" }], ["c", { ref: "512345678901", claimedAt: "2026-12-01T05:00:00Z" }]]);
  const rows = paymentRows(ev, claims);

  it("splits due, claimed, UPI, cash and refunded, in rupees", () => {
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "r"]); // free and withdrawn-unpaid entries left out
    expect(paymentTotals(rows)).toEqual({
      due: { count: 1, rupees: 500 }, claimed: { count: 1, rupees: 500 }, upi: { count: 1, rupees: 500 },
      cash: { count: 1, rupees: 500 }, refunded: { count: 1, rupees: 300 },
    });
  });

  it("filters by state or mode and searches names and UTRs", () => {
    expect(filterPayments(rows, "cash").map((r) => r.id)).toEqual(["d"]);
    expect(filterPayments(rows, "claimed").map((r) => r.id)).toEqual(["b"]);
    expect(filterPayments(rows, "all", "5123").map((r) => r.id)).toEqual(["c"]);
    expect(filterPayments(rows, "all", "player a").map((r) => r.id)).toEqual(["a"]);
  });

  it("exports a ledger with amount, mode, VPA and UTR", () => {
    const lines = paymentsCsv(ev, rows).replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Category,Entry,Amount (INR),Status,Mode,Paid to UPI ID,UPI reference,Reported at");
    expect(lines[3]).toBe("Open,Player c,500,Paid,UPI,smash@okhdfcbank,512345678901,2026-12-01 10:30");
    expect(lines[4]).toBe("Open,Player d,500,Paid,Cash,,,");
  });
});

import { announce, messageText, waLink } from "../notify";

describe("announcements", () => {
  const ev = { title: "Whitefield Open", slug: "whitefield-open-ab12", venue: "Smash Arena", startsAt: "2026-12-20T03:30:00Z" };

  it("general info emails carry the organiser's message, through a stub transport, and are marked sent", async () => {
    const rpcs: [string, Record<string, unknown>][] = [];
    const queued = [{ id: "n1", email: "a@x.in", kind: "general_info", payload: { event: ev.title, slug: ev.slug, venue: ev.venue, category: "", entry: "Asha", court: null, at: null, opponent: null, message: "Parking at gate 2" } }];
    const sb = { rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push([fn, args]); return { data: fn === "queue_message" ? queued : null, error: null }; } };
    const outbox: string[] = [];
    const told = await announce(sb, "ev1", "general_info", "Parking at gate 2", async (e) => { outbox.push(`${e.to}|${e.text}`); return { ok: true }; });
    expect(told).toBe("Emailed 1 player.");
    expect(outbox[0]).toMatch(/^a@x\.in\|Hi Asha,\n\nParking at gate 2/);
    expect(rpcs.map(([fn]) => fn)).toEqual(["queue_message", "mark_notifications"]);
  });

  it("a refused send (stranger, draft) reports back and emails nobody", async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: "Only this event's organisers can send messages" } }) };
    let sent = 0;
    expect(await announce(sb, "ev1", "promotion", "Hello", async () => { sent++; return { ok: true }; })).toMatch(/organisers/);
    const empty = { rpc: async () => ({ data: [], error: null }) };
    expect(await announce(empty, "ev1", "general_info", "Hello", async () => { sent++; return { ok: true }; })).toMatch(/No one new/);
    expect(sent).toBe(0);
  });

  it("WhatsApp templates link the public page; Indian numbers get +91", () => {
    const t = messageText("fixtures_released", ev, "", "https://sportshunt.in");
    expect(t).toContain("https://sportshunt.in/t/whitefield-open-ab12");
    expect(waLink("hi", "98765 43210")).toBe("https://wa.me/919876543210?text=hi");
    expect(waLink("hi", "+91 98765 43210")).toBe("https://wa.me/919876543210?text=hi");
    expect(waLink("hi")).toBe("https://wa.me/?text=hi");
  });
});

import { matchCounts } from "../overview";

describe("fixtures counters", () => {
  it("counts live, to play and done, without byes", () => {
    const m = (status: string, b: string | null = "B") => ({ a: "A", b, status });
    expect(matchCounts([m("live"), m("scheduled"), m("scheduled", BYE), m("done"), m("done")])).toEqual({ live: 1, scheduled: 1, done: 2 });
  });
});

import { timeline } from "../timeline";

describe("schedule timeline", () => {
  it("places matches by court and minute, one lane per day, skipping byes and unscheduled ones", () => {
    const m = (id: string, courtId: string | null, at: string | undefined, b = "B") => ({ id, courtId, at, status: "scheduled", a: "A", b, category: "Open", walkover: false });
    const days = timeline([
      m("1", "c1", "2026-12-20T03:30:00Z"), m("2", "c2", "2026-12-20T04:00:00Z"), m("3", "c1", "2026-12-21T03:30:00Z"),
      m("4", "c1", undefined), m("5", "c2", "2026-12-20T05:00:00Z", BYE),
    ], [{ id: "c1", name: "Court 1" }, { id: "c2", name: "Court 2" }], 25, BYE);
    expect(days.map((d) => d.day)).toEqual(["2026-12-20", "2026-12-21"]);
    expect(days[0].minutes).toBe(55); // 09:00 to 09:55
    expect(days[0].courts.map((c) => c.blocks.map((b) => [b.id, b.left, b.width]))).toEqual([[["1", 0, 25]], [["2", 30, 25]]]);
  });
});

import { swapProblem, swapSides } from "./swap";

describe("drag-swap", () => {
  const m = (a: string | null, b: string | null, extra: Partial<{ stage: string; round: number; status: string }> = {}) =>
    ({ stage: "knockout", round: 1, status: "scheduled", a, b, categoryId: "c1", ...extra });

  it("swaps two sides between first-round matches", () => {
    const [x, y] = swapSides(m("Arjun", "Ravi"), "b", m("Meera", "Kavya"), "a");
    expect([x.a, x.b, y.a, y.b]).toEqual(["Arjun", "Meera", "Ravi", "Kavya"]);
    expect(swapProblem(m("Arjun", "Ravi"), "b", m("Meera", "Kavya"), "a")).toBeNull();
  });

  it("refuses finished, live, later-round, group and bye matches", () => {
    const ok = m("Meera", "Kavya");
    expect(swapProblem(m("A", "B", { status: "done" }), "a", ok, "a")).toMatch(/started or finished/);
    expect(swapProblem(m("A", "B", { status: "live" }), "a", ok, "a")).toMatch(/started or finished/);
    expect(swapProblem(m("A", "B", { round: 2 }), "a", ok, "a")).toMatch(/first-round/);
    expect(swapProblem(m("A", "B", { stage: "group" }), "a", ok, "a")).toMatch(/first-round/);
    expect(swapProblem(m("A", BYE), "a", ok, "a")).toMatch(/bye/);
    expect(swapProblem(ok, "a", { ...ok, categoryId: "c2" }, "a")).toMatch(/same category/);
    expect(swapProblem(ok, "a", ok, "b", true)).toMatch(/different/);
  });
});

import { amountDue } from "../payments";

describe("discounted fees", () => {
  it("an entry with a code pays its own amount everywhere fees are counted", () => {
    expect(amountDue({ entryFee: 500 }, { feeDue: null })).toBe(500);
    expect(amountDue({ entryFee: 500 }, { feeDue: 400 })).toBe(400);
    const e = (id: string, feeDue: number | null) => ({ id, name: id, club: "", seed: null, status: "pending", paymentStatus: "unpaid", checkedIn: false, idChecked: false, roster: [], source: "online", feeDue });
    const ev = { categories: [{ name: "Open", entryFee: 500, entryRows: [e("a", 400), e("b", null)] }] } as unknown as EventDetail;
    expect(paymentTotals(paymentRows(ev, new Map())).due).toEqual({ count: 2, rupees: 900 });
  });
});

import { readPoster, POSTER_AI_NOT_SET_UP } from "../poster-ai";
import { toDraft } from "../poster-draft";

describe("Smart Create from a poster", () => {
  const image = { base64: "AAAA", mediaType: "image/png" as const };
  const reply = {
    title: "  Whitefield   Smash Open 2026 ", sport: "Badminton", venue: "Smash Arena", area: "Whitefield",
    start_date: "2026-12-20", start_time: "07:30", prize: "₹50,000 pool", rules: ["Feather shuttles", ""],
    categories: [
      { name: "Men's Singles", format: "knockout", entry_type: "solo", entry_fee: 600, max_entries: 32 },
      { name: "Mixed Doubles", format: "swiss", entry_type: "duo", entry_fee: -5, max_entries: 999 },
      { name: "men's singles", format: null, entry_type: null, entry_fee: null, max_entries: null },
    ],
  };

  it("a stubbed vision reply fills the draft, cleaned to the wizard's rules", async () => {
    const res = await readPoster(image, async () => ({ stop_reason: "end_turn", parsed_output: reply }));
    expect(res.ok).toBe(true);
    expect(res.draft).toMatchObject({ title: "Whitefield Smash Open 2026", sport: "badminton", startDate: "2026-12-20", startTime: "07:30", rules: ["Feather shuttles"] });
    expect(res.draft.categories).toEqual([
      { name: "Men's Singles", format: "knockout", entryType: "solo", entryFee: 600, maxEntries: 32 },
      { name: "Mixed Doubles", format: null, entryType: null, entryFee: null, maxEntries: null }, // unknown values dropped, duplicate skipped
    ]);
  });

  it("malformed replies, refusals and errors never throw and leave an empty draft for the manual wizard", async () => {
    for (const junk of [null, "not json", [1, 2], { title: 42, start_date: "2026-02-30", categories: "lots" }]) {
      const res = await readPoster(image, async () => ({ stop_reason: "end_turn", parsed_output: junk }));
      expect(res.ok).toBe(false);
      expect(res.draft.categories).toEqual([]);
    }
    expect((await readPoster(image, async () => ({ stop_reason: "refusal" }))).ok).toBe(false);
    const boom = await readPoster(image, async () => { throw new Error("socket hang up"); });
    expect(boom).toMatchObject({ ok: false, error: expect.stringMatching(/Fill in the details yourself/) });
    expect(await readPoster(image, null)).toMatchObject({ ok: false, error: POSTER_AI_NOT_SET_UP });
  });

  it("drafts carry no ids, organisers or statuses, so nothing can publish without the wizard", () => {
    const d = toDraft({ ...reply, id: "x", organiser_id: "y", status: "open" });
    expect(Object.keys(d).sort()).toEqual(["area", "categories", "prize", "rules", "sport", "startDate", "startTime", "title", "venue"]);
  });
});
