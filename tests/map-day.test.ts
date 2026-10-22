import { describe, expect, it } from "vitest";
import { activeMapDay } from "../src/lib/mapDay";
import { parseStaffPositions } from "../src/lib/staffLocation";

describe("map follows the live game", () => {
  it("starts on Day 1 and switches after Day 1 ends", () => {
    expect(activeMapDay([])).toBe(1);
    expect(activeMapDay([{ key: "day1", state: "ended" }])).toBe(2);
  });
  it("prioritises active and paused games over a previously ended day", () => {
    expect(activeMapDay([{ key: "day1", state: "active" }, { key: "day2", state: "ended" }])).toBe(1);
    expect(activeMapDay([{ key: "day1", state: "paused" }])).toBe(1);
    expect(activeMapDay([{ key: "day2", state: "active" }])).toBe(2);
    expect(activeMapDay([{ key: "day2", state: "paused" }])).toBe(2);
  });
});

describe("staff location boundary", () => {
  const now = Date.now();
  const position = { user_id: "hof", full_name: "HOF", role: "hof", lat: 2.8, lng: 101.7, accuracy_m: 15, updated_at: new Date(now).toISOString() };
  it("keeps recent staff fixes", () => expect(parseStaffPositions([position], now)).toEqual([position]));
  it("rejects stale, malformed and nonstaff fixes", () => {
    for (const change of [{ lat: NaN }, { role: "freshie" }, { lng: 181 }, { accuracy_m: -1 }, { updated_at: "invalid" }, { updated_at: new Date(now - 120_000).toISOString() }]) {
      expect(parseStaffPositions([{ ...position, ...change }], now)).toEqual([]);
    }
    expect(parseStaffPositions(null, now)).toEqual([]);
  });
});
