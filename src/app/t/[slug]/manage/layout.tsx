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
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3"><StatusPill status={ev.status} /><span className="text-[14px] text-muted">Manage</span></div>
          <h1 className="mt-1 truncate font-display text-3xl font-bold">{ev.title}</h1>
        </div>
        <Link href={`/t/${ev.slug}`} className="rounded-lg border border-ink px-3 py-2 text-[15px] font-semibold hover:bg-line/40">View public page</Link>
      </header>
      <div className="mt-6 grid gap-6 md:grid-cols-[11rem_1fr] md:gap-10">
        <aside className="md:sticky md:top-6 md:self-start"><ManageNav slug={ev.slug} /></aside>
        <div className="min-w-0 pb-16">{children}</div>
      </div>
    </div>
  );
}
