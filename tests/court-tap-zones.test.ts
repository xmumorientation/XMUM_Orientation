import { describe, expect, it } from "vitest";
import { SPORTS } from "../src/components/map3d/geo";
import { courtCells, SPEC } from "../src/components/map3d/courts";
import { areaPlace, TENNIS_PLAY_AREAS } from "../src/components/map3d/places";

describe("separate station and Tennis entry courts", () => {
  it("links both lower blocks to their corresponding station areas", () => {
    expect(TENNIS_PLAY_AREAS.map(place => place.area)).toEqual(["Tennis Court", "Volleyball Court"]);
  });
  it("covers all three playing courts in each lower block", () => {
    for (const [index, sport] of ["futsal", "basketball"].entries()) {
      const block = SPORTS.find(block => block.sport === sport)!;
      const place = TENNIS_PLAY_AREAS[index];
      for (const cell of courtCells(block)) {
        const spec = SPEC[cell.sport];
        const halfX = (cell.alongX ? spec.L : spec.W) * cell.s / 2;
        const halfZ = (cell.alongX ? spec.W : spec.L) * cell.s / 2;
        expect(Math.abs(cell.cx - place.pos[0]) + halfX).toBeLessThan(place.hx);
        expect(Math.abs(cell.cz - place.pos[1]) + halfZ).toBeLessThan(place.hz);
      }
    }
  });
  it("does not overlap the upper station courts", () => {
    for (const play of TENNIS_PLAY_AREAS) {
      for (const area of ["Tennis Court", "Volleyball Court"]) {
        const station = areaPlace(area)!;
        const overlapX = Math.abs(play.pos[0] - station.pos[0]) < play.hx + station.hx;
        const overlapZ = Math.abs(play.pos[1] - station.pos[1]) < play.hz + station.hz;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });
});
