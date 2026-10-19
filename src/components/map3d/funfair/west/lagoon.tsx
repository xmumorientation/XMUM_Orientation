"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { G, TAU, mat, type V3 } from "../central/kit";
import { LIGHTS, NEON, S, STEEL, bar, circlePts, tube, type WestKit } from "./kit";
import { ISLAND_Y } from "./ground";
import { DECK_Y, ISLAND, LAGOON, PIER, PIER_WALK, RIM_Y, WATER_Y } from "./layout";
import { arch, disposeAll, lamp, tAt, bunting, type Live, type Parts } from "./parts";

// DRAFT: the Neon Pier itself: neon arches over the Pier Walk, a boardwalk pier
// with neon railings out over the lagoon, and a striped lighthouse on its
// island at the end, whose beam sweeps round once the zone is powered.

const LH_BASE = ISLAND_Y;
/** The lighthouse: tower top, lantern middle. */
const TOWER_TOP = LH_BASE + 17.4;
const LANTERN_Y = TOWER_TOP + 1.45;

export function bakeLagoon(p: Parts) {
  // neon arches over the Pier Walk, from the Neon Walk to the lagoon
  const archX = [-44, -33, -22, -11, 0];
  archX.forEach((x, i) => arch(p, x, PIER_WALK.z, PIER_WALK.hw + 0.7, 0.12, 6.6, LIGHTS[i % LIGHTS.length], i));

  // the pier: a plank deck on posts, neon railings, lamps and three arches
  const [x0, x1] = PIER.x;
  const z = PIER.z;
  const hw = PIER.hw;
  const t0 = tAt(x0, z);
  p.frame.box(STEEL.silver, [x0 + 0.5, (RIM_Y + DECK_Y) / 2 - 0.05, z], [1.0, DECK_Y - RIM_Y + 0.1, 2 * hw]);
  for (let x = x0, i = 0; x < x1 - 0.01; x += 1.0, i++) {
    const w = Math.min(1.0, x1 - x);
    p.frame.box(i % 2 ? STEEL.deck : STEEL.wood, [x + w / 2, DECK_Y - 0.07, z], [w * 0.96, 0.14, 2 * hw]);
  }
  for (const s of [-1, 1]) {
    p.frame.box(STEEL.silver, [(x0 + x1) / 2, DECK_Y - 0.3, z + s * (hw - 0.1)], [x1 - x0, 0.32, 0.22]);
    for (let x = x0 + 1.5; x < x1; x += 3.3) bar(p.frame, STEEL.steel, [x, WATER_Y - 0.3, z + s * (hw - 0.3)], [x, DECK_Y - 0.3, z + s * (hw - 0.3)], 0.2, S.tube8);
    // railing: posts, a white mid rail, and the neon top rail
    const posts: V3[] = [];
    for (let x = x0 + 1.2; x <= x1 - 0.4; x += 2.6) posts.push([x, DECK_Y, z + s * (hw - 0.15)]);
    for (const q of posts) bar(p.frame, STEEL.silver, q, [q[0], q[1] + 1.1, q[2]], 0.06, S.tube4);
    const first = posts[0];
    const last = posts[posts.length - 1];
    bar(p.frame, STEEL.white, [first[0], DECK_Y + 0.55, first[2]], [last[0], DECK_Y + 0.55, last[2]], 0.05, S.tube4);
    const rail = posts.map((q) => [q[0], q[1] + 1.12, q[2]] as V3);
    tube(p.light, rail, 0.08, s > 0 ? NEON.cyan : NEON.pink, (i) => t0 + 0.03 + 0.06 * (i / rail.length), 300 + s * 50);
  }
  for (const [x, s] of [
    [x0 + 6, -1],
    [x0 + 14, 1],
    [x0 + 22, -1],
  ] as const)
    lamp(p, x, z + s * (hw - 0.55), DECK_Y, 5.6, s > 0 ? NEON.cyan : NEON.pink);
  [x0 + 3, x0 + 11, x0 + 19].forEach((x, i) => arch(p, x, z, hw + 0.1, DECK_Y, 5.8, [NEON.pink, NEON.lilac, NEON.cyan][i], 10 + i));
  // light pools on the water either side of the pier
  p.pools.push({ x: (x0 + x1) / 2, z: z - 9, r: 12, c: "#ff4fbf" });
  p.pools.push({ x: (x0 + x1) / 2, z: z + 9, r: 12, c: "#3ff0ff" });

  // the lighthouse: a striped tower on a plinth, a gallery with a neon rail, a glass lantern and a pink cap
  const lx = ISLAND.x;
  const lz = ISLAND.z;
  const tl = tAt(lx, lz);
  p.frame.revolve([lx, LH_BASE, lz], [[3.7, 0], [3.7, 1.3], [2.45, 1.3]], 24, (_s, k) => (k === 0 ? STEEL.silver : STEEL.white));
  const bands = 7;
  const rings: [number, number][] = Array.from({ length: bands + 1 }, (_, i) => [2.5 - (0.75 * i) / bands, 1.3 + ((TOWER_TOP - LH_BASE - 1.3) * i) / bands]);
  p.frame.revolve([lx, LH_BASE, lz], rings, 20, (_s, k) => (k % 2 ? STEEL.white : STEEL.pink));
  // a door facing the pier, and little windows up the tower
  p.frame.box("#3b3150", [lx - 2.45, LH_BASE + 2.4, lz], [0.3, 2.0, 1.2]);
  for (let i = 0; i < 3; i++) {
    const y = LH_BASE + 6 + i * 4;
    const r = 2.5 - 0.75 * ((y - LH_BASE - 1.3) / (TOWER_TOP - LH_BASE - 1.3)) + 0.02;
    p.light.add(G.box, mat(lx - r, y, lz, 0.12, 0.9, 0.6), NEON.warm, tl + 0.05 + i * 0.02, 400 + i);
  }
  for (const [y, c] of [
    [LH_BASE + 5.2, NEON.cyan],
    [LH_BASE + 9.6, NEON.lilac],
    [LH_BASE + 14, NEON.cyan],
  ] as const) {
    const r = 2.5 - 0.75 * ((y - LH_BASE - 1.3) / (TOWER_TOP - LH_BASE - 1.3)) + 0.08;
    tube(p.light, circlePts([lx, y, lz], r, 24), 0.09, c, tl + 0.04 + (y - LH_BASE) * 0.004, 420, true);
  }
  p.frame.cyl(STEEL.white, [lx, TOWER_TOP + 0.15, lz], 2.9, 0.3, S.cyl20);
  const gallery = circlePts([lx, TOWER_TOP + 1.2, lz], 2.75, 20);
  for (const q of gallery) bar(p.frame, STEEL.silver, [q[0], TOWER_TOP + 0.3, q[2]], q, 0.05, S.tube4);
  tube(p.light, gallery, 0.07, NEON.yellow, tl + 0.12, 440, true);
  // the lantern: glowing glass (a light), silver mullions, the cap
  p.light.add(S.cyl20, mat(lx, LANTERN_Y, lz, 1.35, 2.2, 1.35), NEON.white, tl + 0.14, -460);
  for (const q of circlePts([lx, 0, lz], 1.42, 8)) bar(p.frame, STEEL.silver, [q[0], TOWER_TOP + 0.3, q[2]], [q[0], TOWER_TOP + 2.6, q[2]], 0.07, S.tube4);
  p.frame.add(S.cone16, mat(lx, TOWER_TOP + 3.4, lz, 1.85, 1.6, 1.85), STEEL.pink);
  p.frame.cyl(STEEL.white, [lx, TOWER_TOP + 2.62, lz], 1.9, 0.12, S.cyl20);
  p.light.add(S.ball, mat(lx, TOWER_TOP + 4.5, lz, 0.38), NEON.pink, tl + 0.15, -470);
  bar(p.frame, STEEL.silver, [lx, TOWER_TOP + 4.2, lz], [lx, TOWER_TOP + 5.6, lz], 0.06, S.tube4);
  // bulbs round the island's edge
  for (const q of circlePts([lx, LH_BASE + 0.15, lz], ISLAND.r - 0.3, p.lite ? 12 : 24)) p.bulbs.add(q, 0.2, NEON.warm, tl + 0.1);
  p.pools.push({ x: lx, z: lz, r: 14, c: "#fff3c8" });
  p.boards.push({ x: x0 - 5, z: z + hw + 0.9, ry: Math.PI });
  void LAGOON;
}

/** The lighthouse's two beams, sweeping round once powered (vertex colours fade them out along their length). */
function beamGeometry() {
  const g = new THREE.ConeGeometry(3.6, 34, 20, 1, true);
  g.translate(0, -17, 0);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // the apex is at x = 0, the open end at x = 34
    const k = Math.max(0, 1 - pos.getX(i) / 34) ** 1.6;
    col.set([k, k * 0.95, k * 0.75], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const back = g.clone().rotateY(Math.PI);
  const merged = mergeGeometries([g, back])!;
  disposeAll([g, back]);
  return merged;
}

export function Lighthouse({ kit, live, night }: { kit: WestKit; live: RefObject<Live>; night: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const a = useRef(0.6);
  const geo = useMemo(beamGeometry, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    const L = live.current;
    if (!L || !ref.current) return;
    a.current += L.dt * L.run * 0.9;
    ref.current.rotation.y = a.current;
    kit.beam.opacity = L.run * (night ? 0.34 : 0.05);
    ref.current.visible = L.run > 0.01;
  });
  return (
    <group ref={ref} position={[ISLAND.x, LANTERN_Y, ISLAND.z]} visible={false}>
      <mesh geometry={geo} material={kit.beam} renderOrder={3} />
    </group>
  );
}
