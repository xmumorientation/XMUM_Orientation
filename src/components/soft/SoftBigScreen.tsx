"use client";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { cn, formatCountdown } from "@/lib/utils";

const PIECES_PER_SET = 5;

interface Standing {
  group: { id: number; name: string; token_balance: number };
  pieces: Record<ProjectorLocation, number>;
  activated: ProjectorLocation | null;
}

function PieceDots({ have }: { have: number }) {
  return (
    <span className="flex gap-1 lg:gap-1.5">
      {Array.from({ length: PIECES_PER_SET }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full lg:h-3 lg:w-3",
            i < have ? "bg-[var(--brand-1)]" : "bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

// Round 5's lesson for /bigscreen: the countdown becomes the single
// centered focal point (was a small top-right readout) instead of sharing
// a row with the leaderboard. Same standings data and sort order below.
export function SoftBigScreen({
  eventName,
  eventTagline,
  standings,
  activatedCount,
}: {
  eventName: string;
  eventTagline: string;
  standings: Standing[];
  activatedCount: number;
}) {
  const { phases, offsetMs } = usePhaseTimer();
  const active = phases.find((p) => p.state === "active");
  const paused = phases.find((p) => p.state === "paused");
  const current = active ?? paused;
  const serverNow = Date.now() + offsetMs;
  const remaining = current
    ? current.state === "paused"
      ? (current.paused_remaining ?? 0)
      : current.ends_at
        ? (new Date(current.ends_at).getTime() - serverNow) / 1000
        : 0
    : 0;

  return (
    <div className="min-h-dvh px-4 py-6 text-white lg:px-10 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <p className="truncate text-2xl font-black tracking-tight lg:text-4xl">
          <span className="bg-gradient-to-r from-[var(--brand-1)] to-[var(--brand-2)] bg-clip-text text-transparent">
            {eventName}
          </span>
        </p>
        {eventTagline && (
          <p className="truncate text-sm text-white/50 lg:text-lg">
            {eventTagline}
          </p>
        )}
      </header>

      <div className="mt-6 flex flex-col items-center text-center lg:mt-10">
        {current ? (
          <>
            <p
              className={cn(
                "text-xs font-black uppercase tracking-[0.3em] lg:text-sm",
                current.is_endgame ? "text-red-400" : "text-white/50"
              )}
            >
              {current.is_endgame ? "Endgame" : current.name}
              {current.state === "paused" ? " · paused" : ""}
            </p>
            <p
              className={cn(
                "mt-2 font-mono text-7xl font-black tabular-nums lg:text-9xl",
                current.is_endgame ? "animate-pulse text-red-400" : "text-white"
              )}
            >
              {formatCountdown(remaining)}
            </p>
          </>
        ) : (
          <p className="text-xl text-white/40">Waiting for the next phase…</p>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-white/40 lg:mt-12 lg:text-sm">
        <span>Leaderboard</span>
        <span className="h-px flex-1 bg-white/10" />
        <span>
          Projectors {activatedCount}/{PROJECTOR_LOCATIONS.length} activated
        </span>
      </div>

      <ol className="mt-3 space-y-2 lg:mt-5 lg:space-y-3">
        {standings.map((s, idx) => (
          <li
            key={s.group.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors lg:gap-6 lg:px-6 lg:py-4",
              s.activated
                ? "bg-amber-400/10"
                : idx === 0
                  ? "bg-white/[0.06]"
                  : "bg-white/[0.03]"
            )}
          >
            <span
              className={cn(
                "w-8 shrink-0 text-center font-mono text-xl font-black tabular-nums lg:w-14 lg:text-4xl",
                idx === 0
                  ? "text-amber-300"
                  : idx < 3
                    ? "text-white/80"
                    : "text-white/35"
              )}
            >
              {idx + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-black lg:text-3xl">
                {s.group.name}
              </span>
              {s.activated && (
                <span className="mt-0.5 inline-block rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-950 lg:text-xs">
                  {PROJECTOR_LABELS[s.activated]} activated
                </span>
              )}
            </span>

            <span className="hidden shrink-0 gap-4 sm:flex lg:gap-8">
              {PROJECTOR_LOCATIONS.map((loc) => (
                <span key={loc} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black tracking-widest text-white/40 lg:text-xs">
                    {loc}
                  </span>
                  <PieceDots have={s.pieces[loc]} />
                </span>
              ))}
            </span>

            <span className="w-20 shrink-0 text-right lg:w-32">
              <span className="font-mono text-2xl font-black tabular-nums text-[var(--brand-1)] lg:text-5xl">
                {s.group.token_balance}
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-white/40 lg:text-xs">
                tokens
              </span>
            </span>
          </li>
        ))}
      </ol>

      {standings.length === 0 && (
        <p className="mt-16 text-center text-xl text-white/40">
          Waiting for groups…
        </p>
      )}
    </div>
  );
}
