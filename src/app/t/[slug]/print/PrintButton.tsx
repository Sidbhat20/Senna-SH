"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg chunky press bg-ink px-5 py-3 font-semibold text-on-ink print:hidden">
      Print or save as PDF
    </button>
  );
}
