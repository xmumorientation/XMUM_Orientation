import { fromReal, UNITS_PER_M } from "../../geo";
import { ORIGIN as CENTRAL_ORIGIN, PROMENADE } from "../central/layout";
import { dormPlace } from "../common";
import { DORMS_M } from "../dorms";

// DRAFT: where things stand in the East zone, "Big Top", in metres from the
// zone's origin (x north, z east; the same axes as the world). The land is the
// east part of the campus lawn (FUNFAIR_LAND in geo.ts). It is L-shaped: its
// south edge is x = -60 west of z = -12 and x = -124 east of it; x runs up to
// 114 (the road side) and z from -121 (where Central ends) to 117.
//
// Each ride stands on the real middle of its dorm (dormCentre; Ben,
// 2026-10-17). Canteen D6 holds the Big Top with a ring road round it, the hub
// plaza at its door and the walk from Central's promenade. The coaster's
// station is on D4 and its loop over D5; the haunted house is on D2, the
// pirate ship on D3 and the arcade on D1. The north holds the helter-skelter,
// the food court and the circus wagons.

/** The zone's origin in world units. */
export const ORIGIN: [number, number] = [29, 18];

/** World [x, z] → zone metres [x, z]. */
export function toLocal([x, z]: [number, number]): [number, number] {
  return [(x - ORIGIN[0]) / UNITS_PER_M, (z - ORIGIN[1]) / UNITS_PER_M];
}

/**
 * The real middle of a dorm (the centroid of its OSM outline), in zone metres. dormPlace() gives the middle of the
 * outline's bounding rectangle instead, which is 2-3 m off for the D blocks' cross shapes.
 */
export function dormCentre(name: string): [number, number] {
  const r = DORMS_M[name].outline;
  let a = 0;
  let e = 0;
  let n = 0;
  for (let i = 0; i < r.length; i++) {
    const [e1, n1] = r[i];
    const [e2, n2] = r[(i + 1) % r.length];
    const c = e1 * n2 - e2 * n1;
    a += c;
    e += (e1 + e2) * c;
    n += (n1 + n2) * c;
  }
  return toLocal(fromReal(e / (3 * a), n / (3 * a)));
}

/**
 * The lawn's box. The south-west corner (x < -60, z < -12) is the lake park: see onLawn. The south edge reaches past
 * the funfair's land to x = -124, for the pirate ship and the arcade on the real middles of D3 and D1; B1's north
 * road and its parking bays end about 27 m further south (x = -151; B1_ROADS_M in geo.ts, since 2026-10-21).
 */
export const BOUNDS = { x: [-124, 114] as [number, number], z: [-121, 117] as [number, number] };

/** True when (x, z) is on the zone's lawn, at least `m` metres in from its edge. */
export function onLawn(x: number, z: number, m = 0) {
  if (x < BOUNDS.x[0] + m || x > BOUNDS.x[1] - m || z < BOUNDS.z[0] + m || z > BOUNDS.z[1] - m) return false;
  return !(x < -60 + m && z < -12 + m);
}

// ---------- the Big Top ----------

/** Canteen D6: the Big Top, about (-21, 21). */
export const BIGTOP = dormCentre("Canteen D6");
/** The tent's long axis follows the canteen's oval; its door (local +z) faces the hub, west-north-west. */
export const BT_RY = dormPlace("Canteen D6").rotY + Math.PI;
/** The tent's semi-axes (the canteen's oval). */
export const BT_A = 34;
export const BT_B = 27;

/** A point of the tent's frame (u along its long axis, v along its short axis, +v the door side) → zone metres. */
export function btPoint(u: number, v: number): [number, number] {
  const c = Math.cos(BT_RY);
  const s = Math.sin(BT_RY);
  return [BIGTOP[0] + u * c + v * s, BIGTOP[1] - u * s + v * c];
}

/** The ring road round the tent: an oval 8 m out from its wall. */
export const RING = { a: BT_A + 8, b: BT_B + 8, hw: 3 };
/** A point on the ring road's centre line (t = 0 the south-south-west tip, π/2 the hub, π the north tip). */
export const ringPoint = (t: number) => btPoint(RING.a * Math.cos(t), RING.b * Math.sin(t));

/** The hub: a round plaza at the tent's door, where the walk from Central arrives (about (-4, -13)). */
export const HUB = btPoint(0, BT_B + 11);
export const HUB_R = 10;

