"use client";

import { useState } from "react";

/** Copies a block of text (a message, a list of numbers) and says so. */
export function CopyText({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the text stays visible to copy by hand */ }
    }}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
