"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { day2Now, type Day2Now, type Day2State } from "@/lib/day2";
import { reloadSharedFeed, useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Day2Feed {
  state: Day2State;
  offsetMs: number;
}

// One query, one channel and one 15 s poll per page, however many components
// read it (src/lib/sharedFeed.ts).
function day2Source(): FeedSource<Day2Feed> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data, error } = await supabase.rpc("fn_day2_state");
      // Missing before migration 0102: behave as "no Day 2 game".
      if (error || !data) return undefined;
      const state = data as Day2State;
      return { state, offsetMs: new Date(state.server_now).getTime() - Date.now() };
    },
    listen(reload) {
      const channel = supabase
        .channel(`day2-state-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "day2_schedule" }, reload)
        .on("postgres_changes", { event: "*", schema: "public", table: "phases" }, reload)
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
    pollMs: 15_000,
    // Kept as before: the poll and realtime cover it.
    reloadOnVisible: false,
  };
}

// The Day 2 inner schedule for any page, logged in or not (fn_day2_state,
// 0102). Reloads on a change to day2_schedule or phases and every 15 s; the
// segment moves on by itself at each boundary, on the server's clock.
export function useDay2State(): Day2Now & { state: Day2State | null; reload: () => void } {
  const feed = useSharedFeed("day2_state", day2Source);
  const state = feed?.state ?? null;
  const offsetMs = feed?.offsetMs ?? 0;

  // An explicit reload (e.g. after an Admin change) updates every reader.
  const reload = useCallback(() => reloadSharedFeed("day2_state"), []);

  // The segment moves on at its start time. Check every second, but only
  // re-render when the answer changes: Day2Now has no countdown, so a page
  // using this hook does not re-render every second.
  const compute = useCallback(() => day2Now(state, Date.now() + offsetMs), [state, offsetMs]);
  const [n, setN] = useState(compute);
  useEffect(() => {
    const update = () =>
      setN((prev) => {
        const next = compute();
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [compute]);

  return useMemo(() => ({ ...n, state, reload }), [n, state, reload]);
}
