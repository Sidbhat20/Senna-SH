"use client";

import { useEffect, useState } from "react";

/** A number that counts up from 0 when it first shows. Reduced motion, or non-numbers: shown as is. */
export function CountUp({ value, ms = 600 }: { value: number | string; ms?: number }) {
  const target = typeof value === "number" ? value : null;
  const [n, setN] = useState(target);
  useEffect(() => {
    if (target === null || target === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setN(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return <>{target === null ? value : n}</>;
}
