import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { getEvent } from "@/lib/data";
import { ManageNav } from "./ManageNav";

export const metadata: Metadata = { title: "Manage", robots: { index: false } };

/** The organiser workspace. Managers only: everyone else gets a 404, like the desk and the exports. */
export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const ev = await getEvent((await params).slug);
  if (!ev || !ev.canManage) notFound();
  const live = ev.categories.flatMap((c) => c.matches).filter((m) => m.status === "live").length;
  return (
    <>
      <header className="calm sticky top-[6.6rem] z-30 border-b border-line bg-bg text-ink md:top-16 print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <StatusPill status={ev.status} />
            <h1 className="truncate font-display text-2xl font-extrabold tracking-tight md:text-3xl">{ev.title}</h1>
            {live > 0 && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line bg-clay px-2 text-[12px] font-bold uppercase tracking-[0.06em] text-on-clay sm:inline-flex">
                <span className="live-dot size-1.5 rounded-full bg-ink" aria-hidden /> {live} in play
              </span>
            )}
          </div>
          <Link href={`/t/${ev.slug}`} className="inline-flex h-11 items-center rounded-[6px] chunky press bg-surface px-4 text-[15px] font-bold">
            View public page
          </Link>
        </div>
      </header>
      <div className="calm mx-auto grid max-w-7xl gap-6 px-4 pt-6 md:grid-cols-[12rem_1fr] md:gap-10 md:px-6 md:pt-8">
        <aside className="md:sticky md:top-36 md:self-start"><ManageNav slug={ev.slug} /></aside>
        <div className="min-w-0 pb-16">{children}</div>
      </div>
    </>
  );
}
