import { G, TAU, mat, type V3 } from "../central/kit";
import { STEEL } from "./kit";
import {
  COURT,
  DECK_Y,
  FOOD,
  GATE_WALK,
  ISLAND,
  LAGOON,
  NEON_WALK,
  NODES,
  PARK_WALK,
  PIER,
  PIER_WALK,
  PLAZAS,
  PLAZA_Y,
  RIM_Y,
  SPIDERS,
  SPIDER_R,
  WATER_Y,
  CAROUSEL,
  CAROUSEL_R,
  DOME,
  DOME_R,
  WHEEL,
  WHEEL_R,
} from "./layout";
import type { Parts } from "./parts";

// DRAFT: the West zone's ground on the campus lawn (y = 0; no lawn plate):
// the walks, the raised ride plazas, the booth court, the food court, and the
// lagoon's basin. Layers never share a height and stacked flat faces stay at
// least 0.08 m apart (no z-fighting on phones): paths 0.12, nodes 0.22,
// plaza rims 0.2 and tops 0.32, the lagoon's water 0.25 under its 0.42 rim.
// The paving matches Central's (cream with lilac edges); the plazas are
// tinted in the zone's pink and its ride colours.

const PATH = "#f6e6cf";
const PATH_EDGE = "#c9aef0";
const PATH_Y = 0.12;
const NODE_Y = 0.22;
const RIM_TOP = 0.2;
/** The island's top (the lighthouse's platform). */
export const ISLAND_Y = 1.0;
/** The courts' tile tops. */
const COURT_Y = 0.32;

/** How far (x, z) is inside the lagoon's ellipse grown by `grow` metres: below 1 is inside. */
export function lagoonE(x: number, z: number, grow = 0) {
  return ((x - LAGOON.x) / (LAGOON.rx + grow)) ** 2 + ((z - LAGOON.z) / (LAGOON.rz + grow)) ** 2;
}

/** Distance from (x, z) to the segment a-b. */
function segDist(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** Height of the ground's top at (x, z), so things stand on it. */
export function groundY(x: number, z: number) {
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r) return ISLAND_Y;
  if (x > PIER.x[0] && x < PIER.x[1] && Math.abs(z - PIER.z) < PIER.hw) return DECK_Y;
  if (lagoonE(x, z) < 1) return WATER_Y;
  if (lagoonE(x, z, LAGOON.rim) < 1) return RIM_Y;
  for (const pl of PLAZAS) {
    const d = Math.hypot(x - pl.c[0], z - pl.c[1]);
    if (d < pl.r) return PLAZA_Y;
    if (d < pl.r + 0.9) return RIM_TOP;
  }
  if (x > COURT.x[0] && x < COURT.x[1] && z > COURT.z[0] && z < COURT.z[1]) return COURT_Y;
  if (x > FOOD.x[0] && x < FOOD.x[1] && z > FOOD.z[0] && z < FOOD.z[1]) return COURT_Y;
  for (const [nx, nz, r] of NODES) if (Math.hypot(x - nx, z - nz) < r) return NODE_Y;
  if (Math.abs(x - NEON_WALK.x) < NEON_WALK.hw && z > NEON_WALK.z[0] && z < NEON_WALK.z[1]) return PATH_Y;
  if (Math.abs(z - PIER_WALK.z) < PIER_WALK.hw && x > PIER_WALK.x[0] && x < PIER_WALK.x[1]) return PATH_Y;
  if (Math.abs(z - PARK_WALK.z) < PARK_WALK.hw && x > PARK_WALK.x[0] && x < PARK_WALK.x[1]) return PATH_Y;
  if (segDist(x, z, GATE_WALK.from, GATE_WALK.to) < GATE_WALK.hw) return PATH_Y;
  for (const [a, b] of BRANCHES) if (segDist(x, z, a, b) < BRANCH_HW) return PATH_Y;
  return 0;
}

