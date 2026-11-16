import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join team", robots: { index: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ joined?: string; error?: string }> };

export default async function JoinTeam({ params, searchParams }: Props) {
  const { token } = await params;
  const { joined, error } = await searchParams;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect(`/login?next=/join/${encodeURIComponent(token)}`);

  // Joining happens on the button press, not on page load: link previews fetch pages too.
  async function join() {
    "use server";
    const sb = await supabaseServer();
    const { data: teamId, error } = await sb.rpc("join_team", { p_token: token });
    redirect(`/join/${encodeURIComponent(token)}?${error ? "error=1" : `joined=${teamId}`}`);
  }

  const { data: team } = joined ? await sb.from("teams").select("name").eq("id", joined).maybeSingle() : { data: null };

  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      {team ? (
        <>
          <h1 className="font-display text-4xl font-bold">You&apos;re on {team.name}</h1>
          <p className="mt-2 text-muted">Your captain can see you on the roster now.</p>
          <Link href="/tournaments" className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-chalk hover:bg-pitch">
            Browse tournaments
          </Link>
        </>
      ) : error ? (
        <>
          <h1 className="font-display text-4xl font-bold">This invite doesn&apos;t work</h1>
          <p className="mt-2 text-muted">The link may be mistyped. Ask your captain to send it again.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-4xl font-bold">Join your team</h1>
          <p className="mt-2 text-muted">Your captain invited you. Joining puts you on their roster.</p>
          <form action={join}>
            <button className="mt-6 h-12 w-full rounded-md bg-turf px-5 font-semibold text-white hover:bg-turf-dark">Join team</button>
          </form>
        </>
      )}
    </div>
  );
}
