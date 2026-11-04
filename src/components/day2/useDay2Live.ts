"use client";

import { useEffect, useMemo } from "react";

import { useConfig } from "@/components/useConfig";
import { useDay2State } from "@/components/useDay2State";
import { isFinalStretch } from "@/lib/day2Moments";
import { loadProjectorStates, type ProjectorState } from "@/lib/projectorStates";
import { reloadSharedFeed, useSharedFeed, type FeedSource } from "@/lib/sharedFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

// Live Day 2 data for the alerts (Day2Alerts), the phase card and the tab bar.

const KEY = "day2_projector_states";

// fn_projector_states (0096) for any role: which projectors are lit, and which
// group lit one only to Committee tier or to that group. A projector change
// writes game_config 'lightbulbs_changed_at' (0096), which useConfig already
// hears, so this feed opens no channel of its own; the poll is a backstop.
function statesSource(): FeedSource<ProjectorState[]> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      return (await loadProjectorStates(supabase)) ?? undefined;
    },
    pollMs: 60_000,
  };
}

// The last 'lightbulbs_changed_at' seen, page wide, so one change reloads once
// however many components read the lights.
let lastChange: unknown;

export interface ProjectorLights {
  /** The lit projectors, in map order. */
  lit: ProjectorLocation[];
  /** The one the viewer's group lit, if any (0096 tells a group only its own). */
  ours: ProjectorLocation | null;
  /** False until the first answer arrives. */
  loaded: boolean;
}

/** The projectors, live. `enabled` false (e.g. no Day 2 game running) loads nothing. */
export function useProjectorLights(groupId: number | null = null, enabled = true): ProjectorLights {
  const states = useSharedFeed(enabled ? KEY : null, statesSource);
  const { config } = useConfig();
  const changedAt = config["lightbulbs_changed_at"];
  useEffect(() => {
    if (!enabled || changedAt === undefined || changedAt === lastChange) return;
    const first = lastChange === undefined;
    lastChange = changedAt;
    if (!first) reloadSharedFeed(KEY);
  }, [enabled, changedAt]);

  return useMemo(() => {
    const lit = PROJECTOR_LOCATIONS.filter((loc) => states?.some((s) => s.location === loc && s.activated_at));
    const ours =
      groupId == null ? null : (states?.find((s) => s.activated_at && s.activated_by_group === groupId)?.location ?? null);
    return { lit, ours, loaded: states !== undefined };
  }, [states, groupId]);
}

/** The funfair is open while the Day 2 game runs: the final stretch. */
export function useFinalStretch(): boolean {
  return isFinalStretch(useDay2State());
}