// ---------- the coaster (the track itself is in coaster.tsx) ----------

const D4 = dormCentre("D4");
/** The station on D4's middle (about (-53, -72)): the track runs east (+z) through it along x = STATION.x. */
export const STATION = { x: D4[0], z: [D4[1] - 12, D4[1] + 12] as [number, number] };
/** The station's paved court. Its south edge keeps clear of the lake park (x = -60). */
export const STATION_COURT = {
  x: [STATION.x - 6.5, STATION.x + 9] as [number, number],
  z: [STATION.z[0] - 2, STATION.z[1] + 4] as [number, number],
};
/** D5: the coaster's loop stands over its middle (about (19, -65)). */
export const LOOP_C = dormCentre("D5");

// ---------- the other rides ----------

/** D3: the pirate ship on D3's middle (about (-108, 5)); it swings across the default view. */
export const SHIP = dormCentre("D3");
export const SHIP_R = 14;
export const SHIP_RY = 0.8;

/** D2: the haunted house on D2's middle (about (-56, 78)), facing its plaza on the Ghost Lane. */
export const HAUNTED = dormCentre("D2");
export const HH_PLAZA: [number, number] = [HAUNTED[0] + 10.8, HAUNTED[1] - 11.8];
export const HH_PLAZA_R = 8;
export const HAUNTED_RY = Math.atan2(HH_PLAZA[0] - HAUNTED[0], HH_PLAZA[1] - HAUNTED[1]);

/**
 * D1: the arcade on D1's middle (about (-120, 86)); its front faces north (+x). Its back wall (x = -125) stays well
 * off B1's north road (Ben asked that D1 not touch the road).
 */
export const ARCADE = dormCentre("D1");
export const ARCADE_RY = Math.PI / 2;
/** The prize stand beside it, also facing north, with the prize wheel on its roof. */
export const PRIZE: [number, number] = [ARCADE[0] + 2.8, ARCADE[1] + 17.8];
/** The arcade's forecourt. */
export const ARCADE_COURT = {
  x: [ARCADE[0] + 5.3, ARCADE[0] + 14.3] as [number, number],
  z: [ARCADE[1] - 11.7, ARCADE[1] + 22.3] as [number, number],
};

/** The helter-skelter on its round plaza, north of the hub. */
export const HS: [number, number] = [36, 6];
export const HS_R = 8;

/** The food court: tables under festoons, stalls round its edge. */
export const FOOD = { x: [66, 96] as [number, number], z: [8, 52] as [number, number] };

/** The point `r` metres from c towards p. */
function towards(c: [number, number], p: [number, number], r: number): [number, number] {
  const dx = p[0] - c[0];
  const dz = p[1] - c[1];
  const l = Math.hypot(dx, dz) || 1;
  return [c[0] + (dx / l) * r, c[1] + (dz / l) * r];
}

// ---------- the midway quarter (north-west, where the coaster's north turn was) ----------

/** Midway Square: a round plaza with a striped mast, the diner on its north side and the high striker. */
export const SQUARE: [number, number] = [80, -70];
export const SQUARE_R = 13;
/** The VORTEX Diner: `w` along z, `d` deep, its front facing the square (south). */
export const DINER = { x: 105, z: -70, w: 22, d: 10 };
/** The diner's terrace, between its front and the square. */
export const TERRACE = { x: [94.6, 99.4] as [number, number], z: [-81, -59] as [number, number] };
/** The high striker, on the square's south-west side. */
export const STRIKER: [number, number] = [73, -79];

/** The games alley: from the North Walk (at (26, -8)) to the square, with game booths down both sides. */
export const ALLEY = { a: [26, -8] as [number, number], b: towards(SQUARE, [26, -8], SQUARE_R), hw: 3.5 };
/** Along the alley: distances (metres from its start) of the booth pairs, and of the GAMES arch. */
export const ALLEY_BOOTHS = [13, 22, 31, 40, 49, 58];
export const ALLEY_ARCH = 5.5;

/** The bandstand lawn: the bandstand on a round plaza, picnic tables and shade trees round it. */
export const BANDSTAND: [number, number] = [72, -24];
export const BANDSTAND_R = 6;
export const PICNIC: [number, number][] = [
  [84, -16],
  [86, -28],
  [80, -37],
  [68, -33],
  [60, -24],
  [90, -14],
  [78, -10],
];

