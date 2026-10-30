"use client";

import { Pause, Trophy } from "lucide-react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import type { Phase } from "@/lib/types";
import { formatCountdown } from "@/lib/utils";

import "./freshie.css";

// The game's status for the page headers (GroupHeader for Freshies and
// Facilitators, OpsHeader for HOF, HOGM, Committee and GM): a pill with the
// running phase and its time left (or Break / Game over), and a progress
// track with one segment per Live control phase, sized by its length and
// filled as it runs. Colours come from the header's --fh-accent, so a group
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

export function GameTrack({ phases, status, serverNow }: { phases: Phase[]; status: GameStatus; serverNow: number }) {
  if (phases.length === 0) return null;
  return (
    <div className="fa-track" data-over={status.kind === "over" || undefined} aria-hidden>
      {phases.map((p) => (
        <span
          key={p.id}
          className="fa-seg"
          data-endgame={p.is_endgame || undefined}
          data-state={p.state}
          style={{ flexGrow: Math.max(p.duration_minutes, 1) }}
        >
          <span style={{ width: `${phaseDone(p, serverNow) * 100}%` }} />
        </span>
      ))}
    </div>
  );
}
