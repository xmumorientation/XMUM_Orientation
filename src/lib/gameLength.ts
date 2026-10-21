import type { SupabaseClient } from "@supabase/supabase-js";

import type { Phase } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// A day's game length. The live database runs the bonding-session
// fn_phase_control (migrations 0032 / 0036): Start takes the length from
// game_config "bonding_session_duration_day1" / "_day2" when set, not from
// phases.duration_minutes. Both are written so Start uses the new length
// either way. Used by Admin → Live control and HOGM → Game control.

export const gameLengthKey = (phaseKey: string) => `bonding_session_duration_${phaseKey}`;

/** The length Start will use: the game_config value if set, else the phase's own. */
export function gameLength(config: Record<string, unknown>, phase: Phase): number {
  const n = Number(config[gameLengthKey(phase.key)]);
  return Number.isInteger(n) && n > 0 ? n : phase.duration_minutes;
}

/** Saves a new length. Returns an error message, or null when saved. */
export async function saveGameLength(supabase: SupabaseClient, phase: Phase, minutes: number): Promise<string | null> {
  if (!(Number.isInteger(minutes) && minutes >= 1 && minutes <= 24 * 60)) return "Game length must be 1 to 1440 minutes.";
  const { error: cfgError } = await supabase.rpc("fn_set_config", { p_key: gameLengthKey(phase.key), p_value: minutes });
  if (cfgError) return friendlyError(cfgError);
  const { error } = await supabase.from("phases").update({ duration_minutes: minutes }).eq("key", phase.key);
  return error ? friendlyError(error) : null;
}

/** Another game is running or paused: the database refuses a second one (ANOTHER_SESSION_ACTIVE). */
export function otherGameRunning(phases: Phase[], phase: Phase): Phase | undefined {
  return phases.find((p) => p.key !== phase.key && (p.state === "active" || p.state === "paused"));
}

/** Phases a reset puts back to Not started. */
export const RESET_PHASES = ["day1", "day2", "endgame"] as const;

/**
 * Rehearsal only: every game back to Not started, so a new run can start from
 * Day 1. Uses the live fn_phase_control's "reset" action (bonding-session
 * 0036: state pending, timers cleared); the repo's 0003 version has no reset
 * and answers UNKNOWN_ACTION. The phases trigger (0065) then moves every GM
 * back to their Day 1 station. Returns an error message, or null when done.
 */
export async function resetGames(supabase: SupabaseClient, phases: Phase[]): Promise<string | null> {
  for (const p of phases) {
    if (!(RESET_PHASES as readonly string[]).includes(p.key) || p.state === "pending") continue;
    const { error } = await supabase.rpc("fn_phase_control", { p_phase_key: p.key, p_action: "reset", p_extend_minutes: 0 });
    if (error) return `${p.name}: ${friendlyError(error)}`;
  }
  return null;
}
