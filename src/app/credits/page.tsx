import type { Metadata } from "next";
import credits from "@/lib/photo-credits.json";

export const metadata: Metadata = { title: "Photo credits" };

/** Attribution for the openly licensed photography used across the site (required by CC BY / BY-SA). */
export default function Credits() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14 md:px-6">
      <h1 className="font-display text-[clamp(3rem,7vw,5rem)] leading-[0.9]">Photo credits</h1>
      <p className="mt-4 text-muted">Photos are shown in black and white and cropped. Thank you to the photographers below.</p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {credits.map((c) => (
          <li key={c.file} className="py-4 text-[15px]">
            <a href={c.source} className="font-semibold underline-offset-4 hover:underline" rel="noopener" target="_blank">{c.title}</a>
            <span className="text-muted"> by {c.creator}, </span>
            <a href={c.license_url} className="font-score text-[13px] text-muted underline-offset-4 hover:underline" rel="noopener license" target="_blank">{c.license}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
