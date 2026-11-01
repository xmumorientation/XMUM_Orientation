"use client";

import { useInitialGroup, useProfile } from "@/components/ProfileProvider";
import { useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";

function groupSource(groupId: number): () => FeedSource<Group> {
  return () => {
    const supabase = supabaseBrowser();
    return {
      async load() {
        const { data } = await supabase.from("groups").select("*").eq("id", groupId).single();
        return (data as Group | null) ?? undefined;
      },
      listen(_reload, set) {
        const channel = supabase
          .channel(`group-${groupId}-${crypto.randomUUID()}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "groups", filter: `id=eq.${groupId}` },
            (payload) => set(payload.new as Group)
          )
          .subscribe();
        return () => void supabase.removeChannel(channel);
      },
    };
  };
}

// Live view of the signed-in user's group (token balance updates in
// realtime — FR-5.1). Seeded from the server-fetched snapshot so pages
// paint without a loading skeleton; the fetch reconciles any change that
// happened between server render and the realtime subscription. AppShell
// and the page share one query and one channel (src/lib/sharedFeed.ts).
export function useGroup() {
  const profile = useProfile();
  const initialGroup = useInitialGroup();
  const groupId = profile.group_id ?? null;
  const seeded = initialGroup !== null && initialGroup.id === groupId;
  const live = useSharedFeed(groupId ? `group:${groupId}` : null, groupSource(groupId ?? 0));

  if (!groupId) return { group: null, loading: false };
  const group = live ?? (seeded ? initialGroup : null);
  return { group, loading: group === null && live === undefined };
}
