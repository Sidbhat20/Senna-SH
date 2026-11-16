const BASE = "http://same-site.invalid";

/**
 * Where to send someone after logging in: only a path on this site. Anything else ("//evil.com",
 * "/\\evil.com", "https://evil.com", control characters) falls back to "/". Prevents open redirects.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const url = new URL(raw, BASE);
    return url.origin === BASE ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
