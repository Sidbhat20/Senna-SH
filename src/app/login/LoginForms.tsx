"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const input = "mt-1 line-input";

export function LoginForms({ next }: { next: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const callback = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`; // browser-only, so call it in handlers

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok?: string) => {
    setBusy(true);
    setNotice(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else if (ok) setNotice({ kind: "ok", text: ok });
    return !error;
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } }))}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-[6px] border border-line bg-surface font-semibold hover:border-ink"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5">
          <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2Z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1a11 11 0 0 0 0 9.8L5.8 14Z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.6 3.3-4.6 6.2-4.6Z" />
        </svg>
        Continue with Google
      </button>

      <form
        className="border-t border-line pt-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!codeSent) {
            if (await run(() => supabaseBrowser().auth.signInWithOtp({ phone: `+91${phone}` }), "Code sent. Check your SMS.")) setCodeSent(true);
          } else if (await run(() => supabaseBrowser().auth.verifyOtp({ phone: `+91${phone}`, token: String(f.get("code")), type: "sms" }))) {
            router.replace(next);
            router.refresh();
          }
        }}
      >
        <label className="block">
          <span className="block text-[14px] text-muted">Mobile number</span>
          <span className="mt-1 flex items-baseline gap-2">
            <span className="text-[1.0625rem] text-muted">+91</span>
            <input
              type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" required
              placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              disabled={codeSent} className="line-input tabular-nums"
            />
          </span>
        </label>
        {codeSent && (
          <label className="mt-3 block">
            <span className="block text-[14px] text-muted">6-digit code</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required className={input} />
          </label>
        )}
        <button type="submit" disabled={busy} className="mt-3 h-12 w-full rounded-[6px] chunky press bg-turf font-semibold text-on-turf hover:bg-turf-hover disabled:opacity-60">
          {codeSent ? "Log in" : "Send code"}
        </button>
      </form>

      <form
        className="border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email"));
          run(() => supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: callback() } }), `Check ${email} for your login link.`);
        }}
      >
        <label className="block">
          <span className="block text-[14px] text-muted">Email</span>
          <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" className={input} />
        </label>
        <button type="submit" disabled={busy} className="mt-3 h-12 w-full rounded-[6px] border border-ink font-semibold hover:bg-ink hover:text-on-ink disabled:opacity-60">
          Email me a login link
        </button>
      </form>

      {notice && (
        <p role="status" className={`rounded-lg px-4 py-3 text-[15px] ${notice.kind === "ok" ? "bg-turf-soft text-ink" : "bg-danger/10 text-danger"}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
