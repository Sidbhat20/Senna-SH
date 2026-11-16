// CSV exports for organisers (P0.6). Pure functions over the event the page already loads, so they're easy to test.
import type { CategoryDetail, DbMatch, EventDetail } from "./data";
import { roundName } from "./fixtures/rounds";
import { gamesText } from "./fixtures/scoring";
import { BYE } from "./fixtures/types";

type Cell = string | number | boolean | null | undefined;

// Cells starting with these run as formulas in Excel/Sheets; a leading apostrophe makes them plain text.
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = FORMULA.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 marker so Excel shows ₹ and Indian names correctly, and Windows line endings. */
export const toCsv = (rows: Cell[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const istTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "2026-12-20 08:30" in Bangalore time: sorts correctly as text in a spreadsheet. */
export const istStamp = (iso?: string) => (iso ? `${istDay.format(new Date(iso))} ${istTime.format(new Date(iso))}` : "");

const side = (n: string | null) => (n === BYE ? "Bye" : n ?? "To be decided");
const isReal = (m: DbMatch) => m.a !== BYE && m.b !== BYE;

export function matchLabel(c: CategoryDetail, m: DbMatch) {
  if (m.group) return `Group ${m.group}, round ${m.round}`;
  if (c.format === "league") return `Round ${m.round}`;
  const rounds = Math.max(...c.matches.filter((x) => x.stage === m.stage).map((x) => x.round));
  return roundName(m.stage, m.round, rounds);
}

function score(m: DbMatch) {
  if (m.scoreA === undefined || m.scoreB === undefined) return "";
  const pens = m.penA !== undefined && m.penB !== undefined ? ` (pens ${m.penA}-${m.penB})` : "";
  return `${m.scoreA}-${m.scoreB}${pens}`;
}

const STATUS: Record<DbMatch["status"], string> = { scheduled: "Scheduled", live: "In play", done: "Finished" };
const PAYMENT: Record<string, string> = { not_required: "Free", unpaid: "Unpaid", claimed: "Says paid", paid: "Paid", refunded: "Refunded" };

export type Contact = { email: string | null; phone: string | null };

export function entriesCsv(ev: EventDetail, contacts: Map<string, Contact>, answers: Map<string, Record<string, string>> = new Map(), payments: Map<string, string> = new Map()) {
  const qs = ev.regFields ?? [];
  const rows: Cell[][] = [["Category", "Entry", "Club", "Seed", "Status", "Payment", "Checked in", "ID seen", "Players", "Email", "Phone", "UPI reference", ...qs.map((q) => q.label)]];
  for (const c of ev.categories) {
    for (const e of c.entryRows) {
      const who = contacts.get(e.id);
      rows.push([
        c.name, e.name, e.club, e.seed, e.status[0].toUpperCase() + e.status.slice(1), PAYMENT[e.paymentStatus] ?? e.paymentStatus,
        e.checkedIn, e.idChecked, e.roster.join("; "), who?.email, who?.phone, payments.get(e.id) ?? "", ...qs.map((q) => answers.get(e.id)?.[q.key] ?? ""),
      ]);
    }
  }
  return toCsv(rows);
}

export function fixturesCsv(ev: EventDetail) {
  const rows: Cell[][] = [["Category", "Round", "Side A", "Side B", "Score", "Games", "Winner", "Status", "Court", "Time"]];
  for (const c of ev.categories) {
    for (const m of c.matches.filter(isReal)) {
      rows.push([
        c.name, matchLabel(c, m), side(m.a), side(m.b), score(m), gamesText(m.games), m.winner ?? "",
        m.walkover ? "Walkover" : STATUS[m.status], m.court ?? "", istStamp(m.at),
      ]);
    }
  }
  return toCsv(rows);
}

export function orderOfPlayCsv(ev: EventDetail) {
  const courtOrder = new Map(ev.courts.map((c, i) => [c.id, i]));
  const ms = ev.categories
    .flatMap((c) => c.matches.filter((m) => isReal(m) && !m.walkover && m.at && m.courtId).map((m) => ({ c, m })))
    .sort((x, y) => courtOrder.get(x.m.courtId!)! - courtOrder.get(y.m.courtId!)! || x.m.at!.localeCompare(y.m.at!));
  const rows: Cell[][] = [["Court", "Time", "Category", "Round", "Side A", "Side B", "Status"]];
  for (const { c, m } of ms) rows.push([m.court ?? "", istStamp(m.at), c.name, matchLabel(c, m), side(m.a), side(m.b), STATUS[m.status]]);
  return toCsv(rows);
}
