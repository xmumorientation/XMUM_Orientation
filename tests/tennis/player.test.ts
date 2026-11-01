import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  endPose,
  makePlayer,
  makeRig,
  PLAYER_SCALE,
  playerMaterial,
  playerShadowMaterial,
  posePlayer,
  runLegs,
  servePose,
  splitStep,
  STILL,
  swingPose,
  type Pose,
} from "../../src/components/map3d/tennis/player";

// The tennis players' figure (src/components/map3d/tennis/player.ts, batch T1c): one skinned mesh that follows its
// bones, knees that keep the feet on the court, the run, the split-step and the end poses.

const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const ready: Pose = { ...swingPose(-1, 1), ...STILL };

describe("tennis player", () => {
  it("is one skinned mesh, and one more for its shadow", () => {
    const skinned = (shadow?: THREE.Material) => {
      const meshes: THREE.Mesh[] = [];
      makePlayer("#008cff", playerMaterial(), shadow).rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
      expect(meshes.every((m) => m instanceof THREE.SkinnedMesh)).toBe(true);
      return meshes.length;
    };
    expect(skinned()).toBe(1);
    expect(skinned(playerShadowMaterial())).toBe(2);
  });

  it("draws the racket where the rig says it is, in any pose", () => {
    const { rig } = makePlayer("#008cff", playerMaterial());
    const mesh = rig.root.children.find((o): o is THREE.SkinnedMesh => o instanceof THREE.SkinnedMesh)!;
    const pos = mesh.geometry.getAttribute("position");
    // the strings' middle: a vertex at the sweet spot at rest (the mesh is made life size, then scaled up)
    rig.root.updateMatrixWorld(true);
    const rest = world(rig.sweetSpot).divideScalar(PLAYER_SCALE);
    const v = new THREE.Vector3();
    let at = -1;
    for (let i = 0; i < pos.count && at < 0; i++) if (v.fromBufferAttribute(pos, i).distanceTo(rest) < 1e-5) at = i;
    expect(at).toBeGreaterThanOrEqual(0);

    rig.root.position.set(3, 0, -2);
    rig.root.rotation.y = 0.7;
    for (const pose of [ready, { ...swingPose(-0.3, -1), ...STILL }, { ...servePose(-0.2), ...STILL }, endPose(0.5, true), endPose(1, false)]) {
      posePlayer(rig, pose);
      rig.root.updateMatrixWorld(true);
      const drawn = mesh.applyBoneTransform(at, v.fromBufferAttribute(pos, at)).applyMatrix4(mesh.matrixWorld);
      expect(drawn.distanceTo(world(rig.sweetSpot))).toBeLessThan(1e-4);
    }
  });

  it("keeps the feet on the court as the knees bend", () => {
    const rig = makeRig();
    rig.root.updateMatrixWorld(true);
    // each sole, the shin's length below its knee
    const shin = world(rig.knees[0]).y / PLAYER_SCALE;
    const sole = (i: 0 | 1) => rig.knees[i].localToWorld(new THREE.Vector3(0, -shin, 0));
    for (const crouch of [0.05, 0.12, 0.25]) {
      posePlayer(rig, { ...ready, crouch });
      rig.root.updateMatrixWorld(true);
      for (const i of [0, 1] as const) {
        expect(Math.abs(sole(i).y)).toBeLessThan(0.01);
        // the knee comes forward over the foot
        expect(world(rig.knees[i]).z).toBeGreaterThan(sole(i).z);
      }
    }
  });

  it("bends each knee as its leg swings through, and none standing still", () => {
    expect(runLegs(0.3, 0, 0).knees).toEqual([0, 0]);
    let most: [number, number] = [0, 0];
    for (let t = 0; t < 1; t += 0.01) {
      const { knees } = runLegs(t, 4, 0);
      // never both at once
      expect(Math.min(...knees)).toBe(0);
      most = [Math.max(most[0], knees[0]), Math.max(most[1], knees[1])];
    }
    expect(Math.min(...most)).toBeGreaterThan(0.9);
  });

  it("hops in the split-step just after the other player's hit, and lands low", () => {
    expect(splitStep(ready, -0.01)).toBe(ready);
    expect(splitStep(ready, 0.5)).toBe(ready);
    expect(splitStep(ready, 0.09).bob).toBeGreaterThan(0.05);
    expect(splitStep(ready, 0.3).crouch).toBeGreaterThan(ready.crouch + 0.05);
  });
});
