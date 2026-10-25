"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePhaseTimerOptional } from "@/components/PhaseTimerProvider";
import { day2Now, type Day2Now, type Day2State } from "@/lib/day2";
import { supabaseBrowser } from "@/lib/supabase/client";

// The Day 2 inner schedule for any page, logged in or not (fn_day2_state,
// 0102). Reloads on a change to day2_schedule or phases and every 15 s; the
// segment moves on by itself at each boundary, on the server's clock.
export function useDay2State(): Day2Now & { state: Day2State | null; reload: () => void } {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const shared = usePhaseTimerOptional();
  const [state, setState] = useState<Day2State | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc("fn_day2_state");
    // Missing before migration 0102: behave as "no Day 2 game".
    if (error || !data) return;
    const s = data as Day2State;
    setState(s);
    setOffsetMs(new Date(s.server_now).getTime() - Date.now());
  }, [supabase]);

  useEffect(() => {
    reload();
    const every = setInterval(reload, 15_000);
    const channel = supabase
      .channel(`day2-state-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "day2_schedule" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "phases" }, reload)
      .subscribe();
    return () => {
      clearInterval(every);
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  // Own 1 s tick only when there is no provider; the provider already ticks.
  useEffect(() => {
    if (shared) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [shared]);

  const tick = shared?.tick;
  const n = useMemo(
    () => day2Now(state, (shared ? Date.now() : now) + offsetMs),
    [state, now, tick, offsetMs, shared] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { ...n, state, reload };
}
