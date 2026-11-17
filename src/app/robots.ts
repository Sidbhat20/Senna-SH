import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/notify";

/** Public pages are indexable; organiser, scoring, login and per-event tools aren't. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/organise", "/referee", "/login", "/auth/", "/join/", "/ref/", "/staff/", "/t/*/manage", "/t/*/desk", "/t/*/export/", "/t/*/print", "/t/*/certificates"],
    }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
