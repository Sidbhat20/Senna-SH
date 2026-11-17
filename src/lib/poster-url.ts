// Poster URLs come from a column organisers can write, and the share-image route fetches them on the server.
// Only accept files in our own Supabase "posters" bucket; anything else (another host, an internal address, a
// path escape) is dropped and pages fall back to the sport photo. Prevents SSRF and broken pages.
const POSTERS_PATH = "/storage/v1/object/public/posters/";

export function safePosterUrl(url: string | null | undefined, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!url || !supabaseUrl) return null;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    if (u.protocol !== "https:" || u.origin !== base.origin) return null;
    if (!u.pathname.startsWith(POSTERS_PATH) || decodeURIComponent(u.pathname).includes("..")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
