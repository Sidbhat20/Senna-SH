import { sendAnnouncement } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { CopyText } from "@/components/CopyText";
import { getEvent, messageAudience, type AudienceRow, type EventDetail } from "@/lib/data";
import { emailConfigured } from "@/lib/email";
import { messageText, render, waLink } from "@/lib/notify";

type Kind = "fixtures_released" | "schedule_update" | "general_info" | "promotion";
const CARDS: { kind: Kind; title: string; blurb: string; own: boolean }[] = [
  { kind: "fixtures_released", title: "Fixtures announcement", blurb: "Every confirmed player gets their first match, court and time. Sent automatically when you draw; resend it here.", own: false },
  { kind: "schedule_update", title: "Schedule or venue update", blurb: "Players with a match still to play get their new court and time. Re-planning sends this automatically.", own: false },
  { kind: "general_info", title: "General info", blurb: "Anything else everyone entered should know: parking, shuttles, what to bring.", own: true },
  { kind: "promotion", title: "Promote to past players", blurb: "Players from your earlier tournaments who haven't entered this one. Only you, the owner, can send this.", own: true },
];
const box = "block w-full rounded-lg border border-line bg-white px-3 py-2 focus:border-ink focus:outline-none";
const btn = "h-10 rounded-lg px-3 text-[15px] font-semibold disabled:opacity-60";

function Card({ ev, kind, title, blurb, own, people, email }: (typeof CARDS)[number] & { ev: EventDetail; people: AudienceRow[]; email: boolean }) {
  const withEmail = people.filter((p) => p.email).length;
  const phones = people.filter((p) => p.phone);
  const preview = render(kind, { event: ev.title, slug: ev.slug, venue: ev.venue, category: ev.categories[0]?.name ?? "", entry: people[0]?.name || "Arjun",
    court: ev.courts[0]?.name ?? null, at: ev.startsAt, opponent: null, message: own ? "[Your message]" : undefined });
  const wa = messageText(kind, ev, own ? "" : undefined);
  const values = { event: ev.id, slug: ev.slug, kind };
  const id = `msg-${kind}`;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={id} className="font-display text-2xl font-bold">{title}</h3>
        <span className="tabular text-[14px] text-muted">{people.length} {people.length === 1 ? "person" : "people"}, {withEmail} with email, {phones.length} with a phone</span>
      </div>
      <p className="mt-1 max-w-prose text-[15px] text-muted">{blurb}</p>
      <details className="mt-3 text-[14px]">
        <summary className="cursor-pointer font-semibold">Preview the email</summary>
        <div className="mt-2 rounded-lg border border-line bg-chalk p-3">
          <div className="font-semibold">{preview.subject}</div>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{preview.text}</pre>
        </div>
      </details>

      {people.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">No one to send this to yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {own ? (
            kind === "promotion" ? (
              <PromoForm values={values} count={withEmail} />
            ) : (
              <ActionForm action={sendAnnouncement} values={values} showOk className="gap-y-2">
                <textarea name="message" required minLength={5} maxLength={1000} rows={3} aria-label="Message" placeholder="Parking is at gate 2. Bring your own shuttles." className={box} />
                <button className={`${btn} mt-2 bg-ink text-chalk`}>Email {withEmail} {withEmail === 1 ? "player" : "players"}</button>
              </ActionForm>
            )
          ) : (
            <ActionForm action={sendAnnouncement} values={values} showOk>
              <button className={`${btn} bg-ink text-chalk`}>Email {withEmail} {withEmail === 1 ? "player" : "players"}</button>
            </ActionForm>
          )}
          {!email && <p className="text-[14px] text-muted">Email isn&apos;t set up on this site yet, so emails are queued but not sent. WhatsApp works now.</p>}
          <div className="border-t border-line pt-4">
            <h4 className="font-semibold">WhatsApp</h4>
            <p className="text-[14px] text-muted">Opens WhatsApp on your phone with the message filled in. {own && "Type your message in WhatsApp after the first line."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={waLink(wa)} target="_blank" rel="noopener noreferrer" className={`${btn} inline-flex items-center bg-turf text-white hover:bg-turf-dark`}>Open WhatsApp</a>
              <CopyText text={wa} label="Copy message" className={`${btn} border border-ink`} />
              {phones.length > 0 && <CopyText text={phones.map((p) => p.phone).join("\n")} label={`Copy ${phones.length} numbers`} className={`${btn} border border-ink`} />}
            </div>
            {phones.length > 0 && (
              <details className="mt-3 text-[15px]">
                <summary className="cursor-pointer font-semibold">Message players one by one</summary>
                <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
                  {phones.map((p, i) => (
                    <li key={`${p.phone}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">{p.name || p.phone}</span>
                      <a href={waLink(wa, p.phone)} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold underline underline-offset-4">WhatsApp</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PromoForm({ values, count }: { values: Record<string, string>; count: number }) {
  // the message travels to the confirm dialog through a named form field, read on submit
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Message</span>
        <textarea form="promo-msg" name="message" maxLength={1000} rows={3} placeholder="Our next open is on 20 Dec at Smash Arena. Entries close on the 15th."
          className={box} />
      </label>
      <ConfirmAction action={sendAnnouncement} values={values} formId="promo-msg" trigger={`Email ${count} past ${count === 1 ? "player" : "players"}`}
        triggerClassName={`${btn} bg-ink text-chalk`} confirmLabel="Send to past players" title="Email past players?"
        body={<>This goes to {count} {count === 1 ? "person" : "people"} who played your earlier tournaments. Each person gets a message once.</>} />
    </div>
  );
}

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  const audiences = await Promise.all(CARDS.map((c) => messageAudience(ev.id, c.kind)));
  if (ev.status === "draft") return <p className="text-muted">Publish the tournament first. Drafts don&apos;t message anyone.</p>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold">Notifications</h2>
        <p className="max-w-prose text-muted">Email goes from SportsHunt; WhatsApp goes from your own phone. Nobody gets the same email twice.</p>
      </div>
      {CARDS.map((c, i) => audiences[i] && <Card key={c.kind} {...c} ev={ev} people={audiences[i]} email={emailConfigured()} />)}
    </div>
  );
}
