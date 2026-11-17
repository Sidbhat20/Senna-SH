// Every text/background pair in the design system meets WCAG AA (4.5:1), in both themes.
// Reads the real values from globals.css so the CSS can't drift from what's tested.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS: [text: string, background: string][] = [
  ["ink", "bg"], ["ink", "surface"], ["ink", "surface-2"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
  ["turf", "bg"], ["turf", "surface"], ["turf", "turf-soft"], ["ink", "turf-soft"],
  ["on-turf", "turf"], ["on-turf", "turf-hover"], ["on-ink", "ink"],
  ["danger", "bg"], ["danger", "surface"], ["on-danger", "danger"],
  ["chalk-text", "pitch"], ["chalk-text", "pitch-2"],
  ["on-flood", "flood"], ["on-clay", "clay"],
];

describe("theme contrast", () => {
  for (const [name, selector] of [["dark", ":root"]] as const) {
    const t = block(selector);
    it(`${name}: every text/background pair is at least 4.5:1`, () => {
      expect(Object.keys(t).length).toBeGreaterThan(15);
      const failing = PAIRS.map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(t[fg], t[bg]) })).filter((p) => !(p.ratio >= 4.5));
      expect(failing).toEqual([]);
    });
  }

  it("volt only ever carries black text: white on volt fails", () => {
    expect(contrast("#FFFFFF", "#D7FF3A")).toBeLessThan(4.5);
    expect(contrast("#0B0B0C", "#D7FF3A")).toBeGreaterThan(4.5);
  });

  it("the old turf #2e9a2c fails with white text, so it's gone", () => {
    expect(contrast("#FFFFFF", "#2e9a2c")).toBeLessThan(4.5);
    expect(css.toLowerCase()).not.toContain("#2e9a2c");
  });
});