// ---------- the circus ring (east) ----------

/** The circus ring: a sawdust ring with bleachers north and south of it and the wagons round its east side. */
export const CIRCUS: [number, number] = [50, 97];
export const CIRCUS_R = 9;
/** The circus wagons, round the ring's east side: position and turn (lengthwise along the ring). */
export const WAGONS: [number, number, number][] = [-0.9, -0.3, 0.3, 0.9].map(
  (a) => [CIRCUS[0] + 14 * Math.sin(a), CIRCUS[1] + 14 * Math.cos(a), a] as [number, number, number],
);

// ---------- the south corner and the rest ----------

/** The fortune teller's tent and the hall of mirrors, beside the south walk. */
export const FORTUNE: [number, number] = [-82, 44];
export const MIRRORS: [number, number] = [-104, 44];
/** The entrance arch over the walk from Central (its z); the ticket booth stands beside it (TICKETS, below). */
export const ARCH_Z = -119.5;
/** Restrooms by the square, first aid by the arcade. */
export const WC: [number, number] = [92, -100];
export const FIRST_AID: [number, number] = [-95, 98];
/** Snack carts: position, the point their front faces, and what they sell. */
export const CARTS: { at: [number, number]; face: [number, number]; kind: "popcorn" | "candy" | "ice" | "churros" }[] = [
  { at: [12, -118.4], face: [12, -114], kind: "popcorn" },
  { at: [28, -118.4], face: [28, -114], kind: "candy" },
  { at: [44, -118.4], face: [44, -114], kind: "ice" },
  { at: [88, -63.2], face: SQUARE, kind: "churros" },
  { at: [86.5, -78.2], face: SQUARE, kind: "popcorn" },
  { at: [56, -2], face: [51.7, -7.1], kind: "ice" },
  { at: [30, 90], face: [36, 82], kind: "candy" },
  { at: [-90, 62], face: [-95.3, 58.6], kind: "ice" },
];

/** The power box, beside the hub (north-west of it). */
export const POWER_BOX: [number, number] = [8, -26];

// ---------- walks ----------

/** A walk: its centre line and half width. `lamps: false` leaves out the lamp posts along it (the games alley has bulb strings over it). */
export type Walk = { pts: [number, number][]; hw: number; closed?: boolean; lamps?: boolean };

/** Where Central's promenade ends (world 28.3, -1.4): the walk from Central starts there. */
const PROM_END = toLocal([
  CENTRAL_ORIGIN[0] + ((PROMENADE.x[0] + PROMENADE.x[1]) / 2) * UNITS_PER_M,
  CENTRAL_ORIGIN[1] + PROMENADE.z[1] * UNITS_PER_M,
]);

/** The walk from Central's promenade to the hub, under both legs of the coaster. */
export const MAIN: Walk = { pts: [PROM_END, [PROM_END[0], HUB[1] - 1]], hw: 4 };
export const MAIN_X = PROM_END[0];
/** The west lane: from the walk from Central (at z = -114) north, then to the square. */
const LANE_BEND: [number, number] = [50, -114];
export const LANE: [number, number][] = [[MAIN_X, -114], LANE_BEND, towards(SQUARE, LANE_BEND, SQUARE_R)];
/** The ticket booth, on the walk's south side by the entrance arch. */
export const TICKETS: [number, number] = [MAIN_X - MAIN.hw - 3.4, -115.5];
/** The ring road. */
export const RING_WALK: Walk = { pts: Array.from({ length: 72 }, (_, i) => ringPoint((i / 72) * Math.PI * 2)), hw: RING.hw, closed: true };

