import Link from "next/link";
import { createStaffInvite, removeOfficial, revokeStaffInvite } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { date } from "@/components/ui";
import { eventStaff, type EventDetail } from "@/lib/data";
import { CopyLink } from "./Panels";

const btn = "h-11 rounded-full px-4 text-[15px] font-semibold disabled:opacity-60";
const ROLE = { co_organiser: "Co-organiser", referee: "Referee" } as const;

export async function StaffSection({ ev }: { ev: EventDetail }) {
  const { me, isOwner, members, invites } = await eventStaff(ev);
  const hidden = { event: ev.id, slug: ev.slug };

  return (
    <section aria-labelledby="staff">
      <h2 id="staff" className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-[1.05]">Staff</h2>
      <p className="max-w-prose text-muted">
        Co-organisers run everything you can, except deleting the tournament or changing its staff. Referees score their
        court; send them a court&apos;s link from{" "}
        <Link href={`/t/${ev.slug}?view=schedule`} className="font-medium text-ink underline underline-offset-2">Order of play</Link>.
      </p>

      {members.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted">No one else yet.</p>
      ) : (
        <ul className="mt-3 max-w-2xl divide-y divide-line">
          {members.map((m) => {
            const canRemove = isOwner || m.userId === me || m.role === "referee";
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{m.name}</span>
                  {m.userId === me && <span className="text-muted"> (you)</span>}
                  <div className="text-[14px] text-muted">
                    {ROLE[m.role]}
                    {m.role === "referee" && `, ${m.court ?? "all courts"}`}
                  </div>
                </div>
                {canRemove && (
                  <ActionForm action={removeOfficial} values={{ ...hidden, user: m.userId }}>
                    <button className={`${btn} text-danger hover:bg-danger/10`}>{m.userId === me ? "Step down" : "Remove"}</button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && (
        <div className="mt-6 max-w-2xl rounded-[6px] border border-line bg-surface p-5">
          <h3 className="font-display text-xl font-bold">Invite a co-organiser</h3>
          <p className="text-[15px] text-muted">Each link works once and expires in 7 days. Send it to one person.</p>
          <ActionForm action={createStaffInvite} values={hidden} showOk className="mt-3">
            <input name="note" maxLength={80} placeholder="Who is it for? e.g. Ravi, desk" aria-label="Who the invite is for"
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 focus:border-ink focus:outline-none" />
            <button className={`${btn} bg-ink text-on-ink`}>Create invite link</button>
          </ActionForm>
          {invites.length > 0 && (
            <ul className="mt-4 space-y-3">
              {invites.map((i) => (
                <li key={i.token} className="space-y-1">
                  <CopyLink path={`/staff/${i.token}`} label={i.note || "Invite"} />
                  <ActionForm action={revokeStaffInvite} values={{ token: i.token, slug: ev.slug }} className="pl-26 text-[13px]">
                    <span className="text-muted">Works until {date(i.expiresAt)}.</span>
                    <button className="font-semibold underline underline-offset-2">Withdraw</button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
