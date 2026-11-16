// Player notifications (P0.4): queue rows in Postgres, send them, record the result.
import { EMAIL_NOT_SET_UP, sendEmail, type Email, type Send } from "./email";

export type Kind = "fixtures_released" | "schedule_update" | "match_called" | "event_cancelled";
export type Payload = {
  event: string; slug: string; venue: string; category: string; entry: string;
  court: string | null; at: string | null; opponent: string | null;
};
export type Queued = { id: string; email: string; kind: Kind; payload: Payload };

/** The public site address, for links in emails and shares. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    .format(new Date(iso));

/** Plain-text email for one player. Plain text keeps names from ever being treated as markup. */
export function render(kind: Kind, p: Payload, site = siteUrl()): Omit<Email, "to"> {
  const link = `${site}/t/${p.slug}`;
  const next = p.at
    ? `Your ${kind === "match_called" ? "match" : "first match"}: ${p.court ? `${p.court}, ` : ""}${when(p.at)}${p.opponent ? `, against ${p.opponent}` : ""}.`
    : "Your court and time will be on the tournament page once they're set.";
  const body = (lines: string[]) => [...lines, "", `Tournament page: ${link}`, "", "Sportshunt"].join("\n");
  switch (kind) {
    case "fixtures_released":
      return { subject: `${p.category} draw is out: ${p.event}`, text: body([`Hi ${p.entry},`, "", `The draw for ${p.category} at ${p.event} is out.`, next]) };
    case "schedule_update":
      return { subject: `Order of play changed: ${p.event}`, text: body([`Hi ${p.entry},`, "", `The organiser has changed the order of play at ${p.event}.`, next]) };
    case "match_called":
      return { subject: `You're due on court: ${p.event}`, text: body([`Hi ${p.entry},`, "", `Please report to the desk now for your ${p.category} match at ${p.venue}.`, next]) };
    case "event_cancelled":
      return { subject: `Cancelled: ${p.event}`, text: body([`Hi ${p.entry},`, "", `${p.event} has been cancelled. Contact the organiser about any entry fee you paid.`]) };
  }
}

/** Sends each queued email; returns which went and which didn't (with the first error). Transport is injectable for tests. */
export async function deliver(rows: Queued[], send: Send = sendEmail) {
  const sent: string[] = [];
  const failed: string[] = [];
  let error: string | null = null;
  for (const r of rows) {
    const res = await send({ ...render(r.kind, r.payload), to: r.email });
    if (res.ok) sent.push(r.id);
    else {
      failed.push(r.id);
      error ??= res.error;
    }
  }
  return { sent, failed, error };
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Queue + send + record. Returns a sentence for the organiser. Never throws: a failed email mustn't undo a draw. */
export async function notify(
  sb: Rpc, eventId: string, kind: Kind, opts: { category?: string; match?: string; round?: string } = {},
): Promise<string> {
  const { data, error } = await sb.rpc("queue_notifications", {
    p_event: eventId, p_kind: kind, p_category: opts.category ?? null, p_match: opts.match ?? null, p_round: opts.round ?? "",
  });
  if (error) return `Emails weren't sent: ${error.message}`;
  const rows = (data ?? []) as Queued[];
  if (!rows.length) return "No players with an email address to tell.";
  const res = await deliver(rows);
  if (res.sent.length) await sb.rpc("mark_notifications", { p_ids: res.sent, p_error: null });
  if (res.failed.length) await sb.rpc("mark_notifications", { p_ids: res.failed, p_error: res.error });
  if (!res.failed.length) return `Emailed ${res.sent.length} ${res.sent.length === 1 ? "player" : "players"}.`;
  if (res.error === EMAIL_NOT_SET_UP) return `${res.failed.length} emails are queued but not sent: email isn't set up yet.`;
  return `Emailed ${res.sent.length}; ${res.failed.length} didn't go (${res.error}).`;
}

/** A WhatsApp share of the public event page; no WhatsApp Business account needed. */
export function whatsappShare(ev: { title: string; slug: string; venue: string; startsAt: string }, site = siteUrl()) {
  const text = `${ev.title}, ${when(ev.startsAt)} at ${ev.venue}. Enter or follow the scores: ${site}/t/${ev.slug}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
