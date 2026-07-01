"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";

// Live view of the signed-in user's group (token balance updates in
// realtime — FR-5.1).
export function useGroup() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile.group_id) {
      setLoading(false);
      return;
    }
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("groups")
        .select("*")
        .eq("id", profile.group_id!)
        .single();
      if (active) {
        setGroup((data as Group) ?? null);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel(`group-${profile.group_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "groups",
          filter: `id=eq.${profile.group_id}`,
        },
        (payload) => setGroup(payload.new as Group)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.group_id]);

  return { group, loading };
}
