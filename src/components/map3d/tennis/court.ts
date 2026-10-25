import { SPORTS } from "../geo";
import type { CameraView, Vec3 } from "../CampusScene";
import { courtCells, LIFT, SPEC, type Cell } from "../courts";

// DRAFT: the tennis game's courts (docs/ROADMAP.md, item 9). The game works in metres in each court's own frame:
// x along the court (the net at 0, player 0's end at -x), z across it, y up. courtFrame() puts that frame on the
// map, where the courts are drawn at true scale (sports.tsx), with heights LIFTed like the net.

/** The three tennis courts, west to east, as sports.tsx draws them. */
export const TENNIS_COURTS: Cell[] = SPORTS.filter((b) => b.sport === "tennis").flatMap(courtCells);

/** Court sizes in metres (the court frame). */
export const COURT = {
  /** The baselines are at x = ±halfL. */
  halfL: SPEC.tennis.L / 2,
  /** The singles sidelines are at z = ±halfW. */
  halfW: 8.23 / 2,
  /** The net's top as drawn (sports.tsx draws it LIFT times life size). */
  netTop: 1.07 * LIFT,
};

/** Group transform from a court's frame (metres) to the world. */
export function courtFrame(c: Cell) {
  return {
    position: [c.cx, 0, c.cz] as Vec3,
    rotY: c.alongX ? 0 : -Math.PI / 2,
    scale: c.s,
  };
}

/**
 * Camera presets (pitch and lens in degrees; the near baseline's share of the screen's width, and how far down the
 * screen it sits). A wide screen gets a TV broadcast's view: low, from far behind, with a long lens. Its pitch is
 * as low as the map's controls allow (maxPolarAngle 1.3 in CampusScene). An upright phone is narrow, so to hold
 * the court's width its camera stands higher.
 */
const WIDE = { aspect: 1.6, pitch: 16.5, fov: 18, width: 0.66, near: 0.82 };
const TALL = { aspect: 0.46, pitch: 45, fov: 30, width: 0.84, near: 0.84 };

export type CourtView = CameraView & { fov: number };

/** The view from behind player 0's end for a screen of this aspect (width / height), blending the two presets. */
export function courtView(c: Cell, aspect: number): CourtView {
  const t = Math.min(1, Math.max(0, (aspect - TALL.aspect) / (WIDE.aspect - TALL.aspect)));
  const mix = (k: keyof typeof WIDE) => TALL[k] + (WIDE[k] - TALL[k]) * t;
  const pitch = (mix("pitch") * Math.PI) / 180;
  const fov = mix("fov");
  const k = Math.tan((fov * Math.PI) / 360);
  // the near baseline's depth in the view and its height on screen, then the camera's distance behind it and height
  const depth = SPEC.tennis.W / 2 / (k * Math.min(aspect, WIDE.aspect) * mix("width"));
  const up = -(2 * mix("near") - 1) * depth * k;
  const back = depth * Math.cos(pitch) + up * Math.sin(pitch);
  const height = depth * Math.sin(pitch) - up * Math.cos(pitch);
  const camX = -COURT.halfL - back;
  const at = (x: number, y: number): Vec3 =>
    c.alongX ? [c.cx + x * c.s, y * c.s, c.cz] : [c.cx, y * c.s, c.cz + x * c.s];
  return { position: at(camX, height), target: at(camX + height / Math.tan(pitch), 0), fov };
}
