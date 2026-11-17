"use client";

import { useEffect, useState } from "react";

/** A quiet confirmation after registering or sending a UPI reference; tucks away after a few seconds. */
export function Celebration({ title = "You're in" }: { title?: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShown(false), 4000); return () => clearTimeout(t); }, []);
  if (!shown) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rise flex items-center gap-3 rounded-full bg-[#D7FF3A] py-3 pl-4 pr-6 text-[#0B0B0C]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <span className="font-display text-2xl leading-none">{title}</span>
      </div>
    </div>
  );
}
