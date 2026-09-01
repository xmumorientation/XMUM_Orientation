"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { FreshieGroupStats } from "@/lib/types";

// Live per-group headcount / gender / nationality splits for the
// Freshie Registration desk + admin monitoring dashboard. Subscribes to
// postgres_changes on `freshies` so every registration or manual
// reassignment repaints the grid instantly across every open tab.
export function useFreshieStats() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stats, setStats] = useState<FreshieGroupStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("fn_freshie_group_stats");
    if (!error && data) {
      setStats(data as FreshieGroupStats[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("freshie-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freshies" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const totalHeadcount = stats.reduce(
    (sum: number, s: FreshieGroupStats) => sum + s.headcount,
    0
  );


  return { stats, loading, totalHeadcount, refresh: load };
}
