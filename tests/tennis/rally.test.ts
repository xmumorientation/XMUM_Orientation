import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { COURT } from "../../src/components/map3d/tennis/court";
import { makeRig, posePlayer } from "../../src/components/map3d/tennis/player";
import { rallyAt, SHOT_S } from "../../src/components/map3d/tennis/rally";

// The tennis courts' looping rally (src/components/map3d/tennis/rally.ts): the ball meets the racket as drawn,
// clears the net and bounces in.

const SEED = 17;
const SHOTS = 200;

describe("tennis rally", () => {
  it("meets the hitter's racket at every contact", () => {
    const rig = makeRig();
    for (let k = -4; k < SHOTS; k++) {
      const f = rallyAt(k * SHOT_S, SEED);
      const p = f.players[k & 1];
      rig.root.position.set(p.x, 0, p.z);
      rig.root.rotation.y = p.yaw;
      posePlayer(rig, p.pose);
      rig.root.updateMatrixWorld(true);
      const racket = rig.sweetSpot.getWorldPosition(new THREE.Vector3());
      expect(racket.distanceTo(new THREE.Vector3(...f.ball))).toBeLessThan(0.05);
    }
  });

  it("clears the net and bounces inside the receiver's singles court", () => {
    const step = SHOT_S / 400;
    for (let k = 0; k < SHOTS; k++) {
      let last = rallyAt(k * SHOT_S, SEED).ball;
      let bounces = 0;
      for (let t = k * SHOT_S + step; t < (k + 1) * SHOT_S - 1e-9; t += step) {
        const b = rallyAt(t, SEED).ball;
        if (Math.sign(b[0]) !== Math.sign(last[0])) expect(Math.max(b[1], last[1])).toBeGreaterThan(COURT.netTop);
        if (b[1] < 0.02) {
          bounces++;
          // the receiver's half: player 1 (+x) receives even shots
          expect(b[0] * (k % 2 === 0 ? 1 : -1)).toBeGreaterThan(0);
          expect(Math.abs(b[0])).toBeLessThan(COURT.halfL);
          expect(Math.abs(b[2])).toBeLessThan(COURT.halfW);
        }
        expect(b[1]).toBeGreaterThan(-1e-6);
        last = b;
      }
      expect(bounces).toBeGreaterThan(0);
    }
  });

  it("is the same for the same time and seed", () => {
    expect(rallyAt(12.34, SEED)).toEqual(rallyAt(12.34, SEED));
    expect(rallyAt(12.34, SEED).ball).not.toEqual(rallyAt(12.34, SEED + 1).ball);
  });
});
