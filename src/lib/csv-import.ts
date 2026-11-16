// Reading an organiser's entries CSV (P1.1). Columns: name, club, seed. Header row optional, any column order.

export const IMPORT_MAX_ROWS = 128;
export const IMPORT_TEMPLATE = "name,club,seed\r\nArjun Rao,Smash Academy,1\r\nKavya Menon,,2\r\nRohan Shetty,Shuttle Club,\r\n";

/** Splits CSV text into rows of cells: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRow = { name: string; club: string; seed: number | null };

/** Turns CSV text into entries, with every problem listed by row number. Nothing is imported if anything is wrong. */
export function readEntriesCsv(text: string): { rows: ImportRow[]; errors: string[] } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], errors: ["The file is empty."] };
  const head = all[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.includes("name");
  const col = (k: string, fallback: number) => (hasHeader ? head.indexOf(k) : fallback);
  const [ni, ci, si] = [col("name", 0), col("club", 1), col("seed", 2)];
  const body = hasHeader ? all.slice(1) : all;
  const firstLine = hasHeader ? 2 : 1;

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  if (body.length > IMPORT_MAX_ROWS) errors.push(`Import at most ${IMPORT_MAX_ROWS} entries at a time; this file has ${body.length}.`);
  body.forEach((r, i) => {
    const line = firstLine + i;
    const name = (r[ni] ?? "").trim();
    const club = ci >= 0 ? (r[ci] ?? "").trim() : "";
    const rawSeed = si >= 0 ? (r[si] ?? "").trim() : "";
    if (!name) errors.push(`Row ${line}: the name is missing.`);
    else if (name.length > 80) errors.push(`Row ${line}: the name is longer than 80 characters.`);
    if (club.length > 80) errors.push(`Row ${line}: the club is longer than 80 characters.`);
    const seed = rawSeed === "" ? null : Number(rawSeed);
    if (seed !== null && !(Number.isInteger(seed) && seed >= 1 && seed <= 999)) errors.push(`Row ${line}: the seed "${rawSeed}" isn't a number from 1 to 999.`);
    rows.push({ name, club, seed });
  });
  return { rows: errors.length ? [] : rows, errors };
}
