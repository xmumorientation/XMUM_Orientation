import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { aim, BALL_R, bounces, G, MAX_BACK, meetPoint, netHit } from "../../src/components/map3d/tennis/ball";
import { COURT } from "../../src/components/map3d/tennis/court";
import { LEAD_MAX, LEAD_MIN, Match, POINTS_TO_WIN, strokeTarget, type Fx, type Side } from "../../src/components/map3d/tennis/match";
import { makeRig, posePlayer, racketAtContact } from "../../src/components/map3d/tennis/player";
import type { V3 } from "../../src/components/map3d/tennis/rally";

// The tennis game (src/components/map3d/tennis/ball.ts, match.ts): the ball's flight, where a stroke goes for the
// tap's timing, the player's taps, and whole matches between two bots.

const DT = 1 / 60;

/** Plays a match to its end in steps of DT, calling `each` with every step's events. */
function play(m: Match, each?: (t: number, fx: Fx[]) => void, limit = 900) {
  let t = 0;
  while (m.phase !== "over" && t < limit) {
    t += DT;
    m.step(t);
    each?.(t, m.drain());
  }
  return t;
}

/** Shots like the game's: from behind the near baseline to a bounce in the far half. */
function shots() {
  const out: { from: V3; to: [number, number]; clear: number }[] = [];
  for (let i = 0; i < 60; i++) {
    out.push({
      from: [-(COURT.halfL + 0.5 + (i % 5) * 0.7), 1.1 + (i % 4) * 0.3, ((i % 7) - 3) * 1.1],
      to: [5.5 + (i % 6) * 0.8, ((i % 9) - 4) * 0.9],
      clear: 0.3 + (i % 5) * 0.4,
    });
  }
  return out;
}

describe("tennis ball", () => {
  it("lands where it is aimed, clearing the net by the margin asked", () => {
    for (const { from, to, clear } of shots()) {
      const f = aim(0, from, to, clear);
      const [b] = bounces(f, 1);
      expect(b.p[0]).toBeCloseTo(to[0], 6);
      expect(b.p[2]).toBeCloseTo(to[1], 6);
      const tn = -from[0] / f.v[0];
      expect(from[1] + f.v[1] * tn - (G * tn * tn) / 2 - BALL_R - COURT.netTop).toBeCloseTo(clear, 6);
      expect(netHit(f)).toBeNull();
      expect(netHit(aim(0, from, to, -0.3))).not.toBeNull();
    }
  });

  it("meets the receiver after the first bounce and before the second, at a height a racket reaches", () => {
    const h = racketAtContact(1).y;
    for (const { from, to, clear } of shots()) {
      const f = aim(0, from, to, clear);
      const m = meetPoint(f, h);
      const [b1, b2] = bounces(f, 2);
      expect(m.t).toBeGreaterThan(b1.t);
      if (b2) expect(m.t).toBeLessThan(b2.t);
      expect(Math.abs(m.p[0])).toBeLessThanOrEqual(COURT.halfL + MAX_BACK + 1e-6);
      expect(m.p[1]).toBeGreaterThan(0.4);
      expect(m.p[1]).toBeLessThan(3);
    }
  });
});

describe("tennis strokes", () => {
  it("pulls an early tap across the court and pushes a late one down the line", () => {
    // player 0's forehand is on +z (their right); a backhand is the other way round, and so is player 1
    expect(strokeTarget(0, 1, 0.7, 0).to[1]).toBeGreaterThan(1.5);
    expect(strokeTarget(0, 1, -0.7, 0).to[1]).toBeLessThan(-1.5);
    expect(strokeTarget(0, -1, 0.7, 0).to[1]).toBeLessThan(-1.5);
    expect(strokeTarget(1, 1, 0.7, 0).to[1]).toBeLessThan(-1.5);
    // the middle of the window: through the middle, deepest, lowest over the net
    const mid = strokeTarget(0, 1, 0, 0);
    const edge = strokeTarget(0, 1, 0.7, 0);
    expect(Math.abs(mid.to[1])).toBeLessThan(1e-9);
    expect(mid.to[0]).toBeGreaterThan(edge.to[0]);
    expect(mid.clear).toBeLessThan(edge.clear);
    // past the edges: the earliest into the net, the latest wide; inside them, always in
    expect(strokeTarget(0, 1, -0.95, 0).clear).toBeLessThan(0);
    expect(Math.abs(strokeTarget(0, 1, 0.95, 0).to[1])).toBeGreaterThan(COURT.halfW);
    for (let s = -0.9; s <= 0.9; s += 0.05) {
      for (const j of [-0.5, 0.5]) expect(Math.abs(strokeTarget(0, 1, s, j).to[1])).toBeLessThan(COURT.halfW - 0.2);
    }
  });
});

