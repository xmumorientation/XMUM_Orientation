import { DOME_PLACE, UNITS_PER_M } from "../geo";

import type { V3 } from "../funfair/central/kit";

// The LakeFront Café venue (docs/map3d-lakefront-design.md), from Ben's photos: an open-air stage under a
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

/** A venue point (metres) in world units: turned like the venue's group, scaled, and moved onto ORIGIN. */
export function toWorld3([x, y, z]: V3): V3 {
  const c = Math.cos(ROT_Y);
  const s = Math.sin(ROT_Y);
  return [ORIGIN[0] + (x * c + z * s) * UNITS_PER_M, y * UNITS_PER_M, ORIGIN[1] + (z * c - x * s) * UNITS_PER_M];
}

/**
 * Where Admin's preview of the concert (`?funfair_preview=lakefront`) takes the camera: behind the amphitheatre
 * and a little to the south, over the crowd to the stage with the lake behind it. `narrow` (a phone held upright)
 * stands further back, so the whole bowl fits.
 */
export function stageView(narrow: boolean): { position: V3; target: V3 } {
  const k = narrow ? 1.55 : 1;
  return { position: toWorld3([-100 * k, 148 * k, -143 * k]), target: toWorld3([0, 7, 0]) };
}

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

/**
 * Soft light pools at sunset and night (standby): centre, half sizes along x and z, colour. On the deck, on the
 * moat under the shell and in front, and the shell's glow spilling onto the lake just behind it.
 */
export const POOLS: { p: V3; r: [number, number]; c: string }[] = [
  { p: [0, DECK_Y + 0.12, 2.5], r: [8.5, 8.5], c: "#ffcf86" },
  { p: [-8.5, WATER_Y + 0.08, 9.5], r: [5, 5], c: "#e0b4fc" },
  { p: [8.5, WATER_Y + 0.08, 9.5], r: [5, 5], c: "#e0b4fc" },
  { p: [0, WATER_Y + 0.08, -13.3], r: [7, 3], c: "#0bbcbd" },
  { p: [0, 0.62, 21], r: [5, 6], c: "#9a76cf" },
];

/**
 * A light beam (a moving head, or a floor fixture): its source (metres), its aim (a unit vector), its length, its
 * width at the source and at the end, and its colour. It sweeps by turning its aim about `axis` by
 * sway[0] · sin(time · sway[1] + sway[2]) (amplitude in radians, speed in radians a second, phase).
 */
export type Beam = { p: V3; dir: V3; len: number; w0: number; w1: number; c: string; axis: V3; sway: V3 };

/** Up, leaning `lean` (radians from upright) towards the ground direction h = [x, z]. */
function aim(h: [number, number], lean: number): V3 {
  const l = Math.hypot(h[0], h[1]);
  return [(Math.sin(lean) * h[0]) / l, Math.cos(lean), (Math.sin(lean) * h[1]) / l];
}

const BEAM_CYAN = "#22d3ff";
const BEAM_BLUE = "#3b6cff";
const BEAM_PINK = "#ff2fb8";
const BEAM_LILAC = "#b98bff";

/** Where the front row's moving heads stand on the deck (behind the balustrade). */
export const HEADS_R = 10;
/** Where the floor fixtures stand on the walkway, by the shell's feet. */
export const FLOOR_R = 17;

/**
 * The beams (concert photo, Ben): a fan of moving heads along the stage's front edge, mostly cyan and blue with
 * pink between. Seen from the audience they spread sideways like a V: the outer ones lean out, the inner ones
 * cross. Floor fixtures by the shell's feet cross over the front of the stage. Phones (lite, no bloom) get fewer,
 * wider beams.
 */
