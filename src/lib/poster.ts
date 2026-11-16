import { supabaseBrowser } from "./supabase/browser";

export const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const POSTER_MAX = 5 * 1024 * 1024;

/** Returns a message if the file can't be a poster; the storage bucket enforces the same limits. */
export function posterProblem(f: File): string | null {
  if (!POSTER_TYPES.includes(f.type)) return "Use a JPG, PNG or WebP image.";
  if (f.size > POSTER_MAX) return "Keep the poster under 5 MB.";
  return null;
}

/** Uploads to posters/<event id>/… and saves the public URL on the event. Runs in the browser as the organiser. */
export async function uploadPoster(eventId: string, file: File): Promise<string | null> {
  const problem = posterProblem(file);
  if (problem) return problem;
  const sb = supabaseBrowser();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${eventId}/${Date.now()}.${ext}`; // new name each time, so browsers never show a cached old poster
  const up = await sb.storage.from("posters").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (up.error) return `Poster didn't upload: ${up.error.message}`;
  const url = sb.storage.from("posters").getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from("events").update({ poster_url: url }).eq("id", eventId);
  return error ? `Poster uploaded but not saved: ${error.message}` : null;
}
