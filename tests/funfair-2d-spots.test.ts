import { describe, expect, it } from "vitest";

import { FIELD, GATE_AT, GATE_WORLD, RIDES_2D, ZONE_WORLD, squeeze, worldToArt } from "../src/components/campus-map/funfair2dLayout";
import { GATE_POS } from "../src/components/map3d/funfair/gate";
import { RIDE_TAGS, ZONE_CENTERS } from "../src/components/map3d/funfair/labels";
import { toWorld } from "../src/components/map3d/geo";
import { DEFAULT_ZONE_KEYS, FUNFAIR_ZONES, PROJECTOR_ZONES } from "../src/lib/funfair";
import { mapTimeAt } from "../src/lib/mapTime";

const near = (a: readonly number[], b: readonly number[], tol = 0.05) => {
  expect(Math.abs(a[0] - b[0])).toBeLessThan(tol);
  expect(Math.abs(a[1] - b[1])).toBeLessThan(tol);
};

/** Distance from a point inside the field to its nearest edge (negative when outside). */
function inset([x, z]: readonly number[]): number {
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = FIELD.length - 1; i < FIELD.length; j = i++) {
    const [xi, zi] = FIELD[i];
    const [xj, zj] = FIELD[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const [ex, ez] = [xj - xi, zj - zi];
    const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - (xi + t * ex), z - (zi + t * ez)));
  }
  return inside ? d : -d;
}

describe("2D map funfair", () => {
  it("keeps each ride's 3D spot", () => {
    for (const r of RIDES_2D) {
      const tag = RIDE_TAGS.find((t) => t.name === r.tag);
      expect(tag, r.tag).toBeDefined();
      near(r.world, tag!.pos);
    }
    near(GATE_WORLD, GATE_POS);
    for (const zone of FUNFAIR_ZONES) near(ZONE_WORLD[zone], ZONE_CENTERS[zone]);
  });

  it("puts every ride inside the art's field, with room for its footprint", () => {
    for (const r of RIDES_2D) expect(inset(r.at), r.tag).toBeGreaterThan(3);
    expect(inset(GATE_AT)).toBeGreaterThan(1.5);
  });

  it("keeps the rides in the same order as in 3D", () => {
    for (const a of RIDES_2D) {
      for (const b of RIDES_2D) {
        if (a.world[1] < b.world[1] - 1) expect(squeeze(a.world)[1], `${a.tag} / ${b.tag}`).toBeLessThan(squeeze(b.world)[1]);
      }
    }
  });

  it("projects onto the art as the 3D map reads it", () => {
    const ART_H = (2000 * 1776) / 3203;
    for (const w of [[20, -11.5], [30, 10], [45, -40]] as [number, number][]) {
      const p = worldToArt(w);
      near(toWorld([(p.x / 100) * 2000, (p.y / 100) * ART_H]), w, 0.01);
    }
  });

  it("puts each projector over the zone its key lights", () => {
    for (const zone of FUNFAIR_ZONES) expect(PROJECTOR_ZONES[DEFAULT_ZONE_KEYS[zone]]).toBe(zone);
  });
});

describe("map time of day", () => {
  const at = (h: number) => mapTimeAt(new Date(2026, 10, 7, h, 30));
  it("is day from 7:00 to 18:00, sunset at 6 and 18, night otherwise", () => {
    expect([at(5), at(6), at(7), at(12), at(17), at(18), at(19), at(0)]).toEqual([
      "night", "sunset", "day", "day", "day", "sunset", "night", "night",
    ]);
  });
});
