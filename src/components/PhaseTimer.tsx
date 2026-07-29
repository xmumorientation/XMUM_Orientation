"use client";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { cn, formatCountdown } from "@/lib/utils";

// FR-10.2: persistent phase countdown on every screen; Endgame in warning
// red. FR-10.4: countdown uses server-time offset, not the device clock.
// Pure consumer of PhaseTimerProvider — the subscription, clock sync and 1s
// tick live there once, so the two mounted instances share one data source.
//
// Modernist "treatment A" bar: wordmark kicker + phase name on the left,
// large tabular countdown on the right; Endgame inverts to a solid accent
// field. Unlike the earlier pill this never disappears — before kickoff and
// between phases it answers "what's happening now" instead of going blank,
// which is the 10-second-orientation anchor for freshies.
export function PhaseTimer({
  compact = false,
  brandName = "Vortexa",
}: {
  compact?: boolean;
  brandName?: string;
}) {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;

  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;
  const next = phases.find((p) => p.state === "pending");
  const allEnded = phases.length > 0 && phases.every((p) => p.state === "ended");

  const serverNow = Date.now() + offsetMs;
  const remaining = current
    ? current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0
    : 0;

  const isEndgame = Boolean(current?.is_endgame);

  const subline = current
    ? current.state === "paused"
      ? `${current.name} · paused`
      : current.name
    : next
      ? `Up next · ${next.name}`
      : allEnded
        ? "All phases complete"
        : "Waiting for kickoff";

  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 px-3 py-2",
        compact ? "" : "border-b-2 border-ink/40",
        isEndgame && "animate-pulseglow border-transparent bg-brand-1 text-paper-50"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-[10px] font-extrabold uppercase tracking-[0.1em]",
            isEndgame ? "text-paper-50/80" : "text-ink/55"
          )}
        >
          {brandName}
        </span>
        <span className="truncate text-[13px] leading-tight">{subline}</span>
      </div>
      <span className="text-xl font-extrabold leading-none tabular-nums">
        {current ? formatCountdown(remaining) : "--:--"}
      </span>
    </div>
  );
}
