import { PIECES_PER_SET, PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

import { KEY_NAMES } from "./KeyEmblem";

import type { ItemsData } from "./types";

// State rules shared by the projector strip, the blueprint cards and (later)
// the map's projector layer, so they never disagree.

/** sleep: Day 1, nothing to light yet · dark: nobody lit it · ready: our key works here · ours / other: lit. */
export type LampState = "sleep" | "dark" | "ready" | "ours" | "other";

/** locked: Day 1 · collecting · key: 5/5, key unlocked · lit: we lit it · idle: someone else lit it · done: we lit another one. */
export type CardState = "locked" | "collecting" | "key" | "lit" | "idle" | "done";

const SHORT_LABEL: Record<ProjectorLocation, string> = { B1: "B1", A3: "A3", TF: "T&F" };

/** Code names used until the full map unlocks, so the page never gives a location away. */
export const CODE_NAMES: Record<ProjectorLocation, string> = { B1: "Star", A3: "Wheel", TF: "Orbit" };

export type ZoneName = { short: string; long: string };

/** What the viewer may call each location: its code name, or the real place once the map unlocks. */
export function zoneNames(data: ItemsData): Record<ProjectorLocation, ZoneName> {
  const name = (loc: ProjectorLocation): ZoneName =>
    data.mapUnlocked
      ? { short: SHORT_LABEL[loc], long: PROJECTOR_LABELS[loc] }
      : { short: CODE_NAMES[loc], long: KEY_NAMES[loc] };
  return { B1: name("B1"), A3: name("A3"), TF: name("TF") };
}

/** Fills {B1}, {A3} and {TF} in activity text with the names the viewer may see. */
export function fillZones(text: string, names: Record<ProjectorLocation, ZoneName>): string {
  return text.replace(/\{(B1|A3|TF)\}/g, (_, loc: ProjectorLocation) => names[loc].short);
}

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
