"use client";

import { displayLabel } from "@/lib/displayLabel";

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

// Split in two so a page that only needs the phases does not re-render every
// second: PhaseDataContext changes when the phases or the clock offset change,
// TickContext every second. usePhases() reads only the first.
interface PhaseData {
  phases: Phase[];
  offsetMs: number;
}
const PhaseDataContext = createContext<PhaseData | null>(null);
const TickContext = createContext(0);

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
      if (mounted.current && data) setPhases((data as Phase[]).map((phase) => ({ ...phase, name: displayLabel(phase.name) })));
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
    const refresh = setInterval(loadPhases, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") { void loadPhases(); void syncClock(); }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted.current = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
      clearInterval(resync);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase]);

  // A game whose time is up ends now (closing its stations), rather than at
  // the database's next minute check (fn_game_expire, migration 0052).
  const expired = useRef(new Set<string>());
  useEffect(() => {
    const serverNow = Date.now() + offsetMs;
    const due = phases.find(
      (p) => p.state === "active" && p.ends_at && new Date(p.ends_at).getTime() <= serverNow
    );
    if (!due) return;
    const key = `${due.id}-${due.ends_at}`;
    if (expired.current.has(key)) return;
    expired.current.add(key);
    void supabase.rpc("fn_game_expire");
  }, [phases, offsetMs, tick, supabase]);

  const data = useMemo(() => ({ phases, offsetMs }), [phases, offsetMs]);

  return (
    <PhaseDataContext.Provider value={data}>
      <TickContext.Provider value={tick}>{children}</TickContext.Provider>
    </PhaseDataContext.Provider>
  );
}

/**
 * The phases and the server clock offset, without the 1 s tick. Use this
 * unless the component shows a live countdown; it re-renders only when the
 * phases change.
 */
export function usePhases(): PhaseData {
  const v = useContext(PhaseDataContext);
  if (!v) throw new Error("usePhases must be used inside PhaseTimerProvider");
  return v;
}

/** usePhases() plus the 1 s tick: for live countdowns only (re-renders every second). */
export function usePhaseTimer(): PhaseTimerValue {
  const data = useContext(PhaseDataContext);
  const tick = useContext(TickContext);
  if (!data)
    throw new Error("usePhaseTimer must be used inside PhaseTimerProvider");
  return useMemo(() => ({ ...data, tick }), [data, tick]);
}

// For components that also render outside the app shell (the public Welcome
// page has no provider). Returns null there. Includes the 1 s tick.
export function usePhaseTimerOptional(): PhaseTimerValue | null {
  const data = useContext(PhaseDataContext);
  const tick = useContext(TickContext);
  return useMemo(() => (data ? { ...data, tick } : null), [data, tick]);
}
