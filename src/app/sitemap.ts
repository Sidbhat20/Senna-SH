import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/notify";
import { supabaseServer } from "@/lib/supabase/server";

export const revalidate = 3600;

/** Home, the listing, and every published event. Drafts and cancelled events stay unlisted. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const sb = await supabaseServer();
  const { data } = await sb.from("events").select("slug, starts_at").not("status", "in", "(draft,cancelled)").order("starts_at", { ascending: false }).limit(5000);
  return [
    { url: `${site}/`, changeFrequency: "daily", priority: 1 },
    { url: `${site}/tournaments`, changeFrequency: "hourly", priority: 0.9 },
    ...(data ?? []).map((e) => ({ url: `${site}/t/${e.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
