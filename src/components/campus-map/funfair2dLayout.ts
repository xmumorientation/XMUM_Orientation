import type { FunfairZone } from "@/lib/funfair";

// Where the 2D map draws the Vortexa Funfair. The rides keep their 3D layout (world x north, z east, as in
// map3d/geo.ts), but the 3D land (FUNFAIR_LAND) is longer than the art's brown field: it runs about 10 units further
// west, over the art's outer road. So the 2D map squeezes the 3D spots into the field (`squeeze`) before putting
// them on the art with the art's own transform (`worldToArt`, geo.ts toWorld turned round).
// tests/funfair-2d-spots.test.ts checks the 3D spots below against the 3D map and that everything lands inside the
// field. No 3D code here, so the 2D map (the fallback for phones that can't run 3D) stays light.

export type World = [number, number];

// geo.ts's art transform: corners of the outer road on the art scaled to 2000 px wide, and the world's size.
const L: World = [62, 487];
const U: World = [818, -479];
const V: World = [1013, 618];
const WORLD_W = 118.7;
const WORLD_D = 94.8;
const ART_W = 2000;
const ART_H = (2000 * 1776) / 3203;

/** World [x, z] on the ground → percent of the art (as mapBuildings). */
export function worldToArt([x, z]: World): { x: number; y: number } {
  const b = (x + WORLD_W / 2) / WORLD_W;
  const a = (WORLD_D / 2 - z) / WORLD_D;
  return { x: ((L[0] + a * U[0] + b * V[0]) / ART_W) * 100, y: ((L[1] + a * U[1] + b * V[1]) / ART_H) * 100 };
}

/**
 * The 3D funfair's spots → the art's field. The 3D rides run x 11.2 to 33.8 and z -53 to 36.7; the field (FIELD, below)
 * leaves room for the rides' footprints in x 18 to 39 and z -38.5 to 32, with a boulevard and trees along the road.
 */
export function squeeze([x, z]: World): World {
  return [18 + (x - 11.16) * 0.926, -38.5 + (z + 53) * 0.786];
}

/** The art's brown field (an L: the east end reaches further south, beside B1), in world units, read off the art. */
export const FIELD: World[] = [
  [12.99, 37.13],
  [12.13, 15.76],
  [19.61, 15.39],
  [20.5, -42.37],
  [46.62, -42.95],
  [46.49, 36.19],
];

export type Ride2D =
  | "wheel"
  | "carousel"
  | "booths"
  | "spider"
  | "teacups"
  | "bumper"
  | "swings"
  | "drop"
  | "arcade"
  | "haunted"
  | "ship"
  | "coaster"
  | "loop"
  | "bigtop";

export type RideSpot = {
  ride: Ride2D;
  zone: FunfairZone;
  /** RIDE_TAGS name in 3D. */
  tag: string;
  /** The ride's spot in 3D (world x, z). */
  world: World;
  /** Where it stands on the 2D field (world x, z): squeezed, plus a small nudge where a footprint would overhang. */
  at: World;
  /** Percent of the art. */
  x: number;
  y: number;
};

function ride(ride: Ride2D, zone: FunfairZone, tag: string, world: World, nudge: World = [0, 0]): RideSpot {
  const s = squeeze(world);
  const at: World = [s[0] + nudge[0], s[1] + nudge[1]];
  return { ride, zone, tag, world, at, ...worldToArt(at) };
}

export const RIDES_2D: RideSpot[] = [
  ride("carousel", "west", "LY1 / Carousel", [22.38, -46.93], [1, 0]),
  ride("booths", "west", "LY2 / Game Booths", [22.41, -38.03], [1, 0]),
  ride("wheel", "west", "LY3 / Vortexa Eye", [30.78, -28.42]),
  ride("spider", "west", "LY6 / Spider", [32.86, -50.87], [0, 1]),
  ride("spider", "west", "LY7 / Spider", [32.91, -40.18]),
  ride("teacups", "central", "LY4 / Teacups", [23.35, -17.84]),
  ride("bumper", "central", "LY5 / Bumper Cars", [23.39, -6.78]),
  ride("swings", "central", "LY8 / Swings", [33.47, -18.21]),
  ride("drop", "central", "LY9 / Drop Tower", [33.83, -4.32]),
  ride("arcade", "east", "D1 / Arcade", [11.16, 30.72], [-1, 0]),
  ride("haunted", "east", "D2 / Haunted House", [20.68, 29.66], [-1.5, 1.5]),
  ride("ship", "east", "D3 / Pirate Ship", [12.88, 18.75], [1.5, 1.5]),
  ride("coaster", "east", "D4 / VORTEX Coaster", [21.16, 7.28]),
  ride("loop", "east", "D5 / Coaster Loop", [31.77, 8.33]),
  ride("bigtop", "east", "D6 / Big Top", [25.89, 21.17]),
];

/** The VORTEXA neon gate: 3D GATE_POS, squeezed, then set on the field's park-side edge (the entrance). */
export const GATE_WORLD: World = [20, -11.5];
export const GATE_AT: World = [22.6, squeeze(GATE_WORLD)[1]];
export const GATE_2D = worldToArt(GATE_AT);

/** The middle of each zone in 3D (ZONE_CENTERS), where its sign floats. */
export const ZONE_WORLD: Record<FunfairZone, World> = { west: [35.2, -38.2], central: [32, -11.5], east: [29, 18] };

/** Which zone a spot on the field belongs to (squeezed z), for walks, lamps and plazas. */
export function zoneAt(z: number): FunfairZone {
  return z < -15 ? "west" : z < 5 ? "central" : "east";
}

/** The walks (squeezed world): the promenade down the middle, the boulevard by the road, and the cross walks. */
export const PROMENADE_X = 34;
export const BOULEVARD_X = 43.4;
export const HUBS: Record<FunfairZone, World> = { west: [PROMENADE_X, -31.2], central: [PROMENADE_X, -5.9], east: [31.64, 19.8] };
/** The ring walk round the Big Top. */
export const RING_R = 7.2;

export type Walk = { pts: World[]; hw: number };
export const WALKS: Walk[] = [
  { pts: [[PROMENADE_X, -40.5], [PROMENADE_X, HUBS.east[1] - RING_R]], hw: 1.5 },
  { pts: [[BOULEVARD_X, -40.5], [BOULEVARD_X, 34.5]], hw: 1.3 },
  { pts: [GATE_AT, [BOULEVARD_X, GATE_AT[1]]], hw: 1.7 },
  { pts: [[PROMENADE_X, -31.2], [BOULEVARD_X, -31.2]], hw: 1 },
  { pts: [[HUBS.east[0] + RING_R, HUBS.east[1]], [BOULEVARD_X, HUBS.east[1]]], hw: 1 },
  { pts: [[HUBS.east[0] - RING_R, HUBS.east[1]], [21.1, 19.8]], hw: 1 },
  { pts: [[HUBS.east[0] - RING_R * 0.7, HUBS.east[1] + RING_R * 0.7], [25.3, 28], [17, 27.3]], hw: 1 },
];
