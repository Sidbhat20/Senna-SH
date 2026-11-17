"use client";

import { useRef } from "react";

/** Wraps a wide view (a bracket) with a button that shows it full screen, for a projector or the desk TV. */
export function Fullscreen({ children, label = "Full screen" }: { children: React.ReactNode; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div ref={box} className="overflow-auto bg-bg [&:fullscreen]:p-8">
      <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}
        className="mb-3 h-11 rounded-lg border border-ink px-3 text-[14px] font-semibold print:hidden">
        {label}
      </button>
      {children}
    </div>
  );
}
