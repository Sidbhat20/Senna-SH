import { eventCoupons, getEvent } from "@/lib/data";
import { CouponsSection, CourtsSection, DangerZone, DownloadsSection, FeesSection, Frozen, QuestionsSection } from "../../EditPanel";
import { StaffSection } from "../../StaffSection";

const GROUPS = [
  ["fees", "Fees"], ["coupons", "Discount codes"], ["courts", "Courts"], ["staff", "Staff"], ["questions", "Registration questions"], ["downloads", "Downloads"], ["danger", "Danger zone"],
] as const;

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ev = (await getEvent((await params).slug))!;
  if (ev.status === "completed" || ev.status === "cancelled") return <div className="space-y-10"><Frozen ev={ev} /><DownloadsSection ev={ev} /></div>;
  return (
    <div className="space-y-12">
      <nav aria-label="Settings groups" className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
        {GROUPS.map(([id, label]) => <a key={id} href={`#${id}`} className="text-muted underline-offset-4 hover:text-ink hover:underline">{label}</a>)}
      </nav>
      <div id="fees" className="scroll-mt-6"><FeesSection ev={ev} /></div>
      <div id="coupons" className="scroll-mt-6"><CouponsSection ev={ev} coupons={await eventCoupons(ev.id)} /></div>
      <div id="courts" className="scroll-mt-6"><CourtsSection ev={ev} /></div>
      <div id="staff" className="scroll-mt-6"><StaffSection ev={ev} /></div>
      <div id="questions" className="scroll-mt-6"><QuestionsSection ev={ev} /></div>
      <div id="downloads" className="scroll-mt-6"><DownloadsSection ev={ev} /></div>
      <div id="danger" className="scroll-mt-6"><DangerZone ev={ev} /></div>
    </div>
  );
}
