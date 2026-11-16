"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { debounce, REFRESH_DEBOUNCE_MS } from "@/lib/debounce";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Re-renders the page when a match in this event changes, so scores update live.
 * Debounced: a referee tapping points fires many changes, and the page should reload once per burst, not per point.
 */
export function LiveRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    const refresh = debounce(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    const channel = sb
      .channel(`matches:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `event_id=eq.${eventId}` }, refresh)
      .subscribe();
    return () => {
      refresh.cancel();
      sb.removeChannel(channel);
    };
  }, [eventId, router]);
  return null;
}
