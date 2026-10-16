import { describe, expect, it } from "vitest";

import { BEAT, FIREWORK_LOOPS, LOOP, SECTION, SHELL_LIFE, maxFlashesPerSecond, showAt } from "../../src/components/map3d/lakefront/show";

// The lake stage's concert timeline (src/components/map3d/lakefront/show.ts): its rhythm, its photosensitivity
// limit, a smooth sweep, and that reduced motion turns the motion off.

describe("lake stage show", () => {
  it("is a 30 s loop of four 16-beat sections at 128 BPM", () => {
    expect(BEAT).toBeCloseTo(60 / 128);
    expect(SECTION).toBeCloseTo(16 * BEAT);
    expect(LOOP).toBeCloseTo(30);
    expect([0.1, SECTION + 0.1, 2 * SECTION + 0.1, 3 * SECTION + 0.1].map((t) => showAt(t).section)).toEqual([0, 1, 2, 3]);
  });

  it("repeats every loop, except the beams' sweep clock, which keeps running", () => {
    const a = showAt(12.3);
    const b = showAt(12.3 + LOOP);
    expect(b.colA).toEqual(a.colA);
    expect(b.mix).toEqual(a.mix);
    expect(b.flash).toBeCloseTo(a.flash);
    expect(b.sweep).toBeGreaterThan(a.sweep);
  });

  it("flashes at most twice in any second (guidance: at most three)", () => {
    expect(maxFlashesPerSecond()).toBeGreaterThan(0);
    expect(maxFlashesPerSecond()).toBeLessThanOrEqual(2);
  });

  it("sweeps the beams smoothly across section and loop boundaries", () => {
    const dt = 0.01;
    let worst = 0;
    for (let t = 0; t < 2 * LOOP; t += dt) worst = Math.max(worst, Math.abs(showAt(t + dt).sweep - showAt(t).sweep));
    // the fastest section sweeps 2.6 s of motion per second
    expect(worst).toBeLessThan(2.7 * dt);
  });

  it("sends fireworks up only in the drop of every fourth loop", () => {
    const busy: number[] = [];
    for (let t = 0; t < LOOP * FIREWORK_LOOPS; t += 0.1) if (showAt(t).shells.some((s) => s >= 0)) busy.push(t);
    const dropStart = LOOP * (FIREWORK_LOOPS - 1) + 2 * SECTION;
    expect(busy.length).toBeGreaterThan(0);
    expect(Math.min(...busy)).toBeGreaterThanOrEqual(dropStart - 0.1);
    expect(Math.max(...busy)).toBeLessThan(dropStart + 12 * BEAT + SHELL_LIFE);
  });

  it("fires confetti as the drop starts, and it is still falling into the breakdown", () => {
    expect(showAt(2 * SECTION - 0.1).confetti).toBe(-1);
    expect(showAt(2 * SECTION + 0.2).confetti).toBeCloseTo(0.2);
    expect(showAt(3 * SECTION + 0.2).confetti).toBeGreaterThan(SECTION);
  });

  it("turns off flashes, flames, confetti, fireworks and motion for reduced motion", () => {
    for (let t = 0; t < LOOP * FIREWORK_LOOPS; t += 0.25) {
      const f = showAt(t, true);
      expect(f.flash).toBe(0);
      expect(f.flame).toBe(0);
      expect(f.confetti).toBe(-1);
      expect(f.shells.every((s) => s === -1)).toBe(true);
      expect(f.amp).toBe(0);
      expect(f.pan).toBe(0);
    }
  });
});
