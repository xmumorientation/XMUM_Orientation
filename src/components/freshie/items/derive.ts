import { PIECES_PER_SET, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

import type { ItemsData } from "./types";

// State rules shared by the projector strip, the blueprint cards and (later)
// the map's projector layer, so they never disagree.

/** sleep: Day 1, nothing to light yet · dark: nobody lit it · ready: our key works here · ours / other: lit. */
export type LampState = "sleep" | "dark" | "ready" | "ours" | "other";

/** locked: Day 1 · collecting · key: 5/5, key unlocked · lit: we lit it · idle: someone else lit it · done: we lit another one. */
export type CardState = "locked" | "collecting" | "key" | "lit" | "idle" | "done";

export const SHORT_LABEL: Record<ProjectorLocation, string> = { B1: "B1", A3: "A3", TF: "T&F" };

export function ourLitLocation(data: ItemsData): ProjectorLocation | null {
  return PROJECTOR_LOCATIONS.find((loc) => data.projectors[loc]?.isUs) ?? null;
}

export function lampState(data: ItemsData, loc: ProjectorLocation): LampState {
  if (data.phase === "day1") return "sleep";
  const lit = data.projectors[loc];
  if (lit) return lit.isUs ? "ours" : "other";
  if (!ourLitLocation(data) && data.pieces[loc].length >= PIECES_PER_SET) return "ready";
  return "dark";
}

export function cardState(data: ItemsData, loc: ProjectorLocation): CardState {
  if (data.phase === "day1") return "locked";
  const lit = data.projectors[loc];
  if (lit?.isUs) return "lit";
  if (lit) return "idle";
  if (ourLitLocation(data)) return "done";
  if (data.pieces[loc].length >= PIECES_PER_SET) return "key";
  return "collecting";
}

export function keyLocations(data: ItemsData): ProjectorLocation[] {
  return PROJECTOR_LOCATIONS.filter((loc) => cardState(data, loc) === "key");
}
