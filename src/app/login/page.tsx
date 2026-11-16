import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { LoginForms } from "./LoginForms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: raw, error } = await searchParams;
  const next = raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await currentUser()) redirect(next);

  return (
    <div className="mx-auto max-w-sm px-4 pt-12">
      <h1 className="font-display text-5xl font-bold">Log in</h1>
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
  );
}
