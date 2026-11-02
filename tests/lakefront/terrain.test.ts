import { describe, expect, it } from "vitest";

import { BASIN_D, DUCK, FUNFAIR_LAND, LAKE, LAKE_WATER_Y, UNITS_PER_M, plateauY } from "../../src/components/map3d/geo";
import {
  RING_R,
  RING_Y,
  SEATS_ARC,
  TERRACE_D,
  TERRACE_H,
  TERRACES,
  polar,
  toWorld3,
} from "../../src/components/map3d/lakefront/layout";
import { basinY, groundY } from "../../src/components/map3d/terrain";

// The lake's low ground (src/components/map3d/terrain.ts, Ben 2026-11-02): the lake and the stage lie BASIN_D down,
// the amphitheatre's terraces are cut into the bank, and past the top terrace the ground still climbs.

/** The ground at a venue point (metres), in metres above the stage's floor. */
function venueGround(r: number, a: number): number {
  const [x, , z] = toWorld3(polar(r, a));
  return basinY(x, z) / UNITS_PER_M + BASIN_D / UNITS_PER_M;
}

const R_TOP = RING_R + TERRACES * TERRACE_D;
const Y_TOP = RING_Y + TERRACES * TERRACE_H;
const ANGLES = Array.from({ length: 21 }, (_, i) => SEATS_ARC[0] + (i / 20) * (SEATS_ARC[1] - SEATS_ARC[0]));

describe("lake basin", () => {
  it("is BASIN_D down under the open water and on the stage's floor", () => {
    expect(groundY(...DUCK.pos)).toBeCloseTo(-BASIN_D);
    for (const a of [0, 1, 2, 3]) expect(venueGround(10, a)).toBeCloseTo(0);
  });

  it("meets the water at its level along the shore, away from the stage", () => {
    const [sx, , sz] = toWorld3([0, 0, 0]);
    for (const [x, z] of LAKE) {
      if (Math.hypot(x - sx, z - sz) < RING_R * UNITS_PER_M) continue;
      expect(groundY(x, z)).toBeCloseTo(-BASIN_D + LAKE_WATER_Y, 3);
    }
  });

  it("stays flat on the funfair's land and on the A-row's raised ground", () => {
    for (const [x, z] of FUNFAIR_LAND) expect(basinY(x, z)).toBe(0);
    for (const [x, z] of [
      [-22, -20],
      [-20, 0],
    ]) {
      expect(basinY(x, z)).toBe(0);
      expect(groundY(x, z)).toBe(plateauY(x, z));
    }
  });

  it("keeps the ground under each terrace's front edge and meets the top terrace at its back edge", () => {
    for (const a of ANGLES) {
      for (let k = 0; k < TERRACES; k++) {
        const r0 = RING_R + k * TERRACE_D;
        // just past the front edge, the terrace below's top is the lowest the steps get
        expect(venueGround(r0 + 0.05, a)).toBeLessThan(RING_Y + k * TERRACE_H);
      }
      expect(venueGround(R_TOP, a)).toBeLessThanOrEqual(Y_TOP + 1e-6);
    }
    expect(venueGround(R_TOP, 0)).toBeCloseTo(Y_TOP, 2);
  });

  it("climbs on past the top terrace, gently, to the campus's level", () => {
    let last = venueGround(R_TOP, 0);
    for (let r = R_TOP + 1; r <= R_TOP + 40; r += 1) {
      const y = venueGround(r, 0);
      expect(y).toBeGreaterThanOrEqual(last - 1e-9);
      // under 15° anywhere
      expect(y - last).toBeLessThan(Math.tan((15 * Math.PI) / 180));
      last = y;
    }
    expect(last).toBeCloseTo(BASIN_D / UNITS_PER_M, 2);
  });
});
