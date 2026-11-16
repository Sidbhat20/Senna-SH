// Player notifications (P0.4): queue rows in Postgres, send them, record the result.
import { EMAIL_NOT_SET_UP, sendEmail, type Email, type Send } from "./email";

export type Kind = "fixtures_released" | "schedule_update" | "match_called" | "event_cancelled" | "general_info" | "promotion";
export type Payload = {
  event: string; slug: string; venue: string; category: string; entry: string;
  court: string | null; at: string | null; opponent: string | null;
  message?: string; // general_info and promotion: the organiser's own words
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
    case "general_info":
      return { subject: `Update from ${p.event}`, text: body([`Hi ${p.entry || "there"},`, "", p.message ?? ""]) };
    case "promotion":
      return { subject: `${p.event}: entries are open`, text: body([`Hi ${p.entry || "there"},`, "", p.message ?? "", "",
        `You played one of our tournaments before, so we thought you'd like to know. ${p.event}, ${p.at ? `${when(p.at)}, ` : ""}${p.venue}.`]) };
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
  return sendQueued(sb, (data ?? []) as Queued[]);
}

/** An organiser's own message (general info, or promotion to past players): queued once per person per message. */
export async function announce(sb: Rpc, eventId: string, kind: "general_info" | "promotion", message: string, send?: Send): Promise<string> {
  const { data, error } = await sb.rpc("queue_message", { p_event: eventId, p_kind: kind, p_message: message });
  if (error) return `Emails weren't sent: ${error.message}`;
  return sendQueued(sb, (data ?? []) as Queued[], send);
}

async function sendQueued(sb: Rpc, rows: Queued[], send?: Send): Promise<string> {
  if (!rows.length) return "No one new to email: they've had this already, or have no email address.";
  const res = await deliver(rows, send);
  if (res.sent.length) await sb.rpc("mark_notifications", { p_ids: res.sent, p_error: null });
  if (res.failed.length) await sb.rpc("mark_notifications", { p_ids: res.failed, p_error: res.error });
  if (!res.failed.length) return `Emailed ${res.sent.length} ${res.sent.length === 1 ? "player" : "players"}.`;
  if (res.error === EMAIL_NOT_SET_UP) return `${res.failed.length} emails are queued but not sent: email isn't set up yet.`;
  return `Emailed ${res.sent.length}; ${res.failed.length} didn't go (${res.error}).`;
}

/** Share targets for the public event page: plain web intents, no SDKs. Instagram has no web intent, so it's copy-link. */
export function shareLinks(ev: { title: string; slug: string; venue: string; startsAt: string }, site = siteUrl()) {
  const url = `${site}/t/${ev.slug}`;
  const text = `${ev.title}, ${when(ev.startsAt)} at ${ev.venue}`;
  return {
    url,
    whatsapp: whatsappShare(ev, site),
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  };
}

/** A WhatsApp share of the public event page; no WhatsApp Business account needed. */
export function whatsappShare(ev: { title: string; slug: string; venue: string; startsAt: string }, site = siteUrl()) {
  const text = `${ev.title}, ${when(ev.startsAt)} at ${ev.venue}. Enter or follow the scores: ${site}/t/${ev.slug}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The WhatsApp version of a message. The organiser sends it from their own phone: no Business API. */
export function messageText(kind: "fixtures_released" | "schedule_update" | "general_info" | "promotion",
  ev: { title: string; slug: string; venue: string; startsAt: string }, message = "", site = siteUrl()) {
  const link = `${site}/t/${ev.slug}`;
  const lead = {
    fixtures_released: `The draw for ${ev.title} is out. Check your first match, court and time:`,
    schedule_update: `The order of play for ${ev.title} has changed. Check your new court and time:`,
    general_info: `${ev.title}:`,
    promotion: `${ev.title}, ${when(ev.startsAt)} at ${ev.venue}. Entries are open:`,
  }[kind];
  return [lead, message.trim(), link].filter(Boolean).join("\n\n");
}

/** wa.me link to one player (Indian numbers without a country code get +91), or to pick a chat when there's no phone. */
export function waLink(text: string, phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
