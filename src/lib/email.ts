// Sends one plain-text email through Resend's REST API (no SDK needed).
// Without RESEND_API_KEY nothing is sent and the caller records why, so queued emails aren't lost.

export type Email = { to: string; subject: string; text: string };
export type SendResult = { ok: true } | { ok: false; error: string };
export type Send = (e: Email) => Promise<SendResult>;

export const EMAIL_NOT_SET_UP = "Email isn't set up yet (add RESEND_API_KEY)";

export const sendEmail: Send = async ({ to, subject, text }) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: EMAIL_NOT_SET_UP };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Sportshunt <onboarding@resend.dev>", to, subject, text }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: `Email provider said ${res.status}: ${body.message ?? "no details"}` };
  } catch (e) {
    return { ok: false, error: `Couldn't reach the email provider: ${(e as Error).message}` };
  }
};
