import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Referee", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function RefereeInvite({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect(`/login?next=/ref/${encodeURIComponent(token)}`);

  // Joining happens on the button press, not on page load: link previews fetch pages too.
  async function join() {
    "use server";
    const sb = await supabaseServer();
    const { error } = await sb.rpc("join_referee", { p_token: token });
    redirect(error ? `/ref/${encodeURIComponent(token)}?error=1` : "/referee");
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      {error ? (
        <>
          <h1 className="font-display text-4xl font-bold">This referee link doesn&apos;t work</h1>
          <p className="mt-2 text-muted">Ask the organiser to send it again.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl font-bold">Referee this tournament</h1>
          <p className="mt-2 text-muted">
            The organiser invited you to score matches. After you accept, your matches show up on your scoring page.
          </p>
          <form action={join}>
            <button className="mt-6 h-12 w-full rounded-lg bg-turf px-5 font-semibold text-white hover:bg-turf-dark">Accept and start scoring</button>
          </form>
        </>
      )}
      <Link href="/" className="mt-4 inline-block text-muted underline-offset-4 hover:underline">Not now</Link>
    </div>
  );
}
