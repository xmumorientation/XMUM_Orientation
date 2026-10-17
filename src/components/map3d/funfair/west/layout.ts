import { UNITS_PER_M } from "../../geo";
import { dormPlace } from "../common";

// DRAFT: where things stand in the West zone, "Neon Pier", in metres from the
// zone's origin (x north, z east; the same axes as the world). The land is the
// west half of the campus lawn north of the lake park (FUNFAIR_LAND in geo.ts):
// x from -104 (the park side) to 75 (the road side), z from -99 (west) to 109
// (where Central begins). The rides stand on their dorms' footprints along the
// park side; the north half holds the lagoon with its pier and lighthouse, the
// palm grove with the neon dome, and the food court.

/** The zone's origin in world units. */
export const ORIGIN: [number, number] = [35.2, -38.2];

/** World [x, z] → zone metres [x, z]. */
export function toLocal([x, z]: [number, number]): [number, number] {
  return [(x - ORIGIN[0]) / UNITS_PER_M, (z - ORIGIN[1]) / UNITS_PER_M];
}

const at = (dorm: string, dx = 0, dz = 0): [number, number] => {
  const [x, z] = toLocal(dormPlace(dorm).pos);
  return [x + dx, z + dz];
};

/** Nothing is built outside this box (the lawn, off the park and the road). */
export const BOUNDS = { x: [-103, 73] as [number, number], z: [-97.5, 107] as [number, number] };

// ---------- rides ----------

/** LY3: the Vortexa Eye, about (-30, 66). */
export const WHEEL = at("LY3");
/** Its plaza (food stalls stand round its edge). */
export const WHEEL_R = 27;
/** The wheel turns its face to the map's default camera (north-east). */
export const WHEEL_ROT = Math.PI / 4;

/** LY1: the carousel, moved 14 m north so it keeps off the park's edge (about (-86, -58)). */
export const CAROUSEL = at("LY1", 14, 0);
export const CAROUSEL_R = 13.5;

/** LY2: the game booths round a court open to the Neon Walk (about (-86, 1)). */
export const BOOTHS = at("LY2", 6, 0);
/** The booth court, x and z ranges. */
export const COURT = { x: [-101, -64.5] as [number, number], z: [BOOTHS[1] - 19, BOOTHS[1] + 19] as [number, number] };

/** LY7 and LY6: the spider rides (LY6 moved 3 m east to keep on the lawn). */
export const SPIDERS: [number, number][] = [at("LY7"), at("LY6", 0, 3)];
export const SPIDER_R = 15;

// ---------- walks ----------

/** The Neon Walk, west to east along the park side, past the rides. */
export const NEON_WALK = { x: -60, hw: 4.5, z: [-96, 64] as [number, number] };
/** The Pier Walk, from the Neon Walk north to the lagoon, under neon arches. */
export const PIER_WALK = { z: 14, hw: 4, x: [-55.5, 12] as [number, number] };
/** The Park Walk: from the lake park's footpath (world 19.3, -32) up to the Neon Walk. */
export const PARK_WALK = { z: toLocal([19.3, -32])[1], hw: 2.6, x: [-103.5, -64.5] as [number, number] };
/** The Gate Walk: from the Neon Walk's east end towards Central's midway and the VORTEXA gate (world 20, -11.5). */
export const GATE_WALK = { from: [-60, 48] as [number, number], to: [-100.5, 106] as [number, number], hw: 3 };
/** Round paved nodes where walks meet at an angle. */
export const NODES: [number, number, number][] = [
  [GATE_WALK.from[0], GATE_WALK.from[1], 6.0],
  [GATE_WALK.to[0] + 2, GATE_WALK.to[1] - 2.5, 4.5],
];

// ---------- the north half ----------

/** The lagoon: an ellipse (radii along x and z), its paved rim walk, and the water's level. */
export const LAGOON = { x: 36, z: 14, rx: 22, rz: 34, rim: 4.2 };
/** Heights: the water, the rim walk's top, the pier's deck. */
export const WATER_Y = 0.25;
export const RIM_Y = 0.42;
export const DECK_Y = 0.78;
/** The lighthouse island at the pier's end. */
export const ISLAND = { x: 44.5, z: 14, r: 6.6 };
/** The pier: from the rim to the island, along the Pier Walk's line. */
export const PIER = { x: [12.5, ISLAND.x - ISLAND.r + 0.6] as [number, number], z: 14, hw: 2.6 };

/** The palm grove's neon dome, on its round plaza. */
export const DOME: [number, number] = [37, -64];
export const DOME_R = 13;

/** The food court: a paved square of tables and food trucks, between the lagoon and the wheel. */
export const FOOD = { x: [12, 56] as [number, number], z: [61, 103] as [number, number] };

/** The power box, at the corner of the Neon Walk and the Pier Walk. */
export const POWER_BOX: [number, number] = [-49.5, 3.5];

/** Lamp post height (bulb strings hang from the top). */
export const LAMP_H = 6.6;

/** Raised round plazas: centre, radius, top colour, rim colour. */
export const PLAZAS: { c: [number, number]; r: number; top: string; rim: string }[] = [
  { c: WHEEL, r: WHEEL_R, top: "#ffe4f2", rim: "#f29bcc" },
  { c: CAROUSEL, r: CAROUSEL_R, top: "#e9ddfa", rim: "#b49be6" },
  { c: SPIDERS[0], r: SPIDER_R, top: "#dff7fa", rim: "#79d3de" },
  { c: SPIDERS[1], r: SPIDER_R, top: "#fff4d6", rim: "#e4c66a" },
  { c: DOME, r: DOME_R, top: "#e6e0f7", rim: "#a99ad6" },
];
/** The top of a raised plaza. */
export const PLAZA_Y = 0.32;
