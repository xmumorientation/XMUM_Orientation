"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase } from "@/lib/types";

// Single source of truth for the phase countdown. Previously PhaseTimer owned
// its own realtime subscription, /api/time poll and 1s interval — and it is
// mounted twice (sidebar + mobile header), so every screen ran that work
// twice and re-rendered the whole timer subtree every second, app-wide. This
// provider runs one subscription, one clock sync and one tick; both PhaseTimer
// instances become cheap consumers.
interface PhaseTimerValue {
  phases: Phase[];
  offsetMs: number;
  // Increments once per second so consumers re-render the countdown.
  tick: number;
}

const PhaseTimerContext = createContext<PhaseTimerValue | null>(null);

export function PhaseTimerProvider({ children }: { children: React.ReactNode }) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [offsetMs, setOffsetMs] = useState(0);
  const [tick, setTick] = useState(0);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function syncClock() {
      try {
        const t0 = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        const { now } = await res.json();
        const t1 = Date.now();
        if (mounted.current) setOffsetMs(now + (t1 - t0) / 2 - t1);
      } catch {
        // keep previous offset
      }
    }

    async function loadPhases() {
      const { data } = await supabase
        .from("phases")
        .select("*")
        .order("sort_order");
      if (mounted.current && data) setPhases(data as Phase[]);
    }

    syncClock();
    loadPhases();

    const channel = supabase
      .channel("phases-timer")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases" },
        loadPhases
      )
      .subscribe();

    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    const resync = setInterval(syncClock, 5 * 60 * 1000);

    return () => {
      mounted.current = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
      clearInterval(resync);
    };
  }, [supabase]);

  const value = useMemo(
    () => ({ phases, offsetMs, tick }),
    [phases, offsetMs, tick]
  );

  return (
    <PhaseTimerContext.Provider value={value}>
      {children}
    </PhaseTimerContext.Provider>
  );
}

export function usePhaseTimer(): PhaseTimerValue {
  const v = useContext(PhaseTimerContext);
  if (!v)
    throw new Error("usePhaseTimer must be used inside PhaseTimerProvider");
  return v;
}
