"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./nav";

/** Sidebar on desktop, a scrolling row of tabs on phones. */
export function ManageNav({ slug }: { slug: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Manage tournament" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col md:gap-0.5">
        {SECTIONS.map((s) => {
          const href = `/t/${slug}${s.href}`;
          const on = path === href;
          return (
            <li key={s.key} className="shrink-0">
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-[6px] px-3 text-[15px] transition-colors ${on ? "bg-turf-soft font-semibold text-turf" : "text-ink hover:bg-surface-2"}`}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
