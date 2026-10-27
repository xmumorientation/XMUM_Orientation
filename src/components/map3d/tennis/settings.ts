"use client";

import { useMemo } from "react";

import { useInitialGroup, useProfile } from "@/components/ProfileProvider";
import { useConfig } from "@/components/useConfig";
import { ROLE_LABELS } from "@/lib/types";

import type { TennisSettings } from "./useTennisOnMap";

// DRAFT: the tennis game's settings on the map pages (docs/ROADMAP.md, item 9, batch T3b): Admin's switch, which
// reaches every phone through game_config's Realtime (useConfig), and who plays on this phone.

/** The game_config key of Live control's tennis switch: on, the game is open. Admin only (fn_set_config). */
export const TENNIS_SWITCH = "tennis_open";

export function useTennisSettings(): TennisSettings {
  const { config } = useConfig();
  const role = useProfile().role;
  const group = useInitialGroup();
  const value = config[TENNIS_SWITCH];
  const open = value === true || value === "true";
  // a Freshie or Faci plays in their group's name and colour; anyone else in their role's name and the default blue
  const name = group ? group.display_name?.trim() || group.name : ROLE_LABELS[role];
  const color = group?.color ?? "";
  return useMemo<TennisSettings>(() => ({ open, profile: { name, color }, net: "realtime" }), [open, name, color]);
}
