"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./nav";

/** Sidebar on desktop, a scrolling row of tabs on phones. */
export function ManageNav({ slug }: { slug: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Manage tournament" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1.5 md:flex-col md:gap-0.5">
        {SECTIONS.map((s) => {
          const href = `/t/${slug}${s.href}`;
          const on = path === href;
          return (
            <li key={s.key} className="shrink-0">
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-[15px] md:py-1.5 ${on ? "bg-ink font-semibold text-chalk" : "hover:bg-line/50"}`}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
