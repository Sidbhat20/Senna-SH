import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveTicker } from "./LiveTicker";

describe("live ticker", () => {
  it("renders nothing when no match is live (no dead LIVE bar)", () => {
    expect(renderToStaticMarkup(createElement(LiveTicker, { items: [] }))).toBe("");
  });

  it("shows each live match with its score under a labelled region", () => {
    const html = renderToStaticMarkup(createElement(LiveTicker, {
      items: [{ id: "m1", label: "Court 1 · Final", a: "Player A", b: "Player B", scoreA: 15, scoreB: 12, href: "/t/x" }],
    }));
    expect(html).toContain('aria-label="Live now"');
    expect(html).toContain("Player A");
    expect(html).toContain("15–12");
  });
});
