"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { fromReal, UNITS_PER_M, type Placed } from "../geo";
import { DORMS_M } from "./dorms";

// DRAFT: shared pieces of the Vortexa Funfair (docs/map3d-funfair-design.md).
// Each zone is powered off (0) until the keys Admin assigns to it are
// unlocked, then powers up (1). Rides are modelled in metres and placed with
// dormPlace(); wrap a zone's content in <group scale={UNITS_PER_M}> at the
// footprint's world position, or use metresToWorld for single points.

export type ZoneKey = "west" | "central" | "east";

/** Props every zone component takes. `power` is the target (0 off, 1 on); animate towards it with usePowerRamp. */
export type ZoneProps = { power: number; night: boolean; lite: boolean };

/** Which dorm footprints each zone covers (design doc, "Zones and rides"). */
export const ZONE_DORMS: Record<ZoneKey, string[]> = {
  west: ["LY1", "LY2", "LY3", "LY6", "LY7"],
  central: ["LY4", "LY5", "LY8", "LY9"],
  east: ["D1", "D2", "D3", "D4", "D5", "Canteen D6"],
};

/**
 * Phones (lite) draw the funfair without bloom or point lights, so at night a powered zone would hardly stand out
 * from map distances. Lite makes the lights bigger (bulbs and neon tubes, this factor; lite also has fewer bulbs),
 * lets the powered rides glow a little by themselves (LITE_SELF_LIT), and adds soft halos (glow.tsx).
 */
export const LITE_LIGHT_SCALE = 1.6;
/** How brightly powered paint glows by itself at night in lite (no point lights there). */
export const LITE_SELF_LIT = 0.35;
/** How brightly the paving glows at night in lite once a zone is on (lit walkways). */
export const LITE_PAVING_LIT = 0.14;

/** The website palette (src/components/home/vortexa.css). */
export const VX = {
  yellow: "#f2ff0b",
  cyan: "#0dfcfd",
  pink: "#fe06ab",
  lilac: "#e0b4fc",
  orange: "#fc9e3d",
  red: "#bc071d",
  navy: "#063a65",
  blush: "#ffb1c1",
} as const;

/** The zones' own colours on the map (pink west, cyan central, yellow east). */
export const ZONE_COLOR: Record<ZoneKey, string> = { west: VX.pink, central: VX.cyan, east: VX.yellow };

/** A dorm footprint in the world (same frame as BLOCKS in geo.ts). rotY turns the long side to its bearing. */
export function dormPlace(name: string): Placed {
  const r = DORMS_M[name];
  return {
    pos: fromReal(r.e, r.n),
    hx: (r.length / 2) * UNITS_PER_M,
    hz: (r.width / 2) * UNITS_PER_M,
    rotY: (-r.bearing * Math.PI) / 180,
  };
}

/** Real metres east / north of the Track & Field GPS point → world [x, z]. */
export const metresToWorld = fromReal;

/**
 * Eases a zone's power towards its target over `seconds` (the power-up
 * sequence). Read `.current` inside useFrame; it never re-renders.
 *
 * A map that draws on demand (CampusScene's card, and lite mode) draws no
 * frames by itself, so the ramp asks for one when the target changes and one
 * per step until it arrives: the power-up plays to the end there too.
 */
export function usePowerRamp(target: number, seconds = 2) {
  const value = useRef(target);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (value.current !== target) invalidate();
  }, [target, invalidate]);
  useFrame((state, dt) => {
    const step = Math.min(dt, 0.1) / seconds;
    const v = value.current;
    value.current = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    if (value.current !== target) state.invalidate();
  });
  return value;
}
