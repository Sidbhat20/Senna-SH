import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join as co-organiser", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function StaffInvite({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect(`/login?next=/staff/${encodeURIComponent(token)}`);

  // Accepting happens on the button press, not on page load: link previews fetch pages too.
  async function accept() {
    "use server";
    const sb = await supabaseServer();
    const { data: eventId, error } = await sb.rpc("join_staff", { p_token: token });
    if (error || !eventId) redirect(`/staff/${encodeURIComponent(token)}?error=1`);
    const { data: ev } = await sb.from("events").select("slug").eq("id", eventId).single();
    redirect(ev ? `/t/${ev.slug}` : "/organise");
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      {error ? (
        <>
          <h1 className="font-display text-4xl font-bold">This invite doesn&apos;t work</h1>
          <p className="mt-2 text-muted">It may have been used already, withdrawn, or be more than 7 days old. Ask the organiser for a new link.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl font-bold">Help run this tournament</h1>
          <p className="mt-2 text-muted">
            You&apos;ve been invited as a co-organiser. You&apos;ll be able to manage entries, draws, the order of play, the desk and
            scoring.
          </p>
          <form action={accept}>
            <button className="mt-6 h-12 w-full rounded-lg chunky press bg-turf px-5 font-semibold text-on-turf hover:bg-turf-dark">Accept invite</button>
          </form>
        </>
      )}
      <Link href="/organise" className="mt-4 inline-block text-muted underline-offset-4 hover:underline">Go to your tournaments</Link>
    </div>
  );
}
