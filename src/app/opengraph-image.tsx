import { ImageResponse } from "next/og";

export const alt = "Sportshunt: tournaments in Bangalore";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The default share card: pitch-dark, court lines, floodlight, wordmark. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72,
        background: "radial-gradient(circle at 85% 10%, rgba(245,197,24,0.35), transparent 40%), linear-gradient(135deg, #0E2416, #07140C)", color: "#F3F5EE" }}>
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 4, color: "#F5C518", fontWeight: 700 }}>SPORTSHUNT</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 0.9, letterSpacing: -3 }}>Get, set, hunt.</div>
          <div style={{ marginTop: 24, fontSize: 36, color: "#B7C5B8" }}>Find a tournament in Bangalore, or run your own with live scores.</div>
        </div>
        <div style={{ display: "flex", height: 6, width: 240, background: "#3DCC5A", borderRadius: 3 }} />
      </div>
    ),
    size,
  );
}
