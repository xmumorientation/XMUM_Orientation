"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { Card, StationStatusChip } from "@/components/ui";
import { useConfig } from "@/components/useConfig";
import { gameLength, otherGameRunning, saveGameLength } from "@/lib/gameLength";
import { useDay2State } from "@/components/useDay2State";
import { useStations } from "@/components/useStations";
import { effectiveStatus } from "@/lib/day2";
import { reloadSharedFeed, setSharedFeed } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase, Station, StationStatus } from "@/lib/types";
import { cn, formatCountdown, friendlyError } from "@/lib/utils";

type StationRow = Pick<Station, "id" | "name" | "day" | "status" | "risk_tier">;
const NO_STATIONS: StationRow[] = [];

const PHASE_DAY: Record<string, 1 | 2> = { day1: 1, day2: 2 };
// The game Live control runs for each day.
const DAY_GAME: Record<string, string> = { "Day 1": "day1", "Day 2": "day2" };

// Live control header, beside the Day dropdown: that day's game. Set its
// length, Start (green) runs it for that long (fn_phase_control); while it
// runs: countdown, +5 min, End (red). There is no Pause. It ends itself when
// time is up (fn_game_expire, 0052). A running game unlocks its game rules.
// It does NOT touch station statuses (0078): Start / End / the countdown only
// run the timer, and every station is set by hand by Admin (here, or on Admin
// → Stations) or by its Game Master. The countdown is separate from the
// Welcome page's, which follows the schedule. The game also starts by itself
// when its schedule item ("Day 1 Game") reaches its planned start
// (fn_game_autostart, 0101); Start here is for test runs before then.
// "n/m stations open" lists the day's stations with their status.
// The live fn_phase_control (bonding-session 0032 / 0036) only adds time, runs
// one game at a time and takes the length from game_config
// (lib/gameLength), so there is no -5 and Start waits for the other game.
export function GameToggles({
  day,
  onError,
  onNotice,
}: {
  /** Live control's day filter: only this day's games are shown. */
  day: string;
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { phases, offsetMs, tick } = usePhaseTimer();
  const { config } = useConfig();
  const [lengthDraft, setLengthDraft] = useState("");
  const stations: StationRow[] = useStations() ?? NO_STATIONS;
  const day2 = useDay2State();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const loadStations = useCallback(() => reloadSharedFeed("stations"), []);

  async function control(p: Phase, action: "start" | "resume" | "extend" | "end", minutes = 0) {
    // an unsaved length typed in the box counts for this Start
    const typed = Math.round(Number(lengthDraft));
    const saved = gameLength(config, p);
    const minutesToRun = action === "start" && typed >= 1 && typed <= 24 * 60 ? typed : saved;
    if (action === "start" || action === "end") {
      const length = action === "start" ? ` It runs for ${minutesToRun} min.` : "";
      // Only the timer: station statuses are not changed.
      if (!window.confirm(`${action === "start" ? "Start" : "End"} ${p.name}?${length} Station statuses are not changed.`)) return;
    }
    setBusy(true);
    onError(null);
    if (action === "start" && minutesToRun !== saved) {
      const lengthError = await saveGameLength(supabase, p, minutesToRun);
      if (lengthError) {
        setBusy(false);
        return onError(lengthError);
      }
      setLengthDraft("");
    }
    const { error } = await supabase.rpc("fn_phase_control", {
      p_phase_key: p.key,
      p_action: action,
      p_extend_minutes: minutes,
    });
    setBusy(false);
    if (error) onError(friendlyError(error));
    else {
      onNotice(
        `${p.name}: ${action === "extend" ? `${minutes > 0 ? "+" : ""}${minutes} min` : action === "start" ? "started" : action === "end" ? "ended" : `${action}d`}`
      );
      loadStations();
    }
  }

  // Length before Start (lib/gameLength: the game_config key Start reads, and the phase).
  async function saveLength(p: Phase) {
    const m = Math.round(Number(lengthDraft));
    setBusy(true);
    onError(null);
    const error = await saveGameLength(supabase, p, m);
    setBusy(false);
    if (error) onError(error);
    else {
      setLengthDraft("");
      onNotice(`${p.name}: length ${m} min`);
    }
  }

  async function setStationStatus(id: number, status: StationStatus) {
    const { error } = await supabase.rpc("fn_set_station_status", { p_station_id: id, p_status: status });
    if (error) onError(friendlyError(error));
    else setSharedFeed<Station[]>("stations", (s) => (s ?? []).map((x) => (x.id === id ? { ...x, status } : x)));
  }

  const game = phases.find((p) => p.key === DAY_GAME[day]);
  if (!game) return null;
  const on = game.state === "active" || game.state === "paused";
  void tick;
  const left =
    game.state === "paused"
      ? (game.paused_remaining ?? 0)
      : game.state === "active" && game.ends_at
        ? Math.max(0, (new Date(game.ends_at).getTime() - (Date.now() + offsetMs)) / 1000)
        : null;
  const stationDay = PHASE_DAY[game.key];
  const dayStations = stations.filter((s) => s.day === stationDay);
  const openCount = dayStations.filter((s) => effectiveStatus(s, day2, day2.state) !== "closed").length;
  const length = gameLength(config, game);
  const blocker = on ? undefined : otherGameRunning(phases, game);

  return (
    <Card className="av-game">
      <div className="av-game-main">
        <div className="av-game-info">
          <p className="av-game-state" data-state={game.state}>
            {game.state === "active" ? "Running" : game.state === "paused" ? "Paused" : game.state === "ended" ? "Ended" : "Not Started"}
            {blocker && ` / end ${blocker.name} first`}
          </p>
          {left !== null ? (
            <div className="av-game-clock">
              <span className="av-clock" role="timer" aria-label={`${game.name} time left`}>
                {formatCountdown(left)}
              </span>
              {/* No Pause (removed 0102); Resume only frees a game paused before then. */}
              {game.state === "paused" && (
                <button disabled={busy} onClick={() => control(game, "resume")} className="btn-secondary px-3 text-xs">
                  ⏵ Resume
                </button>
              )}
              <button disabled={busy} onClick={() => control(game, "extend", 5)} className="btn-secondary px-3 text-xs">
                +5mins
              </button>
            </div>
          ) : (
            !on && (
              <form
                className="av-game-length"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveLength(game);
                }}
              >
                <span className="text-ink-faint">Length</span>
                <input
                  type="number"
                  min={1}
                  className="input w-20 text-sm"
                  aria-label={`${game.name} length in minutes`}
                  value={lengthDraft || String(length)}
                  onChange={(e) => setLengthDraft(e.target.value)}
                />
                <span className="text-ink-faint">min</span>
                {lengthDraft && lengthDraft !== String(length) && (
                  <button disabled={busy} className="btn-secondary px-2.5 text-xs">
                    Save
                  </button>
                )}
              </form>
            )
          )}
        </div>
        <button
          type="button"
          aria-pressed={on}
          aria-label={`${on ? "End" : "Start"} ${game.name}`}
          disabled={busy || !!blocker}
          title={blocker ? `End ${blocker.name} first` : undefined}
          onClick={() => control(game, on ? "end" : "start")}
          className="av-go"
          data-on={on}
        >
          {on ? `■ End ${game.name}` : `▶ Start ${game.name}`}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen(open ? null : game.key)}
        className="av-disclosure"
        aria-expanded={!!open}
      >
        {openCount}/{dayStations.length} stations open
        <ChevronDown size={14} className={cn("transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="av-stations">
          {dayStations.map((s) => (
            <div key={s.id} className="av-station">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <StationStatusChip status={effectiveStatus(s, day2, day2.state)} />
              <select
                className="input w-32 text-sm"
                aria-label={`${s.name} status`}
                value={s.status}
                onChange={(e) => setStationStatus(s.id, e.target.value as StationStatus)}
              >
                <option value="available">Available</option>
                <option value="in_progress">In Progress</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          ))}
          {dayStations.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-faint">No {day} stations yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}
