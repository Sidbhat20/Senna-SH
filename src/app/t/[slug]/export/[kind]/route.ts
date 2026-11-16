import { entryContacts, getEvent } from "@/lib/data";
import { entriesCsv, fixturesCsv, orderOfPlayCsv } from "@/lib/exports";

const KINDS = ["entries", "fixtures", "order-of-play"] as const;
type Kind = (typeof KINDS)[number];

/** CSV downloads for an event's managers. Everyone else gets 403; the database also refuses contact details to them. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Not found", { status: 404 });
  const ev = await getEvent(slug);
  if (!ev) return new Response("Not found", { status: 404 });
  if (!ev.canManage) return new Response("Not allowed", { status: 403 });

  const csv =
    kind === "entries" ? entriesCsv(ev, await entryContacts(ev.id))
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
