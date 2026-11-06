import { describe, expect, it } from "vitest";

import {
  BASEMENT_HOUSE,
  BASEMENT_RAMP,
  BASEMENT_RISE,
  BASEMENT_ROAD,
  CAMPUS_FENCE,
  GATE_ROAD,
  PLATEAU_H,
  RAMP_DEPTH_M,
  UNITS_PER_M,
  inKeepOut,
  inPolygon,
  plateauY,
} from "../../src/components/map3d/geo";
import { campusTrees } from "../../src/components/map3d/plants";
import { groundY } from "../../src/components/map3d/terrain";

// The road to the A-row's basement car park (geo.ts BASEMENT_M, Ben 2026-11-05): it leaves the campus road between A5
// and the track, bends west and goes down a ramp beside a white house into the car park under the A-row's raised
// ground, with a paved way climbing beside the ramp to the A-row's walk.

const { inner, wall, mid, depth, climb } = BASEMENT_RAMP;
const K = mid.length - 1;

describe("the road to the basement car park", () => {
  it("starts at the campus road", () => {
    const [x, z] = BASEMENT_ROAD.centre[0];
    const d = Math.min(...GATE_ROAD.line.map(([gx, gz]) => Math.hypot(gx - x, gz - z)));
    expect(d).toBeLessThan(GATE_ROAD.width);
  });

  it("is level at the fork and goes down to the portal", () => {
    expect(groundY(...mid[1])).toBeCloseTo(0, 3);
    expect(groundY(...mid[K - 1]) / UNITS_PER_M).toBeLessThan(-RAMP_DEPTH_M + 0.2);
    for (let k = 1; k <= K; k++) expect(depth[k]).toBeGreaterThanOrEqual(depth[k - 1]);
  });

  it("has the paved way climb beside it from the lawn to the raised ground's top", () => {
    expect(climb[0]).toBeCloseTo(0);
    expect(climb[K]).toBeCloseTo(PLATEAU_H);
    // just outside the white wall, on the paved way
    const outside = (k: number) => {
      const [x, z] = wall[k];
      const [ox, oz] = BASEMENT_RAMP.wallOut[k];
      return plateauY(x + ox * 1.5 * UNITS_PER_M, z + oz * 1.5 * UNITS_PER_M);
    };
    expect(outside(Math.round(K / 2))).toBeGreaterThan(0.3 * PLATEAU_H);
    expect(outside(K - 1)).toBeGreaterThan(0.9 * PLATEAU_H);
  });

  it("keeps the house off the ramp, and trees off both", () => {
    // (the last section is the portal, on the house's face)
    for (let k = 0; k < K; k++) expect(inPolygon(BASEMENT_HOUSE.outline, ...mid[k])).toBe(false);
    for (const p of [...mid, ...BASEMENT_HOUSE.outline, ...BASEMENT_RISE.mid]) expect(inKeepOut(p[0], p[1], 0.01)).toBe(true);
    const trees = campusTrees();
    for (const t of trees) {
      expect(inPolygon(BASEMENT_RAMP.outline, t.x, t.z)).toBe(false);
      expect(inPolygon(BASEMENT_HOUSE.outline, t.x, t.z)).toBe(false);
    }
  });

  it("has no gap in the fence where the art's road ran on to the outer road", () => {
    // the south side of the fence (world x is north), across where that road crossed it (world z 13.6 to 16.2)
    const ends = CAMPUS_FENCE.flatMap((run) => [run[0], run[run.length - 1]]);
    expect(ends.filter(([x, z]) => x < -45 && z > 12 && z < 18)).toEqual([]);
  });

  it("puts the ramp between the house and the white wall", () => {
    // the inner edge along the house is about 6.5 m from the wall
    const k = K - 2;
    const w = Math.hypot(inner[k][0] - wall[k][0], inner[k][1] - wall[k][1]) / UNITS_PER_M;
    expect(w).toBeGreaterThan(5.5);
    expect(w).toBeLessThan(7.5);
  });
});