/** Narrow paths from the walks to the rides and the north half (centre lines; their ends hide under the plazas). */
const BRANCH_HW = 2.5;
export const BRANCHES: [[number, number], [number, number]][] = [
  // Neon Walk → carousel, south
  [
    [NEON_WALK.x - NEON_WALK.hw, CAROUSEL[1]],
    [CAROUSEL[0] + CAROUSEL_R - 1, CAROUSEL[1]],
  ],
  // Neon Walk → the LY6 spider, north
  [
    [NEON_WALK.x + NEON_WALK.hw, SPIDERS[1][1]],
    [SPIDERS[1][0] - SPIDER_R + 1, SPIDERS[1][1]],
  ],
  // Pier Walk → the LY7 spider, west
  [
    [SPIDERS[0][0], PIER_WALK.z - PIER_WALK.hw],
    [SPIDERS[0][0], SPIDERS[0][1] + SPIDER_R - 1],
  ],
  // the lagoon's west tip → the neon dome
  [
    [DOME[0], LAGOON.z - LAGOON.rz - LAGOON.rim + 1],
    [DOME[0], DOME[1] + DOME_R - 1],
  ],
  // the neon dome → the LY6 spider (diagonal)
  [
    [DOME[0] - DOME_R + 2, DOME[1] - 4],
    [SPIDERS[1][0] + SPIDER_R - 2, SPIDERS[1][1] + 5],
  ],
  // the lagoon's east tip → the food court
  [
    [LAGOON.x, LAGOON.z + LAGOON.rz + LAGOON.rim - 1],
    [LAGOON.x, FOOD.z[0] + 0.5],
  ],
  // the wheel → the food court
  [
    [WHEEL[0] + WHEEL_R - 1, 70],
    [FOOD.x[0] + 0.5, 70],
  ],
];

/** A path strip from a to b, `hw` half wide, with lilac edges along its length. */
function path(p: Parts, a: [number, number], b: [number, number], hw: number) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(-dz, dx);
  const nx = -dz / len;
  const nz = dx / len;
  const cx = (a[0] + b[0]) / 2;
  const cz = (a[1] + b[1]) / 2;
  const e = Math.min(0.9, hw * 0.3);
  p.paving.add(G.quad, mat(cx, PATH_Y, cz, len, 1, 2 * (hw - e), ry), PATH);
  for (const s of [-1, 1]) {
    const o = (hw - e / 2) * s;
    p.paving.add(G.quad, mat(cx + nx * o, PATH_Y, cz + nz * o, len, 1, e, ry), PATH_EDGE);
  }
}

/** A raised round plaza: a rim step, then the top; `pattern` colours the top's rings and wedges. */
function plaza(p: Parts, x: number, z: number, r: number, top: string, rim: string, pattern?: (s: number, k: number) => string) {
  const rings: [number, number][] = [
    [r + 0.9, 0],
    [r + 0.9, RIM_TOP],
    [r, RIM_TOP],
    [r, PLAZA_Y],
    [r * 0.82, PLAZA_Y],
    [r * 0.76, PLAZA_Y],
    [r * 0.3, PLAZA_Y],
    [0, PLAZA_Y],
  ];
  p.paving.revolve([x, 0, z], rings, 48, (s, k) => {
    if (k < 2) return rim;
    if (pattern) return pattern(s, k);
    return k === 4 ? rim : top;
  });
}

/** A rectangular court of chequered tiles on a rim slab. */
function court(p: Parts, x0: number, x1: number, z0: number, z1: number, a: string, b: string, rim: string, tile = 5) {
  p.paving.box(rim, [(x0 + x1) / 2, RIM_TOP / 2, (z0 + z1) / 2], [x1 - x0 + 1.4, RIM_TOP, z1 - z0 + 1.4]);
  const nx = Math.max(1, Math.round((x1 - x0) / tile));
  const nz = Math.max(1, Math.round((z1 - z0) / tile));
  const tx = (x1 - x0) / nx;
  const tz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++)
      p.paving.box((i + j) % 2 ? a : b, [x0 + (i + 0.5) * tx, COURT_Y / 2, z0 + (j + 0.5) * tz], [tx, COURT_Y, tz]);
}

