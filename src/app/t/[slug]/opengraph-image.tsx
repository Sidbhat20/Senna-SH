import { ImageResponse } from "next/og";
import { sportName } from "@/components/ui";
import { getEvent } from "@/lib/data";

export const alt = "Tournament on Sportshunt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Per-event share card: the organiser's poster when there is one, otherwise a pitch card with the title. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const ev = await getEvent((await params).slug);
  const title = ev?.title ?? "Sportshunt";
  const meta = ev ? `${sportName(ev)} · ${day.format(new Date(ev.startsAt))} · ${ev.venue}` : "Tournaments in Bangalore";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #0E2416, #07140C)", color: "#F3F5EE" }}>
        {ev?.posterUrl && (
          <img src={ev.posterUrl} alt="" width={445} height={630} style={{ objectFit: "cover" }} />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64 }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#F5C518", fontWeight: 700 }}>SPORTSHUNT</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: title.length > 28 ? 72 : 96, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2 }}>{title}</div>
            <div style={{ marginTop: 24, fontSize: 32, color: "#B7C5B8" }}>{meta}</div>
          </div>
          <div style={{ display: "flex", height: 6, width: 200, background: "#3DCC5A", borderRadius: 3 }} />
        </div>
      </div>
    ),
    size,
  );
}
