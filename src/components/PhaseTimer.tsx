"use client";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { cn, formatCountdown } from "@/lib/utils";

// FR-10.2: persistent phase countdown on every screen; Endgame in warning
// red. FR-10.4: countdown uses server-time offset, not the device clock.
// Pure consumer of PhaseTimerProvider — the subscription, clock sync and 1s
// tick live there once, so the two mounted instances share one data source.
export function PhaseTimer({ compact = false }: { compact?: boolean }) {
  const { phases, offsetMs, tick } = usePhaseTimer();
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
        "flex items-center gap-2 px-3 py-1.5 text-sm font-semibold",
        compact ? "justify-start rounded-2xl" : "justify-center",
        isEndgame
          ? "animate-pulseglow bg-red-600 text-white"
          : "bg-brand-1/20 text-ink"
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
