import { DOME_PLACE } from "../geo";

import type { V3 } from "../funfair/central/kit";

// DRAFT: the LakeFront Café venue (docs/map3d-lakefront-design.md), from Ben's photos: an open-air stage under a
// red ribbed shell, in a moat at the lake's west tip, with a grass amphitheatre on the west.
//
// Modelled in metres round the stage's centre: x north, y up, z east (the venue's group stands on DOME_PLACE,
// turned to the OSM footprint's bearing and scaled by UNITS_PER_M). The audience is on -z, the lake on +z.
// Angles `a` are measured from the audience axis (-z, west), turning towards north (+x).

export const DEG = Math.PI / 180;

/** The venue's centre in the world, and its turn (the OSM footprint's bearing). */
export const ORIGIN = DOME_PLACE.pos;
export const ROT_Y = DOME_PLACE.rotY;

/** The point at radius r and angle a (see above), at height y. */
export const polar = (r: number, a: number, y = 0): V3 => [r * Math.sin(a), y, -r * Math.cos(a)];

/** The stage: a round deck standing in the moat. */
export const STAGE_R = 11;
export const DECK_Y = 1.5;

/** The moat round the stage. Its water stands a little above the lake's (0.54 m), with a low kerb at the back. */
export const MOAT_R = 15.5;
export const WATER_Y = 0.68;
export const KERB = { t: 0.35, h: 0.85 };

/** The walkway round the moat: outer radius, top, and its arc (both sides of the axis; the kerb closes the back). */
export const RING_R = 18.5;
export const RING_Y = 0.95;
export const RING_ARC = 132 * DEG;

/** The amphitheatre: grass terraces from the walkway outwards, each one step higher, with a stone strip along its front. */
export const TERRACES = 7;
export const TERRACE_D = 2.0;
export const TERRACE_H = 0.34;
export const STONE_W = 0.5;
export const SEATS_ARC: [number, number] = [-102 * DEG, 102 * DEG];
/** The bank behind the top terrace, down to the lawn. */
export const BANK_W = 2.6;
/** Red-brick aisles through the terraces: their angles and half width. */
export const AISLES = [-64 * DEG, -22 * DEG, 22 * DEG, 64 * DEG];
export const AISLE_HW = 0.85;

/** The white footbridge across the moat, from the walkway to the stage. */
export const BRIDGE_A = 47 * DEG;
export const BRIDGE_HW = 1.1;

/** The back wall under the shell, round the back of the stage. */
export const WALL = { r: 10.3, a: [116 * DEG, 244 * DEG] as [number, number], h: 4.6, t: 0.4 };

/**
 * The shell. Its ribs all spring from the two feet, which stand on the span axis (x) at ±span, footZ in front of
 * the centre. Each rib is half an ellipse through both feet (half width span, height b), tilted back from upright
 * by its angle: the front arch leans out a little and is the tallest, the last rib lies low over the back wall.
 * `lift` stretches the shell upwards (Ben: 1.4, so it reads next to the map's A-blocks, which are drawn tall too).
 */
export const SHELL = {
  span: 15.5,
  footY: 1.3,
  footZ: -2,
  b: 14,
  lift: 1.4,
  ribs: [-6, 7, 20, 33, 46, 59, 72].map((d) => d * DEG),
  /** The covered part along the span: the ribs alone run on into the feet. */
  s0: 0.13 * Math.PI,
};
export const RIB_R = 0.32;
/** Thin slats between neighbouring ribs (painted on the shell surface). */
export const SLATS_PER_BAY = 5;

/** A point on the shell: `s` along the span (0 = south foot, π = north foot), `t` its tilt back from upright. */
export function shellPoint(s: number, t: number, inset = 0): V3 {
  const { span, footY, footZ, b, lift } = SHELL;
  const r = (b - inset) * Math.sin(s);
  return [-span * Math.cos(s), footY + r * Math.cos(t) * lift, footZ + r * Math.sin(t)];
}

/** Height of the shell's underside above the ground point (x, z), or null where the shell doesn't cover it. */
export function shellUnderside(x: number, z: number, inset = 0.4): number | null {
  const { span, footY, footZ, b, lift, ribs } = SHELL;
  if (Math.abs(x) >= span) return null;
  const r = (b - inset) * Math.sqrt(1 - (x / span) ** 2);
  const dz = z - footZ;
  if (Math.abs(dz) >= r) return null;
  const up = Math.sqrt(r * r - dz * dz);
  const t = Math.atan2(dz, up);
  if (t < ribs[0] || t > ribs[ribs.length - 1]) return null;
  return footY + up * lift;
}

/** Weeping willows along the lake shore, outside the amphitheatre (metres; checked against the lake outline). */
export const WILLOWS: [number, number, number][] = [
  [20.5, 9.5, 1],
  [27, 12, 0.9],
  [15.5, 18, 1.05],
  [-20, 11, 1],
  [-13, 17.5, 0.95],
  [-25.5, 14, 1.1],
];
