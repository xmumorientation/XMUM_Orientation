"use client";

import { useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";

// Every station, live, shared by every reader on the page and cached between
// visits (src/lib/sharedFeed.ts). Live control renders two GameToggles; they
// used to fetch and subscribe to stations once each.
function stationsSource(): FeedSource<Station[]> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data } = await supabase.from("stations").select("*").order("id");
      return (data as Station[] | null) ?? undefined;
    },
    listen(reload) {
      const channel = supabase
        .channel(`stations-feed-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, reload)
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
  };
}

/** All stations in id order; undefined until the first load. */
export function useStations(): Station[] | undefined {
  return useSharedFeed("stations", stationsSource);
}
