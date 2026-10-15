import { UNITS_PER_M } from "../../geo";
import { dormPlace } from "../common";

// DRAFT: where things stand in the Central zone, in metres from the zone's
// origin (x north, z east; the same axes as the world). The zone is the brown
// land between LY3 (west zone) and D4/D5 (east zone), north of the lake park:
// x from -80 (the park edge, where the VORTEXA gate stands) to about 90, z from
// -70 to 72.

/** The zone's origin in world units. */
export const ORIGIN: [number, number] = [32, -11.5];

/** World [x, z] → zone metres [x, z]. */
export function toLocal([x, z]: [number, number]): [number, number] {
  return [(x - ORIGIN[0]) / UNITS_PER_M, (z - ORIGIN[1]) / UNITS_PER_M];
}

const at = (dorm: string) => toLocal(dormPlace(dorm).pos);

/** Ride centres, on their dorms' footprints. */
export const TEACUPS = at("LY4"); // about (-58, -43)
export const BUMPER = at("LY5"); // about (-58, 32)
export const SWINGS = at("LY8"); // about (10, -45)
export const DROP = at("LY9"); // about (12, 48)

/** Ride plaza sizes (metres). */
export const TEACUPS_R = 20;
export const SWINGS_R = 18.5;
export const DROP_R = 15;
/** Bumper car pavilion: half length (x) and half width (z), and its plaza margin. */
export const BUMPER_HX = 15;
export const BUMPER_HZ = 11;

/** The main midway (north-south, from the gate) and the cross promenade (west-east). */
export const BOULEVARD = { x: [-80, 86] as [number, number], hw: 6.5 };
export const PROMENADE = { x: [-29, -21] as [number, number], z: [-66, 68] as [number, number] };
/** The north square: candy lane, game alley, food court and the fountain. */
export const SQUARE = { x: [36, 88] as [number, number], z: [-62, 64] as [number, number] };
export const FOUNTAIN: [number, number] = [60, 0];

/** The power box, at the south-west corner of the main crossing. */
export const POWER_BOX: [number, number] = [-35, -11];
