import type { SupabaseClient } from "@supabase/supabase-js";

import { PROJECTOR_LABELS, PROJECTOR_SHORT_LABELS, type ProjectorLocation } from "@/lib/types";

// Where each projector stands: game_config projector_place_<location> (0097),
// {"name": "B1 Basement", "short": "B1"}, set on Admin → Puzzles and HOGM's
// Game control → Puzzles. A missing or empty value falls back to the default
// in code. Plain functions, so server pages (/activate) can use them too; on
// client pages use useProjectorPlaces() (useConfig.ts).

export type ProjectorPlace = { name: string; short: string };

export const PLACE_NAME_MAX = 40;
export const PLACE_SHORT_MAX = 8;

export const placeKey = (loc: ProjectorLocation) => `projector_place_${loc}`;

export function projectorPlaces(config: Record<string, unknown>): Record<ProjectorLocation, ProjectorPlace> {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const place = (loc: ProjectorLocation): ProjectorPlace => {
    const v = config[placeKey(loc)] as { name?: unknown; short?: unknown } | null | undefined;
    return {
      name: text(v?.name, PLACE_NAME_MAX) || PROJECTOR_LABELS[loc],
      short: text(v?.short, PLACE_SHORT_MAX) || PROJECTOR_SHORT_LABELS[loc],
    };
  };
  return { B1: place("B1"), A3: place("A3"), TF: place("TF") };
}

/** The default places, for previews and pages that have no config yet. */
export const DEFAULT_PLACES = projectorPlaces({});

/** A Freshie's or Faci's view of the places: only the projectors their group has earned, else null (code name). */
export type ProjectorClues = Record<ProjectorLocation, { place: ProjectorPlace; imageUrl: string | null } | null>;

export const NO_CLUES: ProjectorClues = { B1: null, A3: null, TF: null };

type ClueRow = { location: ProjectorLocation; name: string | null; short: string | null; image_url: string | null };

/**
 * fn_my_projector_clues (0098): the picture and place of each projector the caller's group has earned (all 5
 * pieces, or it lit it). "missing" until 0098 is applied; null when the call fails.
 */
export async function loadProjectorClues(supabase: SupabaseClient): Promise<ProjectorClues | "missing" | null> {
  const { data, error } = await supabase.rpc("fn_my_projector_clues");
  if (error) return error.code === "PGRST202" ? "missing" : null;
  const clues = { ...NO_CLUES };
  for (const r of (data ?? []) as ClueRow[]) {
    const place = projectorPlaces({ [placeKey(r.location)]: { name: r.name, short: r.short } })[r.location];
    clues[r.location] = { place, imageUrl: r.image_url };
  }
  return clues;
}

/** Places as the map shows them: null where the viewer may not know the place yet. */
export type MapPlaces = Record<ProjectorLocation, ProjectorPlace | null>;
