"use client";

import { Pause, Trophy } from "lucide-react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useDay2State } from "@/components/useDay2State";
import { SEGMENTS } from "@/lib/day2";
import type { Phase } from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import "./freshie.css";

// The game's status for the page headers (GroupHeader for Freshies and
// Facilitators, OpsHeader for HOF, HOGM, Committee and GM): a pill with the
// running phase and its time left (or Break / Game over), and, while Day 1
// or Day 2 runs, a progress track for that day (GameTrack). Colours come from the header's --fh-accent, so a group
// header follows the group and OpsHeader keeps the Welcome page's cyan.

export type GameStatus =
  | { kind: "live" | "paused"; phase: Phase; remaining: number }
  | { kind: "break"; next: Phase | null }
  | { kind: "waiting"; next: Phase | null }
  | { kind: "over" };

function gameStatus(phases: Phase[], serverNow: number): GameStatus {
  const current = phases.find((p) => p.state === "active") ?? phases.find((p) => p.state === "paused");
  if (current) {
    const remaining =
      current.state === "paused"
        ? (current.paused_remaining ?? 0)
        : current.ends_at
          ? Math.max(0, (new Date(current.ends_at).getTime() - serverNow) / 1000)
          : 0;
    return { kind: current.state === "paused" ? "paused" : "live", phase: current, remaining };
  }
  const endgame = phases.find((p) => p.is_endgame || p.key === "endgame");
  if (endgame?.state === "ended") return { kind: "over" };
  const next = phases.find((p) => p.state === "pending") ?? null;
  return phases.some((p) => p.state === "ended") ? { kind: "break", next } : { kind: "waiting", next };
}

/** How much of a phase has run, 0 to 1. */
function phaseDone(p: Phase, serverNow: number) {
  if (p.state === "ended") return 1;
  if (p.state === "pending") return 0;
  const total = p.duration_minutes * 60;
  if (total <= 0) return 0;
  const left =
    p.state === "paused"
      ? (p.paused_remaining ?? 0)
      : p.ends_at
        ? (new Date(p.ends_at).getTime() - serverNow) / 1000
        : total;
  return Math.min(1, Math.max(0, 1 - left / total));
}

/** The phases in order and the game's status, ticking every second. */
export function useGameStatus() {
  const { phases, offsetMs, tick } = usePhaseTimer();
  void tick;
  const serverNow = Date.now() + offsetMs;
  const ordered = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  return { phases: ordered, status: gameStatus(ordered, serverNow), serverNow };
}

export function GameStatusPill({ status }: { status: GameStatus }) {
  switch (status.kind) {
    case "live":
    case "paused": {
      const endgame = status.phase.is_endgame;
      return (
        <span className="fa-pill" data-kind={endgame ? "endgame" : status.kind} role="status">
          {status.kind === "paused" ? <Pause size={12} aria-hidden /> : <i aria-hidden />}
          <span className="fa-pill-tag fh-mono">{status.kind === "paused" ? "PAUSED" : endgame ? "FINAL" : "LIVE"}</span>
          <span className="fa-pill-name">{status.phase.name}</span>
          {status.phase.ends_at || status.kind === "paused" ? (
            <b className="fh-mono">{formatCountdown(status.remaining)}</b>
          ) : null}
        </span>
      );
    }
    case "over":
      return (
        <span className="fa-pill" data-kind="over" role="status">
          <Trophy size={13} aria-hidden />
          <span className="fa-pill-tag fh-mono">GAME OVER</span>
        </span>
      );
    default:
      return (
        <span className="fa-pill" data-kind="idle" role="status">
          <span className="fa-pill-tag fh-mono">{status.kind === "break" ? "BREAK" : "SOON"}</span>
          {status.next && <span className="fa-pill-name">Next: {status.next.name}</span>}
        </span>
      );
  }
}

/**
 * The running day's progress, shown only while Day 1 or Day 2 is on (or
 * paused). Day 1 is one bar. Day 2 is split by Admin's inner schedule
 * (fn_day2_state, 0102): Normal, Challenge, Normal, Funfair, each as long as
 * Admin set it. A segment Admin started by hand counts as reached, so the
 * segments before it fill up.
 */
export function GameTrack({ status, serverNow }: { status: GameStatus; serverNow: number }) {
  const day2 = useDay2State();
  if (status.kind !== "live" && status.kind !== "paused") return null;
  const p = status.phase;
  if (p.is_endgame || (p.key !== "day1" && p.key !== "day2")) return null;

  const s = day2.state;
  const t0 = s?.game_started_at ? new Date(s.game_started_at).getTime() : NaN;
  const t1 = s?.game_ends_at ? new Date(s.game_ends_at).getTime() : NaN;
  if (p.key === "day2" && s?.game_on && t1 > t0) {
    const total = t1 - t0;
    const at = (min: number) => Math.min(total, Math.max(0, min * 60_000));
    const edges = [0, at(s.challenge_start_min), at(s.challenge_end_min), at(s.funfair_start_min), total];
    for (let i = 1; i < edges.length; i++) edges[i] = Math.max(edges[i], edges[i - 1]);
    const current = SEGMENTS.findIndex((seg) => seg.key === day2.segment);
    const elapsed = serverNow - t0;
    const segs = SEGMENTS.map((seg, i) => {
      const from = edges[i];
      const to = edges[i + 1];
      const fill = i < current ? 1 : i > current ? 0 : to > from ? (elapsed - from) / (to - from) : 1;
      return { ...seg, from, to, fill: Math.min(1, Math.max(0, fill)), now: i === current };
    }).filter((seg) => seg.to > seg.from || seg.now);
    return (
      <div className="fa-track" data-day="2" aria-label={`Day 2: ${SEGMENTS[current]?.label ?? ""}`}>
        {segs.map((seg) => (
          <span
            key={seg.key}
            className="fa-seg"
            data-seg={seg.key}
            data-now={seg.now || undefined}
            style={{ flexGrow: Math.max(seg.to - seg.from, 1) }}
            title={seg.label}
          >
            <span style={{ width: `${seg.fill * 100}%` }} />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="fa-track" data-day="1" aria-hidden>
      <span className="fa-seg" data-now style={{ flexGrow: 1 }}>
        <span style={{ width: `${phaseDone(p, serverNow) * 100}%` }} />
      </span>
    </div>
  );
}
