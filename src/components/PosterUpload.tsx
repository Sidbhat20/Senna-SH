"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadPoster } from "@/lib/poster";

/** Organiser control to add or replace an event poster. */
export function PosterUpload({ eventId, hasPoster }: { eventId: string; hasPoster: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    const err = await uploadPoster(eventId, file);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
        onChange={(e) => pick(e.target.files?.[0])} aria-hidden />
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="rounded-lg border border-ink bg-white px-3 py-2 text-[15px] font-semibold disabled:opacity-60">
        {busy ? "Uploading…" : hasPoster ? "Change poster" : "Add a poster"}
      </button>
      {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
    </div>
  );
}
