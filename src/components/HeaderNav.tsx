"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/organise", label: "Organise" },
  { href: "/referee", label: "Scoring", signedIn: true },
];

function NavLinks({ signedIn, className }: { signedIn: boolean; className: string }) {
  const path = usePathname();
  return (
    <ul className={className}>
      {LINKS.filter((l) => !l.signedIn || signedIn).map((l) => {
        const on = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link href={l.href} aria-current={on ? "page" : undefined}
              className="inline-flex h-11 items-center px-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_-2px_0_var(--flood)]">
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The header's right side and, on phones, a second row of links: same labels on every screen size. */
export function HeaderNav({ signedIn, logout }: { signedIn: boolean; logout: React.ReactNode }) {
  const onLogin = usePathname().startsWith("/login");
  return (
    <>
      <nav aria-label="Main" className="ml-auto hidden md:block">
        <NavLinks signedIn={signedIn} className="flex items-center gap-1" />
      </nav>
      <div className="ml-auto flex items-center gap-1 md:ml-2">
        {signedIn ? logout : !onLogin && (
          <Link href="/login" className="inline-flex h-10 items-center rounded-full bg-flood px-5 text-[13px] font-semibold uppercase tracking-[0.1em] text-on-flood press">
            Log in
          </Link>
        )}
      </div>
      <nav aria-label="Main" className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto border-t border-line px-2 md:hidden">
        <NavLinks signedIn={signedIn} className="flex items-center" />
      </nav>
    </>
  );
}
