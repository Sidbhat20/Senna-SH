"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Re-renders the page whenever a match in this event changes, so scores update live. */
export function LiveRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel(`matches:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `event_id=eq.${eventId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [eventId, router]);
  return null;
}
