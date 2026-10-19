import { describe, expect, it } from "vitest";

import { allZonesOn, isFunfairPreview } from "../../src/lib/funfair";

// The finale's trigger (src/lib/funfair.ts): the lake stage's concert plays only while all three funfair zones
// are on, and Admin's preview link (?funfair_preview=) takes the lake stage or a zone, nothing else.

describe("lake stage finale", () => {
  it("plays only while all three zones are on", () => {
    expect(allZonesOn({ west: 1, central: 1, east: 1 })).toBe(true);
    const notAll = [
      { west: 0, central: 1, east: 1 },
      { west: 1, central: 0, east: 1 },
      { west: 1, central: 1, east: 0 },
      { west: 0, central: 0, east: 0 },
    ];
    for (const p of notAll) expect(allZonesOn(p)).toBe(false);
  });

  it("previews the lake stage or a zone", () => {
    expect(["west", "central", "east", "lakefront"].every(isFunfairPreview)).toBe(true);
    for (const v of [null, "", "LAKEFRONT", "north", "toString"]) expect(isFunfairPreview(v)).toBe(false);
  });
});
