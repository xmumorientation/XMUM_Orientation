"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase } from "@/lib/types";
import { cn, formatCountdown } from "@/lib/utils";

// FR-10.2: persistent phase countdown on every screen; Endgame in warning
// red. FR-10.4: countdown uses server-time offset, not the device clock.
export function PhaseTimer() {
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

  void tick;

  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;
  if (!current) return null;

  const serverNow = Date.now() + offsetMs;
  const remaining =
    current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0;

  const isEndgame = current.is_endgame;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-semibold",
        isEndgame
          ? "animate-pulseglow bg-red-600 text-white"
          : "bg-gradient-to-r from-star-goldsoft/30 via-star-cyansoft/30 to-star-violetsoft/30 text-ink"
      )}
    >
      <span className="text-[10px] font-black tracking-[0.18em]">
        {isEndgame ? "END" : "NOW"}
      </span>
      <span>{current.name}</span>
      <span className="tabular-nums">
        {current.state === "paused"
          ? `paused · ${formatCountdown(remaining)}`
          : formatCountdown(remaining)}
      </span>
    </div>
  );
}
