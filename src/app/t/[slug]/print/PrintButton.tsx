"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-ink px-5 py-3 font-semibold text-chalk print:hidden">
      Print or save as PDF
    </button>
  );
}
