import { UNITS_PER_M, type World } from "../geo";
import * as C from "./central/layout";
import { dormPlace } from "./common";
import * as E from "./east/layout";
import * as W from "./west/layout";

// Names on the funfair. Each ride's tag starts with its dorm's name, since the dorms are real and Freshies look
// for LY3 or D4 (docs/map3d-funfair-design.md, "Wayfinding").

/** Zone metres → world, for a zone whose origin is `origin`. */
const world = (origin: readonly [number, number], [x, z]: readonly [number, number]): World => [
  origin[0] + x * UNITS_PER_M,
  origin[1] + z * UNITS_PER_M,
];

/** One tag per dorm, at the ride that stands on it. */
export const RIDE_TAGS: { name: string; pos: World }[] = [
  { name: "LY1 · Carousel", pos: world(W.ORIGIN, W.CAROUSEL) },
  { name: "LY2 · Game Booths", pos: world(W.ORIGIN, W.BOOTHS) },
  { name: "LY3 · Vortexa Eye", pos: world(W.ORIGIN, W.WHEEL) },
  { name: "LY6 · Spider", pos: world(W.ORIGIN, W.SPIDERS[1]) },
  { name: "LY7 · Spider", pos: world(W.ORIGIN, W.SPIDERS[0]) },
  { name: "LY4 · Teacups", pos: world(C.ORIGIN, C.TEACUPS) },
  { name: "LY5 · Bumper Cars", pos: world(C.ORIGIN, C.BUMPER) },
  { name: "LY8 · Swings", pos: world(C.ORIGIN, C.SWINGS) },
  { name: "LY9 · Drop Tower", pos: world(C.ORIGIN, C.DROP) },
  { name: "D1 · Arcade", pos: world(E.ORIGIN, E.ARCADE) },
  { name: "D2 · Haunted House", pos: world(E.ORIGIN, E.HAUNTED) },
  { name: "D3 · Pirate Ship", pos: world(E.ORIGIN, E.SHIP) },
  { name: "D4 · VORTEX Coaster", pos: world(E.ORIGIN, [E.STATION.x, (E.STATION.z[0] + E.STATION.z[1]) / 2]) },
  { name: "D5 · Coaster Loop", pos: dormPlace("D5").pos },
  { name: "D6 · Big Top", pos: world(E.ORIGIN, E.BIGTOP) },
];

/** The funfair's own name, over the middle of its land: it is a game zone, not a real fair. */
export const FUNFAIR_LABEL = { name: "Vortexa Funfair (game zone)", pos: [32, -11.5] as World, y: 9 };
