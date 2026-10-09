"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePhaseTimer } from "@/components/PhaseTimerProvider";
import { StationStatusChip } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Phase, Station, StationStatus } from "@/lib/types";
import { cn, formatCountdown, friendlyError } from "@/lib/utils";

type StationRow = Pick<Station, "id" | "name" | "day" | "status">;

const PHASE_DAY: Record<string, 1 | 2> = { day1: 1, day2: 2 };
// The game Live control runs for each day.
const DAY_GAME: Record<string, string> = { "Day 1": "day1", "Day 2": "day2" };

// Live control header, beside the Day dropdown: that day's game. Set its
// length, Start (green) runs it for that long (fn_phase_control); while it
// runs: countdown, Pause / Resume, −5 / +5 min, End (red). It ends itself when
// time is up (fn_game_expire, 0052). A running game unlocks its game rules;
// starting it opens that day's stations, ending it closes them (0049). The
// countdown is separate from the Welcome page's, which follows the schedule.
// "n/m stations open" opens the per-station overrides.
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
  const [lengthDraft, setLengthDraft] = useState("");
  const [stations, setStations] = useState<StationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    const { data } = await supabase.from("stations").select("id, name, day, status").order("id");
    setStations((data as StationRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    loadStations();
    const channel = supabase
      .channel("live-control-stations")
      .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, loadStations)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStations, supabase]);

  async function control(p: Phase, action: "start" | "pause" | "resume" | "extend" | "end", minutes = 0) {
    const day = PHASE_DAY[p.key];
    // an unsaved length typed in the box counts for this Start
    const typed = Math.round(Number(lengthDraft));
    const minutesToRun = action === "start" && typed >= 1 && typed <= 24 * 60 ? typed : p.duration_minutes;
    if (action === "start" || action === "end") {
      const what = day ? ` Day ${day} stations will ${action === "start" ? "open" : "close"}.` : "";
      const length = action === "start" ? ` It runs for ${minutesToRun} min.` : "";
      if (!window.confirm(`${action === "start" ? "Start" : "End"} ${p.name}?${length}${what}`)) return;
    }
    setBusy(true);
    onError(null);
    if (action === "start" && minutesToRun !== p.duration_minutes) {
      const { error: lengthError } = await supabase
        .from("phases")
        .update({ duration_minutes: minutesToRun })
        .eq("key", p.key);
      if (lengthError) {
        setBusy(false);
        return onError(friendlyError(lengthError));
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

  // Length before Start (phases.duration_minutes; admin can write phases).
  async function saveLength(p: Phase) {
    const m = Math.round(Number(lengthDraft));
    if (!(m >= 1 && m <= 24 * 60)) return onError("Game length must be 1 to 1440 minutes.");
    setBusy(true);
    onError(null);
    const { error } = await supabase.from("phases").update({ duration_minutes: m }).eq("key", p.key);
    setBusy(false);
    if (error) onError(friendlyError(error));
    else {
      setLengthDraft("");
      onNotice(`${p.name}: length ${m} min`);
    }
  }

  async function setStationStatus(id: number, status: StationStatus) {
    const { error } = await supabase.rpc("fn_set_station_status", { p_station_id: id, p_status: status });
    if (error) onError(friendlyError(error));
    else setStations((s) => s.map((x) => (x.id === id ? { ...x, status } : x)));
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
  const openCount = dayStations.filter((s) => s.status !== "closed").length;

  return (
    <div className="relative flex flex-wrap items-center gap-3">
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${on ? "End" : "Start"} ${game.name}`}
        disabled={busy}
        onClick={() => control(game, on ? "end" : "start")}
        className="min-h-[52px] shrink-0 rounded-xl px-5 text-base font-bold disabled:opacity-60"
        // green to start, red while running (set inline: the admin theme restyles buttons)
        style={{ backgroundColor: on ? "#dc2626" : "#16a34a", color: "#fff" }}
      >
        {on ? `■ End ${game.name}` : `▶ Start ${game.name}`}
      </button>
      {left !== null ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-2xl font-black tabular-nums" role="timer" aria-label={`${game.name} time left`}>
            {formatCountdown(left)}
          </span>
          {game.state === "paused" ? (
            <button disabled={busy} onClick={() => control(game, "resume")} className="btn-secondary min-h-[36px] px-3 text-xs">
              ⏵ Resume
            </button>
          ) : (
            <button disabled={busy} onClick={() => control(game, "pause")} className="btn-secondary min-h-[36px] px-3 text-xs">
              ⏸ Pause
            </button>
          )}
          <button disabled={busy || left < 6 * 60} onClick={() => control(game, "extend", -5)} className="btn-secondary min-h-[36px] px-3 text-xs">
            −5
          </button>
          <button disabled={busy || game.state !== "active"} onClick={() => control(game, "extend", 5)} className="btn-secondary min-h-[36px] px-3 text-xs">
            +5
          </button>
        </div>
      ) : (
        !on && (
          <form
            className="flex items-center gap-1.5 text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              saveLength(game);
            }}
          >
            <span className="text-ink-faint">Length</span>
            <input
              type="number"
              min={1}
              className="input min-h-[36px] w-20 text-sm"
              aria-label={`${game.name} length in minutes`}
              value={lengthDraft || String(game.duration_minutes)}
              onChange={(e) => setLengthDraft(e.target.value)}
            />
            <span className="text-ink-faint">min</span>
            {lengthDraft && lengthDraft !== String(game.duration_minutes) && (
              <button disabled={busy} className="btn-secondary min-h-[36px] px-2.5 text-xs">
                Save
              </button>
            )}
          </form>
        )
      )}
      <div className="text-xs leading-5 text-ink-faint">
        <p className="font-semibold">
          {game.state === "active" ? "Running" : game.state === "paused" ? "Paused" : game.state === "ended" ? "Ended" : "Not started"}
        </p>
        <button
          type="button"
          onClick={() => setOpen(open ? null : game.key)}
          className="inline-flex min-h-0 items-center gap-0.5 font-semibold underline-offset-2 hover:underline"
          aria-expanded={!!open}
        >
          {openCount}/{dayStations.length} stations open
          <ChevronDown size={12} className={cn("transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] divide-y divide-paper-200 rounded-xl border border-paper-200 bg-white shadow-overlay">
          {dayStations.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <StationStatusChip status={s.status} />
              <select
                className="input min-h-[30px] w-28 text-xs"
                aria-label={`${s.name} status override`}
                value={s.status}
                onChange={(e) => setStationStatus(s.id, e.target.value as StationStatus)}
              >
                <option value="available">Available</option>
                <option value="in_progress">Busy</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          ))}
          {dayStations.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-faint">No {day} stations yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
