import { describe, expect, it } from "vitest";

import { day2Now, type Day2SegmentDef, type Day2State } from "../src/lib/day2";
import { heartbeatLevel, isFinalStretch, momentBetween, momentOnLoad, newlyLit } from "../src/lib/day2Moments";

// Current Day 2 plan: Opening 0-45 (Hard off), Hard Stations Open 45-105, Funfair 105-end.
const SEED: Day2SegmentDef[] = [
  { id: "s1", label: "Opening", start_min: 0, easy: true, medium: true, hard: false, blindbox: true, funfair: false },
  { id: "s2", label: "Hard Stations Open", start_min: 45, easy: true, medium: true, hard: true, blindbox: true, funfair: false },
  { id: "s3", label: "Funfair", start_min: 105, easy: true, medium: true, hard: true, blindbox: true, funfair: true },
];
const T0 = Date.parse("2026-11-28T09:00:00Z");
const MIN = 60_000;

function state(over: Partial<Day2State> = {}): Day2State {
  return {
    game_on: true,
    game_started_at: new Date(T0).toISOString(),
    game_ends_at: new Date(T0 + 150 * MIN).toISOString(),
    segments: SEED,
    manual_segment: null,
    overrides: {},
    override_segment: null,
    server_now: new Date(T0).toISOString(),
    ...over,
  };
}
const at = (min: number, s: Day2State | null = state()) => day2Now(s, T0 + min * MIN);

describe("Day 2 moments on a page that is open", () => {
  it("shows Challenge when the game starts, Hard at 45 min and the funfair at 105 min", () => {
    const off = at(0, state({ game_on: false, game_started_at: null }));
    expect(momentBetween(off, at(0), state())).toBe("challenge");
    expect(momentBetween(at(30), at(44.9), state())).toBeNull();
    expect(momentBetween(at(44.9), at(45), state())).toBe("hard");
    expect(momentBetween(at(104.9), at(105), state())).toBe("funfair");
    expect(momentBetween(at(105), at(120), state())).toBeNull();
  });

  it("follows Admin: a live flip of Hard opens it early, a held segment counts as a start", () => {
    const flipped = state({ overrides: { hard: true }, override_segment: "s1" });
    expect(momentBetween(at(20), at(20.1, flipped), flipped)).toBe("hard");
    const held = state({ game_on: false, game_started_at: null, manual_segment: "s3" });
    expect(momentBetween(at(0, state({ game_on: false, game_started_at: null })), day2Now(held, T0), held)).toBe("funfair");
  });

  it("shows nothing when the game ends", () => {
    const ended = state({ game_on: false, game_started_at: null });
    expect(momentBetween(at(140), at(150, ended), ended)).toBeNull();
  });

  it("shows Challenge when Admin turns blind boxes back on", () => {
    const boxesOff = state({ overrides: { blindbox: false }, override_segment: "s1" });
    expect(momentBetween(at(10, boxesOff), at(10), state())).toBe("challenge");
  });
});

describe("Day 2 moments when a page loads (a reload shows it again)", () => {
  it("shows the latest moment that holds now", () => {
    expect(momentOnLoad(at(-5, state({ game_on: false, game_started_at: null })), null)).toBeNull();
    expect(momentOnLoad(at(10), state())).toBe("challenge");
    expect(momentOnLoad(at(70), state())).toBe("hard");
    expect(momentOnLoad(at(130), state())).toBe("funfair");
  });

  it("does not call Hard opened when it was never closed in this game", () => {
    const allOpen = state({ segments: SEED.map((g) => ({ ...g, hard: true })) });
    expect(momentOnLoad(at(70, allOpen), allOpen)).toBe("challenge");
  });
});

describe("final stretch", () => {
  it("is the funfair switch while the game runs", () => {
    expect(isFinalStretch(at(100))).toBe(false);
    expect(isFinalStretch(at(110))).toBe(true);
    expect(isFinalStretch(at(110, state({ game_on: false, game_started_at: null })))).toBe(false);
  });

  it("beats faintly, then harder with each projector lit, and stops once all are lit", () => {
    expect(heartbeatLevel(false, 0)).toBe(0);
    expect(heartbeatLevel(true, 0)).toBe(1);
    expect(heartbeatLevel(true, 1)).toBe(2);
    expect(heartbeatLevel(true, 2)).toBe(3);
    expect(heartbeatLevel(true, 3)).toBe(0);
  });

  it("finds the projectors lit since the last reading", () => {
    expect(newlyLit([], ["A3"])).toEqual(["A3"]);
    expect(newlyLit(["A3"], ["TF", "A3"])).toEqual(["TF"]);
    expect(newlyLit(["A3"], ["A3"])).toEqual([]);
  });
});
