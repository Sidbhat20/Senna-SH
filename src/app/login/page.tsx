import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { PHOTOS } from "@/components/Photo";
import { safeNext } from "@/lib/safe-next";
import { currentUser } from "@/lib/supabase/server";
import { LoginForms } from "./LoginForms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: raw, error } = await searchParams;
  const next = safeNext(raw);
  if (await currentUser()) redirect(next);

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 md:grid-cols-2 md:items-stretch md:px-6 md:pt-14">
      <div className="relative isolate hidden min-h-[32rem] overflow-hidden rounded-[6px] text-chalk md:block">
        <Image src={PHOTOS.court} alt="" fill sizes="50vw" className="photo -z-10 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
        <div className="flex h-full flex-col justify-end p-8">
          <p className="font-display text-[clamp(2.5rem,4vw,3.75rem)] leading-[0.9]">Your matches.<br />Your draws.<br />Your scores.</p>
          <p className="mt-4 max-w-sm text-chalk/80">One account to enter tournaments, run your own, and score from the court.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-sm md:py-6">
      <h1 className="font-display text-[clamp(3rem,6vw,4.5rem)] leading-[0.9]">Log in</h1>
      <p className="mt-2 text-muted">New here? The same steps create your account.</p>
      {error === "link" && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-[15px] text-danger">
          That login link has expired or was already used. Send yourself a new one.
        </p>
      )}
      <div className="mt-8">
        <LoginForms next={next} />
      </div>
      </div>
    </div>
  );
}