/** The other walks: their ends hide under the plazas, the courts and the round nodes. */
export const WALKS: Walk[] = [
  MAIN,
  RING_WALK,
  // the ring's south tip → the pirate ship
  { pts: [ringPoint(0), [SHIP[0] + SHIP_R - 1, SHIP[1] - 1.5]], hw: 2.6 },
  // the Ghost Lane: the ring's east side → the haunted house's plaza
  { pts: [ringPoint(-Math.PI / 2), [HH_PLAZA[0] + 2.5, HH_PLAZA[1] - 2.5]], hw: 2.6 },
  // the haunted house → the arcade
  { pts: [[HH_PLAZA[0] - 5, HH_PLAZA[1] + 2], [ARCADE_COURT.x[1] - 0.5, ARCADE[1] + 0.3]], hw: 2.6 },
  // the East Walk: the haunted house → past the circus ring → the food court
  { pts: [[HH_PLAZA[0] + 4, HH_PLAZA[1] + 5], [-20, 82], [20, 86], [48, 74], [FOOD.x[0] + 1, FOOD.z[1] - 6]], hw: 3 },
  // the North Walk: the hub → the helter-skelter → the food court
  { pts: [[HUB[0] + 8, HUB[1] - 3], [26, -8], HS, [FOOD.x[0] + 1, 20]], hw: 3 },
  // the ring's north tip → the food court
  { pts: [ringPoint(Math.PI), [FOOD.x[0] + 1, 36]], hw: 2.6 },
  // the main walk → the coaster's station
  { pts: [[MAIN_X, -72], [STATION_COURT.x[1] - 0.5, -72]], hw: 2.6 },
  // the games alley: the North Walk → Midway Square
  { pts: [ALLEY.a, ALLEY.b], hw: ALLEY.hw, lamps: false },
  // the west lane: the walk from Central → Midway Square
  { pts: LANE, hw: 2.8 },
  // the helter-skelter → the bandstand
  { pts: [towards(HS, BANDSTAND, HS_R + 0.9), towards(BANDSTAND, HS, BANDSTAND_R)], hw: 2.6 },
  // the East Walk → the circus ring
  { pts: [[36, 79.1], towards(CIRCUS, [36, 79.1], CIRCUS_R)], hw: 2.6 },
  // the south walk: the pirate ship → past the fortune teller and the hall of mirrors → the arcade
  { pts: [[SHIP[0] + 5, SHIP[1] + 14.6], [-94, 31], [-91, 52], [-102, 69], [ARCADE_COURT.x[0] + 4, ARCADE_COURT.z[0]]], hw: 2.6 },
];

/** Round paved nodes over the joints: centre and radius. */
export const NODES: [number, number, number][] = [
  [...ringPoint(0), 4.4],
  [...ringPoint(-Math.PI / 2), 4.4],
  [...ringPoint(Math.PI), 4.4],
  [MAIN_X, -72, 5.6],
  [ALLEY.a[0], ALLEY.a[1], 5],
  [MAIN_X, -114, 5],
  [36, 79.1, 4],
];

/**
 * Raised round plazas: centre, radius, top colour, rim colour, and (from the fifth on) the colour of every other
 * wedge on the top. The first four have their own patterns in ground.ts.
 */
export const PLAZAS: { c: [number, number]; r: number; top: string; rim: string; wedge?: string }[] = [
  { c: HUB, r: HUB_R, top: "#fff0cf", rim: "#e6b84f" },
  { c: SHIP, r: SHIP_R, top: "#e3f3f1", rim: "#5fb9b2" },
  { c: HH_PLAZA, r: HH_PLAZA_R, top: "#ece0f7", rim: "#a98fd0" },
  { c: HS, r: HS_R, top: "#ffe3e1", rim: "#e78a8f" },
  { c: SQUARE, r: SQUARE_R, top: "#fff6e6", rim: "#e6b84f", wedge: "#ffe2b8" },
  { c: BANDSTAND, r: BANDSTAND_R, top: "#f6e6cf", rim: "#c9aef0" },
  // the circus ring: sawdust inside a red kerb
  { c: CIRCUS, r: CIRCUS_R, top: "#e8c38f", rim: "#c8323f", wedge: "#f0d3a6" },
];

/** Rectangular courts (chequered tiles on a rim): ranges and colours. */
export const COURTS: { x: [number, number]; z: [number, number]; a: string; b: string; rim: string; tile: number }[] = [
  { ...STATION_COURT, a: "#f7efe3", b: "#e5f1f4", rim: "#8fc7d6", tile: 4 },
  { ...ARCADE_COURT, a: "#fff2d6", b: "#f6dccf", rim: "#e0a96a", tile: 4.5 },
  { ...FOOD, a: "#fff1d8", b: "#f7dccd", rim: "#e6c27a", tile: 5.5 },
  { ...TERRACE, a: "#fff1d8", b: "#f7dccd", rim: "#e6c27a", tile: 2.4 },
];

/** Lamp post height (bulb strings hang from the top). */
export const LAMP_H = 6.4;
