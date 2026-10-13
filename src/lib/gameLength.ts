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