describe("tennis match", () => {
  it("plays two bots to 5, serving in turn, each serve into the service box", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = new Match(seed, ["bot", "bot"]);
      const servers: Side[] = [];
      let before = m.phase;
      let serveLands = false;
      play(m, (_, fx) => {
        for (const e of fx) {
          if (e.type === "hit" && before === "serve") {
            servers.push(e.by);
            serveLands = true;
          } else if (serveLands) {
            expect(e.type).toBe("bounce");
            const dir = servers[servers.length - 1] === 0 ? 1 : -1;
            expect(e.p[0] * dir).toBeGreaterThan(0);
            expect(e.p[0] * dir).toBeLessThanOrEqual(6.4);
            expect(Math.abs(e.p[2])).toBeLessThanOrEqual(COURT.halfW);
            serveLands = false;
          }
        }
        before = m.phase;
      });
      expect(m.phase).toBe("over");
      expect(Math.max(...m.score)).toBe(POINTS_TO_WIN);
      expect(Math.min(...m.score)).toBeLessThan(POINTS_TO_WIN);
      expect(servers.length).toBe(m.score[0] + m.score[1]);
      servers.forEach((s, i) => expect(s).toBe(i % 2));
    }
  });

  it("meets the ball with the racket as drawn, at every hit", () => {
    const rig = makeRig();
    for (const seed of [7, 8, 9]) {
      const m = new Match(seed, ["bot", "bot"]);
      let hits = 0;
      play(m, (_, fx) => {
        for (const e of fx) {
          if (e.type !== "hit") continue;
          const f = m.frame(e.by, e.t);
          rig.root.position.set(f.x, 0, f.z);
          rig.root.rotation.y = f.yaw;
          posePlayer(rig, f.pose);
          rig.root.updateMatrixWorld(true);
          expect(rig.sweetSpot.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...e.p))).toBeLessThan(0.12);
          hits++;
        }
      });
      expect(hits).toBeGreaterThan(9);
    }
  });

  it("is the same match for the same seed", () => {
    const run = (seed: number) => {
      const m = new Match(seed, ["bot", "bot"]);
      return { t: play(m), score: m.score };
    };
    expect(run(11)).toEqual(run(11));
  });
});

/** The forehand's sweet spot, across the court from player 0's body. */
const FOREHAND_Z = -racketAtContact(1).x;

/**
 * The player serves; this stops when the bot's return is on its way, with the player sent to meet it with a
 * forehand. Null if the bot misses.
 */
function setUp(seed: number) {
  const m = new Match(seed, ["player", "bot"]);
  let t = 0.2;
  m.step(t);
  m.tap(0, t);
  while (t < 20 && (m.phase === "serve" || m.phase === "rally")) {
    t += DT;
    m.step(t);
    m.drain();
    const meet = m.incoming(0);
    if (meet) {
      m.moveAim(0, meet.p[2] - FOREHAND_Z - m.players[0].aim);
      return { m, t, meet };
    }
  }
  return null;
}

/** Steps the match on from t to just before `until`. */
function runTo(m: Match, t: number, until: number) {
  while (t + DT < until) {
    t += DT;
    m.step(t);
  }
  return t;
}

/** The first seed whose return the player reaches in time for a tap at the earliest. */
const SEED = (() => {
  for (let seed = 1; seed < 80; seed++) {
    const s = setUp(seed);
    if (s && s.m.marker(0, runTo(s.m, s.t, s.meet.t - LEAD_MAX - 0.15))?.ok) return seed;
  }
  throw new Error("no seed gives the player a return to meet");
})();

/** From that moment, a tap with this timing (-1 to 1, or "early": before the window); the events after it. */
function strokeWith(timing: number | "early", cancelAfter?: number) {
  const { m, t: start, meet } = setUp(SEED)!;
  const lead = timing === "early" ? LEAD_MAX + 0.15 : LEAD_MIN + ((1 - timing) / 2) * (LEAD_MAX - LEAD_MIN);
  let t = runTo(m, start, meet.t - lead);
  m.drain();
  m.tap(0, meet.t - lead);
  if (cancelAfter !== undefined) m.cancel(0, meet.t - lead + cancelAfter);
  const events: Fx[] = [];
  while (t < meet.t + 3 && m.phase === "rally") {
    t += DT;
    m.step(t);
    events.push(...m.drain());
  }
  return { m, events };
}

/** The first thing the ball does after the player's hit: lands (where, in or out) or meets the net. */
function afterHit(events: Fx[]) {
  const i = events.findIndex((e) => e.type === "hit" && e.by === 0);
  return i < 0 ? null : (events.slice(i + 1).find((e) => e.type === "bounce" || e.type === "net") ?? null);
}

describe("tennis player's taps", () => {
  it("hits through the middle from the middle of the window", () => {
    const e = afterHit(strokeWith(0).events);
    expect(e?.type).toBe("bounce");
    if (e?.type === "bounce") {
      expect(e.out).toBe(false);
      expect(Math.abs(e.p[2])).toBeLessThan(0.35);
    }
  });

  it("pulls an early tap cross-court and pushes a late one down the line (forehand)", () => {
    const early = afterHit(strokeWith(-0.7).events);
    const late = afterHit(strokeWith(0.7).events);
    expect(early?.type === "bounce" && !early.out && early.p[2] < -1.5).toBe(true);
    expect(late?.type === "bounce" && !late.out && late.p[2] > 1.5).toBe(true);
  });

  it("puts the earliest into the net and the latest wide", () => {
    expect(afterHit(strokeWith(-0.95).events)?.type).toBe("net");
    const wide = afterHit(strokeWith(0.95).events);
    expect(wide?.type === "bounce" && wide.out).toBe(true);
  });

  it("misses a tap before the window, and says so", () => {
    const { m, events } = strokeWith("early");
    expect(events.some((e) => e.type === "hit" && e.by === 0)).toBe(false);
    expect(m.getView().call).toMatchObject({ why: "miss", miss: "early", winner: 1 });
  });

  it("drops the swing of a tap that turns into a drag", () => {
    const { m, events } = strokeWith(-0.8, 0.1);
    expect(events.some((e) => e.type === "hit" && e.by === 0)).toBe(false);
    expect(m.getView().call).toMatchObject({ why: "winner", winner: 1 });
  });

  it("tells the player how to serve, then how to play until their first good stroke", () => {
    const m = new Match(3, ["player", "bot"]);
    expect(m.getView().hint).toBe("serve");
    m.step(0.1);
    m.tap(0, 0.1);
    expect(m.getView().hint).toBeNull();
    for (let t = 0.1; t < 1.2; t += DT) m.step(t);
    expect(m.getView().hint).toBe("play");
  });
});