export function beams(lite: boolean): Beam[] {
  const w = lite ? 1.35 : 1;
  // [angle on the stage's edge, lean along the edge (+ towards north, degrees), colour]
  const front: [number, number, string][] = lite
    ? [
        [-45, -30, BEAM_CYAN],
        [-15, 16, BEAM_PINK],
        [15, -16, BEAM_BLUE],
        [45, 30, BEAM_CYAN],
      ]
    : [
        [-60, -34, BEAM_CYAN],
        [-36, 22, BEAM_PINK],
        [-12, -14, BEAM_BLUE],
        [12, 14, BEAM_BLUE],
        [36, -22, BEAM_PINK],
        [60, 34, BEAM_CYAN],
      ];
  const out: Beam[] = front.map(([d, lean, c]) => {
    const a = d * DEG;
    const s = Math.sign(lean);
    // along the edge, and a little towards the audience so the beams stay in front of the shell
    const h: [number, number] = [Math.cos(a) * s + Math.sin(a) * 0.3, Math.sin(a) * s - Math.cos(a) * 0.3];
    return {
      p: polar(HEADS_R, a, DECK_Y + 0.55),
      dir: aim(h, Math.abs(lean) * DEG),
      len: 52,
      w0: 0.35 * w,
      w1: 3.6 * w,
      c,
      // swings sideways along the edge (about the axis towards the audience); the two halves mirror each other,
      // so the fan opens and closes like scissors and the crossing pairs sweep through each other
      axis: polar(1, a),
      sway: [(Math.abs(d) > 40 ? 20 : 15) * DEG, 0.75, (d < 0 ? 0 : Math.PI) + Math.abs(d) * DEG * 0.8],
    };
  });
  const floor = lite ? [100] : [96, 118];
  for (const side of [-1, 1])
    floor.forEach((d, i) => {
      const a = side * d * DEG;
      // in over the stage and towards the audience, so the two sides cross in front of the shell
      const h: [number, number] = [-Math.sin(a), Math.cos(a) - 0.6];
      out.push({
        p: polar(FLOOR_R, a, RING_Y + 0.5),
        dir: aim(h, (i ? 34 : 26) * DEG),
        len: 50,
        w0: 0.4 * w,
        w1: 3.8 * w,
        c: i ? BEAM_LILAC : BEAM_PINK,
        // pans slowly about the vertical, the two sides in opposite phase so they keep crossing
        axis: [0, 1, 0],
        sway: [24 * DEG, 0.45, (side < 0 ? 0 : Math.PI) + i * 1.3],
      });
    });
  return out;
}

// ── The concert's extra fixtures (L3; dark until the concert plays) ──────

const UP: V3 = [0, 1, 0];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Sky beams from the kerb behind the stage: tall shafts over the lake that read from all over the map. */
export function skyBeams(lite: boolean): Beam[] {
  const list: [number, string][] = lite
    ? [
        [166, "#d9fbff"],
        [194, "#b98bff"],
      ]
    : [
        [156, "#d9fbff"],
        [171, "#b98bff"],
        [189, "#b98bff"],
        [204, "#d9fbff"],
      ];
  return list.map(([d, c], i) => {
    const a = d * DEG;
    const s = i % 2 ? 1 : -1;
    // lean along the kerb (north or south), alternating, so neighbours cross high up
    const h: [number, number] = [Math.cos(a) * s, Math.sin(a) * s];
    return {
      p: polar(MOAT_R + 0.2, a, KERB.h + 0.3),
      dir: aim(h, 13 * DEG),
      len: 130,
      w0: 0.8,
      w1: lite ? 13 : 10,
      c,
      axis: polar(1, a),
      sway: [16 * DEG, 0.3, (a < Math.PI ? 0 : Math.PI) + i],
    };
  });
}

/** Beams hung under the front arch, raking the audience. */
export function archBeams(lite: boolean): Beam[] {
  const at = lite ? [0.38, 0.62] : [0.3, 0.42, 0.58, 0.7];
  return at.map((f, i) => {
    const [x, y, z] = shellPoint(Math.PI * f, SHELL.ribs[0], 0.8);
    return {
      p: [x, y - 0.4, z],
      dir: norm([(f - 0.5) * 0.5, -0.62, -1]),
      len: 40,
      w0: 0.3,
      w1: lite ? 4.2 : 3.2,
      c: i % 2 ? BEAM_PINK : BEAM_CYAN,
      axis: [1, 0, 0],
      sway: [14 * DEG, 0.8, i * 1.1],
    };
  });
}