/** The lagoon: a white coping rim walk round it, and the water inside. */
function lagoon(p: Parts) {
  const { x, z, rx, rz, rim } = LAGOON;
  const n = 96;
  const P = (a: number, grow: number, y: number): V3 => [x + Math.cos(a) * (rx + grow), y, z + Math.sin(a) * (rz + grow)];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const top = i % 2 ? "#f4eff8" : "#e9e1f2";
    // outer wall (facing out), top, coping edge (facing up), inner wall (facing the water)
    p.paving.quad("#d5c8e6", P(a1, rim, 0), P(a0, rim, 0), P(a0, rim, RIM_Y), P(a1, rim, RIM_Y));
    p.paving.quad(top, P(a0, 0.9, RIM_Y), P(a1, 0.9, RIM_Y), P(a1, rim, RIM_Y), P(a0, rim, RIM_Y));
    p.paving.quad("#ffffff", P(a0, 0, RIM_Y), P(a1, 0, RIM_Y), P(a1, 0.9, RIM_Y), P(a0, 0.9, RIM_Y));
    p.paving.quad("#bfe3ee", P(a1, 0, RIM_Y), P(a0, 0, RIM_Y), P(a0, 0, WATER_Y - 0.1), P(a1, 0, WATER_Y - 0.1));
  }
  // the water: a fan reaching a little under the rim; deeper blue towards the middle
  const deep = "#2f8fc4";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const ring = (f: number, a: number): V3 => [x + Math.cos(a) * (rx + 0.3) * f, WATER_Y, z + Math.sin(a) * (rz + 0.3) * f];
    p.water.tri(deep, [x, WATER_Y, z], ring(0.55, a1), ring(0.55, a0));
    p.water.quad(STEEL.water, ring(0.55, a0), ring(0.55, a1), ring(1, a1), ring(1, a0));
  }
}

export function bakeGround(p: Parts) {
  // walks
  const hw = NEON_WALK.hw;
  path(p, [NEON_WALK.x, NEON_WALK.z[0]], [NEON_WALK.x, NEON_WALK.z[1]], hw);
  path(p, [PIER_WALK.x[0], PIER_WALK.z], [PIER_WALK.x[1], PIER_WALK.z], PIER_WALK.hw);
  path(p, [PARK_WALK.x[0], PARK_WALK.z], [PARK_WALK.x[1], PARK_WALK.z], PARK_WALK.hw);
  path(p, GATE_WALK.from, GATE_WALK.to, GATE_WALK.hw);
  for (const [a, b] of BRANCHES) path(p, a, b, BRANCH_HW);
  // nodes where walks meet at an angle (their tops 0.1 over the paths)
  for (const [nx, nz, r] of NODES) {
    p.paving.revolve([nx, 0, nz], [[r, 0], [r, NODE_Y], [r - 0.8, NODE_Y], [0, NODE_Y]], 32, (_s, k) => (k === 2 ? PATH : PATH_EDGE));
  }

  // ride plazas
  const [wheel, carousel, s7, s6, dome] = PLAZAS;
  // the wheel's plaza: a pink sunburst round the wheel, a ring for the food stalls
  plaza(p, wheel.c[0], wheel.c[1], wheel.r, wheel.top, wheel.rim, (s, k) => {
    if (k === 4) return wheel.rim;
    if (k === 6) return s % 2 ? "#ffd0e8" : "#fff0f7";
    if (k === 5) return s % 4 < 2 ? "#ffe0f0" : "#f6d9f9";
    return wheel.top;
  });
  for (const pl of [carousel, s7, s6]) plaza(p, pl.c[0], pl.c[1], pl.r, pl.top, pl.rim);
  plaza(p, dome.c[0], dome.c[1], dome.r, dome.top, dome.rim, (s, k) => (k === 4 ? dome.rim : k === 6 && s % 2 ? "#d9cff2" : dome.top));
  void WHEEL_R;

  // the booth court and the food court
  court(p, COURT.x[0], COURT.x[1], COURT.z[0], COURT.z[1], "#fbe9f4", "#f1dcf5", "#d5a6dc", 4.75);
  court(p, FOOD.x[0], FOOD.x[1], FOOD.z[0], FOOD.z[1], "#f7efe3", "#efe2f6", "#c9b2e2", 5.5);

  lagoon(p);
  // the island: a round platform standing in the water
  p.paving.revolve(
    [ISLAND.x, 0, ISLAND.z],
    [
      [ISLAND.r + 0.6, WATER_Y - 0.1],
      [ISLAND.r + 0.6, ISLAND_Y - 0.35],
      [ISLAND.r, ISLAND_Y - 0.35],
      [ISLAND.r, ISLAND_Y],
      [ISLAND.r * 0.55, ISLAND_Y],
      [0, ISLAND_Y],
    ],
    32,
    (s, k) => (k < 2 ? "#cfc3e2" : k === 3 && s % 2 ? "#f6d2e8" : "#f2eef8"),
  );
  void DECK_Y;
}
