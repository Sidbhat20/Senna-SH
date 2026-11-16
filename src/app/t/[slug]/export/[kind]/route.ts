import { entryAnswers, entryContacts, getEvent, paymentClaims } from "@/lib/data";
import { entriesCsv, fixturesCsv, orderOfPlayCsv, paymentsCsv } from "@/lib/exports";
import { paymentRows } from "@/lib/payments";

const KINDS = ["entries", "payments", "fixtures", "order-of-play"] as const;
type Kind = (typeof KINDS)[number];

/** ?ids=a,b,c limits the entries download to the ones ticked on the entries desk. */
const selected = (req: Request) => {
  const ids = new URL(req.url).searchParams.get("ids");
  return ids ? new Set(ids.split(",")) : undefined;
};

/** CSV downloads for an event's managers. Everyone else gets 403; the database also refuses contact details to them. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Not found", { status: 404 });
  const ev = await getEvent(slug);
  if (!ev) return new Response("Not found", { status: 404 });
  if (!ev.canManage) return new Response("Not allowed", { status: 403 });

  const csv =
    kind === "entries" ? entriesCsv(ev, await entryContacts(ev.id), await entryAnswers(ev.id), await paymentClaims(ev.id), selected(req))
    : kind === "payments" ? paymentsCsv(ev, paymentRows(ev, await paymentClaims(ev.id)))
    : kind === "fixtures" ? fixturesCsv(ev)
    : orderOfPlayCsv(ev);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}-${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
