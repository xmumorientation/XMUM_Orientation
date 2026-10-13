"use client";

import { Pause, Play, Plus, Square } from "lucide-react";
import { useMemo, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { useConfig } from "@/components/useConfig";
import { gameLength, otherGameRunning, saveGameLength } from "@/lib/gameLength";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase } from "@/lib/types";
import { formatCountdown, friendlyError } from "@/lib/utils";

import { ConfirmSheet, StatusLine, useStatus } from "./parts";

// Start / end each day's game and set its length. Same calls as Admin →
// Live control (GameToggles): the length (lib/gameLength), then
// fn_phase_control. Starting a game opens that day's stations; ending it
// closes them (0049). The live fn_phase_control only adds time and runs one
// game at a time, so there is no −5 and Start waits for the other day's game.

const GAMES = [
  { key: "day1", day: 1 },
  { key: "day2", day: 2 },
] as const;

type Action = "start" | "pause" | "resume" | "extend" | "end";

function GameCard({ game, day }: { game: Phase; day: 1 | 2 }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { phases, offsetMs, tick } = usePhaseTimer();
  const { config } = useConfig();
  const { error, setError, notice, flash } = useStatus();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"start" | "end" | null>(null);
  void tick;

  const on = game.state === "active" || game.state === "paused";
  const left =
    game.state === "paused"
      ? (game.paused_remaining ?? 0)
      : game.state === "active" && game.ends_at
        ? Math.max(0, (new Date(game.ends_at).getTime() - (Date.now() + offsetMs)) / 1000)
        : null;
  const saved = gameLength(config, game);
  const typed = Math.round(Number(draft));
  const typedOk = draft !== "" && typed >= 1 && typed <= 24 * 60;
  const minutes = typedOk ? typed : saved;
  const blocker = otherGameRunning(phases, game);
  const stateLabel =
    game.state === "active" ? "LIVE" : game.state === "paused" ? "PAUSED" : game.state === "ended" ? "ENDED" : "NOT STARTED";

  async function control(action: Action, extend = 0) {
    setBusy(true);
    setError(null);
    if (action === "start" && minutes !== saved) {
      const lengthError = await saveGameLength(supabase, game, minutes);
      if (lengthError) {
        setBusy(false);
        setAsking(null);
        return setError(lengthError);
      }
      setDraft("");
    }
    const { error } = await supabase.rpc("fn_phase_control", {
      p_phase_key: game.key,
      p_action: action,
      p_extend_minutes: extend,
    });
    setBusy(false);
    setAsking(null);
    if (error) return setError(friendlyError(error));
    flash(
      action === "extend"
        ? `+${extend} min`
        : action === "start"
          ? `${game.name} started`
          : action === "end"
            ? `${game.name} ended`
            : action === "pause"
              ? "Paused"
              : "Resumed"
    );
  }

  return (
    <article className="gc-card gc-game" data-state={game.state}>
      <header className="gc-game-head">
        <span className="gc-eyebrow">Day {day}</span>
        <span className="gc-chip" data-tone={on ? (game.state === "paused" ? "warn" : "live") : "off"}>
          {stateLabel}
        </span>
      </header>
      <h3 className="gc-h3">{game.name}</h3>

      {left !== null ? (
        <>
          <div className="gc-clock" role="timer" aria-label={`${game.name} time left`}>
            {formatCountdown(left)}
          </div>
          <div className="gc-row3">
            {game.state === "paused" ? (
              <button type="button" className="gc-btn" disabled={busy} onClick={() => control("resume")}>
                <Play size={16} aria-hidden /> Resume
              </button>
            ) : (
              <button type="button" className="gc-btn" disabled={busy} onClick={() => control("pause")}>
                <Pause size={16} aria-hidden /> Pause
              </button>
            )}
            <button
              type="button"
              className="gc-btn"
              disabled={busy}
              onClick={() => control("extend", 5)}
              aria-label="5 minutes more"
            >
              <Plus size={16} aria-hidden /> 5 min
            </button>
            <button type="button" className="gc-btn gc-btn-stop" disabled={busy} onClick={() => setAsking("end")}>
              <Square size={14} aria-hidden /> End
            </button>
          </div>
        </>
      ) : (
        <div className="gc-start">
          <label className="gc-length">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              className="gc-input"
              aria-label={`${game.name} length in minutes`}
              value={draft || String(saved)}
              onChange={(e) => setDraft(e.target.value)}
            />
            <span>min</span>
          </label>
          <button
            type="button"
            className="gc-btn gc-btn-go gc-grow"
            disabled={busy || !!blocker || (draft !== "" && !typedOk)}
            onClick={() => setAsking("start")}
          >
            <Play size={16} aria-hidden /> Start
          </button>
        </div>
      )}
      {!on && blocker && <p className="gc-muted">End {blocker.name} first.</p>}

      <StatusLine error={error} notice={notice} />

      <ConfirmSheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        onConfirm={() => asking && control(asking)}
        busy={busy}
        danger={asking === "end"}
        title={asking === "end" ? `End ${game.name}?` : `Start ${game.name}?`}
        confirmLabel={asking === "end" ? "End game" : `Start · ${minutes} min`}
        body={
          asking === "end"
            ? `Day ${day} stations close.`
            : `Runs for ${minutes} minutes. Day ${day} stations open.`
        }
      />
    </article>
  );
}

export function GameSection() {
  const { phases } = usePhaseTimer();
  const games = GAMES.map((g) => ({ ...g, phase: phases.find((p) => p.key === g.key) }));
  return (
    <div className="gc-grid2">
      {games.map(({ key, day, phase }) =>
        phase ? (
          <GameCard key={key} game={phase} day={day} />
        ) : (
          <p key={key} className="gc-empty">
            Day {day} game not set up yet.
          </p>
        )
      )}
    </div>
  );
}
