import { UNITS_PER_M } from "../../geo";
import { ORIGIN as CENTRAL_ORIGIN, PROMENADE } from "../central/layout";
import { dormPlace } from "../common";

// DRAFT: where things stand in the East zone, "Big Top", in metres from the
// zone's origin (x north, z east; the same axes as the world). The land is the
// east part of the campus lawn (FUNFAIR_LAND in geo.ts). It is L-shaped: its
// south edge is x = -60 west of z = -12 and x = -111 east of it; x runs up to
// 114 (the road side) and z from -121 (where Central ends) to 117.
//
// Canteen D6 holds the Big Top with a ring road round it, the hub plaza at its
// door and the walk from Central's promenade. The coaster's station is on D4
// and its loop over D5; the haunted house is on D2, the pirate ship on D3 and
// the arcade on D1 (the last two moved north onto the lawn). The north holds
// the helter-skelter, the food court and the circus wagons.

/** The zone's origin in world units. */
export const ORIGIN: [number, number] = [29, 18];

/** World [x, z] → zone metres [x, z]. */
export function toLocal([x, z]: [number, number]): [number, number] {
  return [(x - ORIGIN[0]) / UNITS_PER_M, (z - ORIGIN[1]) / UNITS_PER_M];
}

const at = (dorm: string, dx = 0, dz = 0): [number, number] => {
  const [x, z] = toLocal(dormPlace(dorm).pos);
  return [x + dx, z + dz];
};

/** The lawn's box. The south-west corner (x < -60, z < -12) is the lake park: see onLawn. */
export const BOUNDS = { x: [-111, 114] as [number, number], z: [-121, 117] as [number, number] };

/** True when (x, z) is on the zone's lawn, at least `m` metres in from its edge. */
export function onLawn(x: number, z: number, m = 0) {
  if (x < BOUNDS.x[0] + m || x > BOUNDS.x[1] - m || z < BOUNDS.z[0] + m || z > BOUNDS.z[1] - m) return false;
  return !(x < -60 + m && z < -12 + m);
}

// ---------- the Big Top ----------

/** Canteen D6: the Big Top, about (-20, 21). */
export const BIGTOP = at("Canteen D6");
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

/** The station on D4: the track runs east (+z) through it along x = STATION.x. */
export const STATION = { x: -50, z: [-88, -64] as [number, number] };
/** The station's paved court. */
export const STATION_COURT = { x: [-57, -41] as [number, number], z: [-90, -60] as [number, number] };

// ---------- the other rides ----------

/** D3: the pirate ship, moved 14 m north onto the lawn (about (-92, 8)); it swings across the default view. */
export const SHIP = at("D3", 14, 1);
export const SHIP_R = 14;
export const SHIP_RY = 0.8;

/** D2: the haunted house (about (-58, 78)), facing its plaza on the Ghost Lane. */
export const HAUNTED = at("D2", -2, 1);
export const HH_PLAZA: [number, number] = [-48, 66];
export const HH_PLAZA_R = 8;
export const HAUNTED_RY = Math.atan2(HH_PLAZA[0] - HAUNTED[0], HH_PLAZA[1] - HAUNTED[1]);

/** D1: the arcade, moved 21 m north onto the lawn (about (-97, 84)); its front faces north (+x). */
export const ARCADE = at("D1", 21, 0);
export const ARCADE_RY = Math.PI / 2;
/** The prize stand beside it, also facing north, with the prize wheel on its roof. */
export const PRIZE: [number, number] = [-93.5, 101.5];
/** The arcade's forecourt. */
export const ARCADE_COURT = { x: [-91, -82] as [number, number], z: [72, 106] as [number, number] };

/** The helter-skelter on its round plaza, north of the hub. */
export const HS: [number, number] = [36, 6];
export const HS_R = 8;

/** The food court: tables under festoons, stalls round its edge. */
export const FOOD = { x: [66, 96] as [number, number], z: [8, 52] as [number, number] };

/** The circus wagons, parked in a row on the lawn in the north-east. */
export const WAGONS: [number, number][] = [
  [26, 101],
  [36, 103],
  [46, 101],
  [56, 103],
];

/** The power box, beside the hub (north-west of it). */
export const POWER_BOX: [number, number] = [8, -26];

// ---------- walks ----------

export type Walk = { pts: [number, number][]; hw: number; closed?: boolean };

/** Where Central's promenade ends (world 28.3, -1.4): the walk from Central starts there. */
const PROM_END = toLocal([
  CENTRAL_ORIGIN[0] + ((PROMENADE.x[0] + PROMENADE.x[1]) / 2) * UNITS_PER_M,
  CENTRAL_ORIGIN[1] + PROMENADE.z[1] * UNITS_PER_M,
]);

/** The walk from Central's promenade to the hub, under both legs of the coaster. */
export const MAIN: Walk = { pts: [PROM_END, [PROM_END[0], HUB[1] - 1]], hw: 4 };
export const MAIN_X = PROM_END[0];
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
  { pts: [[HH_PLAZA[0] - 5, HH_PLAZA[1] + 2], [ARCADE_COURT.x[1] - 0.5, 84]], hw: 2.6 },
  // the East Walk: the haunted house → the circus wagons → the food court
  { pts: [[HH_PLAZA[0] + 4, HH_PLAZA[1] + 5], [-20, 82], [20, 86], [48, 74], [FOOD.x[0] + 1, FOOD.z[1] - 6]], hw: 3 },
  // the North Walk: the hub → the helter-skelter → the food court
  { pts: [[HUB[0] + 8, HUB[1] - 3], [26, -8], HS, [FOOD.x[0] + 1, 20]], hw: 3 },
  // the ring's north tip → the food court
  { pts: [ringPoint(Math.PI), [FOOD.x[0] + 1, 36]], hw: 2.6 },
  // the main walk → the coaster's station
  { pts: [[MAIN_X, -72], [STATION_COURT.x[1] - 0.5, -72]], hw: 2.6 },
];

/** Round paved nodes over the joints: centre and radius. */
export const NODES: [number, number, number][] = [
  [...ringPoint(0), 4.4],
  [...ringPoint(-Math.PI / 2), 4.4],
  [...ringPoint(Math.PI), 4.4],
  [MAIN_X, -72, 5.6],
];

/** Raised round plazas: centre, radius, top colour, rim colour. */
export const PLAZAS: { c: [number, number]; r: number; top: string; rim: string }[] = [
  { c: HUB, r: HUB_R, top: "#fff0cf", rim: "#e6b84f" },
  { c: SHIP, r: SHIP_R, top: "#e3f3f1", rim: "#5fb9b2" },
  { c: HH_PLAZA, r: HH_PLAZA_R, top: "#ece0f7", rim: "#a98fd0" },
  { c: HS, r: HS_R, top: "#ffe3e1", rim: "#e78a8f" },
];

/** Rectangular courts (chequered tiles on a rim): ranges and colours. */
export const COURTS: { x: [number, number]; z: [number, number]; a: string; b: string; rim: string; tile: number }[] = [
  { ...STATION_COURT, a: "#f7efe3", b: "#e5f1f4", rim: "#8fc7d6", tile: 4 },
  { ...ARCADE_COURT, a: "#fff2d6", b: "#f6dccf", rim: "#e0a96a", tile: 4.5 },
  { ...FOOD, a: "#fff1d8", b: "#f7dccd", rim: "#e6c27a", tile: 5.5 },
];

/** Lamp post height (bulb strings hang from the top). */
export const LAMP_H = 6.4;