/** Lasers from the top of the back wall, fanned out over the audience's heads. */
export function lasers(lite: boolean): Beam[] {
  const n = lite ? 6 : 12;
  const el = 7 * DEG;
  return Array.from({ length: n }, (_, i) => {
    const yaw = (-55 + (110 * i) / (n - 1)) * DEG;
    return {
      p: polar(WALL.r + 0.2, Math.PI, DECK_Y + WALL.h + 0.25),
      dir: [Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el)],
      len: 70,
      w0: lite ? 0.16 : 0.07,
      w1: lite ? 0.16 : 0.07,
      c: i % 2 ? "#0dfcfd" : "#2bff9e",
      // the whole fan sweeps together
      axis: UP,
      sway: [22 * DEG, 0.9, 0],
    };
  });
}

/** Flame jets at the stage's front edge: [angle (degrees), height, width]. */
export function flames(lite: boolean): { p: V3; h: number; w: number }[] {
  return (lite ? [-30, 30] : [-46, -16, 16, 46]).map((d) => ({ p: polar(STAGE_R - 0.7, d * DEG, DECK_Y + 0.1), h: 7.5, w: lite ? 2.2 : 1.6 }));
}

/** Fountain jets in a ring round the moat (none where the bridge crosses): position, height, width, phase 0..1. */
export function fountains(lite: boolean): { p: V3; h: number; w: number; phase: number }[] {
  const n = lite ? 12 : 22;
  const r = (STAGE_R + MOAT_R) / 2;
  const out: { p: V3; h: number; w: number; phase: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + 0.2;
    if (Math.abs(Math.atan2(Math.sin(a - BRIDGE_A), Math.cos(a - BRIDGE_A))) < 10 * DEG) continue;
    out.push({ p: polar(r, a, WATER_Y), h: 7, w: lite ? 0.55 : 0.35, phase: i / n });
  }
  return out;
}

/** The follow spot that finds the stage as the concert opens, from the top of the amphitheatre. */
export const SPOT: Beam = (() => {
  const p = polar(RING_R + TERRACES * TERRACE_D - 1, 0, RING_Y + TERRACES * TERRACE_H + 2.5);
  const target: V3 = [0, DECK_Y + 0.8, -3];
  const d: V3 = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
  return { p, dir: norm(d), len: Math.hypot(...d) + 1.5, w0: 0.25, w1: 2.6, c: "#fff2d6", axis: UP, sway: [0, 0, 0] };
})();

/** Haze in front of the stage, lit by the beams: soft blue and purple puffs (centre, radius, colour). */
export const HAZE: { p: V3; r: number; c: string }[] = [
  { p: [-7, 6, -9], r: 8, c: "#3b3fd0" },
  { p: [6, 8, -12], r: 9, c: "#7a2fc8" },
  { p: [0, 11, -6], r: 9, c: "#1d6fd8" },
  { p: [-11, 9, -14], r: 7, c: "#7a2fc8" },
  { p: [11, 5, -7], r: 7, c: "#3b3fd0" },
  { p: [0, 4, -14], r: 8, c: "#1d6fd8" },
  { p: [-4, 15, -10], r: 8, c: "#5a2fd0" },
];

/** Halos for phones at night (funfair/glow.tsx): the shell and the stage. */
export const GLOW: { p: V3; r: number; c: string }[] = [
  { p: [0, 15, 2], r: 15, c: "#e0b4fc" },
  { p: [0, 4, 1], r: 11, c: "#ffcf86" },
];

/** Weeping willows along the lake shore, outside the amphitheatre (metres; checked against the lake outline). */
export const WILLOWS: [number, number, number][] = [
  [20.5, 9.5, 1],
  [27, 12, 0.9],
  [15.5, 18, 1.05],
  [-20, 11, 1],
  [-13, 17.5, 0.95],
  [-25.5, 14, 1.1],
];
