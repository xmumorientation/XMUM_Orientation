import { describe, expect, it } from "vitest";

import { day2Now, effectiveStatus, type Day2SegmentDef, type Day2State } from "@/lib/day2";

const seg = (id: string, start_min: number, hard: boolean): Day2SegmentDef => ({
  id, label: id, start_min, easy: true, medium: true, hard, blindbox: true, funfair: false,
});
const T0 = Date.parse("2026-11-05T10:00:00Z");
const state = (gameOn = true): Day2State => ({
  game_on: gameOn,
  game_started_at: new Date(T0).toISOString(),
  game_ends_at: new Date(T0 + 150 * 60_000).toISOString(),
  segments: [seg("a", 0, false), seg("b", 60, true)],
  manual_segment: null,
  overrides: {},
  override_segment: null,
  server_now: new Date(T0).toISOString(),
});
const at = (min: number, s = state()) => day2Now(s, T0 + min * 60_000);
const hard = { day: 2, risk_tier: "high", status: "available" } as const;
const easy = { day: 2, risk_tier: "low", status: "available" } as const;

describe("effectiveStatus: a tier's switch is the stations' status (On = available, Off = closed)", () => {
  it("a high-risk station is closed while Hard is off, open once it is on", () => {
    expect(effectiveStatus(hard, at(10), state())).toBe("closed");
    expect(effectiveStatus(hard, at(70), state())).toBe("available");
  });
  it("other tiers are not touched", () => {
    expect(effectiveStatus(easy, at(10), state())).toBe("available");
  });
  it("a group playing keeps its station In Progress", () => {
    expect(effectiveStatus({ ...hard, status: "in_progress" }, at(10), state())).toBe("in_progress");
  });
  it("a station Closed by hand stays closed after its tier opens", () => {
    expect(effectiveStatus({ ...hard, status: "closed" }, at(70), state())).toBe("closed");
  });
  it("does nothing when no Day 2 game is running, and for Day 1 stations", () => {
    expect(effectiveStatus(hard, at(10, state(false)), state(false))).toBe("available");
    expect(effectiveStatus({ ...hard, day: 1 }, at(10), state())).toBe("available");
  });
});
