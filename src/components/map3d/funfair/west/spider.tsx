"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, G, TAU, mat } from "../central/kit";
import { NEON, S, STEEL, bar, circlePts, setInstanceDelay, tube, type WestKit } from "./kit";
import { PIER_WALK, PLAZA_Y, SPIDERS, SPIDER_R } from "./layout";
import { disposeAll, fenceRing, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY7 and LY6, the spider rides: four lattice arms on a turning head
// (like the X-shaped dorm footprint), each with a cluster of four cars at its
// end. Running, the head turns, the arms rise and fall in turn and the
// clusters spin. Both rides share one instanced mesh per part: arms, their
// lights, clusters and their lights (instance delays keep the power-up order).

/** The arms' pivot height, their length, and their rest tilt (cars down for boarding). */
const PIVOT = PLAZA_Y + 5.4;
const L = 9.4;
const REST = -0.24;
const ARMS = 4;
const ARM_COLORS = [NEON.pink, NEON.cyan, NEON.yellow, NEON.lilac];
/** Each ride's accent (head ring, fence). */
const ACCENT = [NEON.cyan, NEON.yellow];
const _m = new THREE.Matrix4();

export function bakeSpiders(p: Parts) {
  SPIDERS.forEach(([x, z], k) => {
    const t0 = tAt(x, z);
    const y0 = PLAZA_Y;
    p.frame.revolve([x, y0, z], [[4.2, 0], [4.2, 0.9], [0, 0.9]], 24, (s, kk) => (kk === 0 ? (s % 2 ? STEEL.pink : STEEL.white) : STEEL.silver));
    tube(p.light, circlePts([x, y0 + 0.92, z], 4.22, 32), 0.08, ACCENT[k], t0 + 0.02, 0, true);
    p.frame.add(S.cyl20, mat(x, (y0 + 0.9 + PIVOT) / 2, z, 0.95, PIVOT - y0 - 0.9, 0.95), STEEL.white);
    p.frame.add(S.cyl20, mat(x, PIVOT, z, 1.9, 1.5, 1.9), STEEL.silver);
    p.frame.add(S.cone16, mat(x, PIVOT + 1.55, z, 1.95, 1.6, 1.95), STEEL.pink);
    tube(p.light, circlePts([x, PIVOT + 0.2, z], 1.95, 24), 0.1, ACCENT[k], t0 + 0.04, 10, true);
    tube(p.light, circlePts([x, PIVOT - 0.55, z], 1.95, 24), 0.1, NEON.pink, t0 + 0.04, 40, true);
    p.light.add(S.ball, mat(x, PIVOT + 2.75, z, 0.5), NEON.yellow, t0 + 0.06, -70);
    // fence, open towards the ride's path: LY7 from the Pier Walk (+z), LY6 from the Neon Walk (-x)
    const gap = k === 0 ? (z < PIER_WALK.z ? -Math.PI / 2 : Math.PI / 2) : Math.PI;
    fenceRing(p, x, z, SPIDER_R - 1.4, y0, [gap], ACCENT[k], t0 + 0.01);
    const ga = gap;
    p.boards.push({ x: x + Math.cos(ga) * (SPIDER_R - 3.4) + Math.sin(ga) * 3, z: z - Math.sin(ga) * (SPIDER_R - 3.4) + Math.cos(ga) * 3, ry: ga });
    p.pools.push({ x, z, r: SPIDER_R + 2, c: k === 0 ? "#3ff0ff" : "#f6ff5a" });
  });
}

/** One arm along +x from the pivot: two chords with zigzag bracing, a clamp at the root and a housing at the end. */
function armGeometry() {
  const b = new Bake();
  const top = (u: number): [number, number, number] => [1.6 + (L - 1.6) * u, 0.45 - 0.3 * u, 0];
  const bot = (u: number): [number, number, number] => [1.6 + (L - 1.6) * u, -0.45 + 0.3 * u, 0];
  bar(b, STEEL.white, top(0), top(1), 0.17, S.tube6);
  bar(b, STEEL.white, bot(0), bot(1), 0.17, S.tube6);
  for (let i = 0; i < 6; i++) bar(b, STEEL.silver, i % 2 ? top(i / 6) : bot(i / 6), i % 2 ? bot((i + 1) / 6) : top((i + 1) / 6), 0.08, S.tube4);
  b.box(STEEL.silver, [1.3, 0, 0], [0.9, 1.3, 0.8]);
  b.box(STEEL.pink, [L, 0, 0], [0.9, 0.7, 0.9]);
  return b.geometry();
}

/** The arm's lights (tinted per arm): a neon tube on its top chord, bulbs under it, a ring round the end. */
function armLightGeometry() {
  const b = new Bake();
  tube(b, [[1.8, 0.66, 0], [L - 0.4, 0.36, 0]], 0.09, "#ffffff", 0.02, 0);
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4;
    b.add(G.ico, mat(1.6 + (L - 1.6) * u, -0.62 + 0.3 * u, 0, 0.19), "#ffffff", 0.02 + 0.02 * u, i * 2);
  }
  b.add(S.tube16, mat(L, 0, 0, 0.62, 0.22, 0.62), "#ffffff", 0.05, -9);
  return b.geometry();
}

/** A cluster of four cars hanging level from the arm's end (origin): a spindle, a cross, and four tubs with canopies. */
function clusterGeometry() {
  const b = new Bake();
  bar(b, STEEL.silver, [0, 0, 0], [0, -1.55, 0], 0.2, S.tube8);
  b.add(G.cyl8, mat(0, -1.55, 0, 0.62, 0.3, 0.62), STEEL.white);
  const cars = [STEEL.pink, STEEL.cyan, STEEL.yellow, STEEL.lilac];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const c = Math.cos(a);
    const s = -Math.sin(a);
    bar(b, STEEL.silver, [0, -1.6, 0], [c * 2.2, -1.6, s * 2.2], 0.11, S.tube6);
    b.add(S.tub, mat(c * 2.2, -2.25, s * 2.2, 0.78, 0.75, 0.78), cars[i]);
    b.add(G.box, mat(c * 1.75, -1.85, s * 1.75, 0.25, 0.75, 0.9, a), STEEL.white);
    b.add(S.domeLo, mat(c * 2.2, -1.2, s * 2.2, 0.85, 0.42, 0.85), cars[(i + 2) % 4]);
    bar(b, STEEL.silver, [c * 1.8, -1.6, s * 1.8], [c * 1.85, -1.2, s * 1.85], 0.05, S.tube4);
  }
  return b.geometry();
}

/** The cluster's lights: a ring round the spindle and a bulb on each canopy. */
function clusterLightGeometry() {
  const b = new Bake();
  b.add(S.tube16, mat(0, -0.5, 0, 0.3, 0.3, 0.3), "#ffffff", 0.07, -12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    b.add(G.ico, mat(Math.cos(a) * 2.2, -0.74, -Math.sin(a) * 2.2, 0.2), "#ffffff", 0.08, 20 + i);
  }
  return b.geometry();
}

export function Spiders({ kit, live }: { kit: WestKit; live: RefObject<Live> }) {
  const st = useRef({ a: [0.3, 1.1], c: [0, 0.7], s: 0 });
  const n = SPIDERS.length * ARMS;

  const parts = useMemo(() => {
    const arms = new THREE.InstancedMesh(armGeometry(), kit.frame, n);
    const armLights = new THREE.InstancedMesh(armLightGeometry(), kit.lightI, n);
    const clusters = new THREE.InstancedMesh(clusterGeometry(), kit.frame, n);
    const clusterLights = new THREE.InstancedMesh(clusterLightGeometry(), kit.lightI, n);
    const c = new THREE.Color();
    const delays: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = SPIDERS[Math.floor(i / ARMS)];
      delays.push(tAt(x, z) + 0.03);
      arms.setColorAt(i, c.set("#ffffff"));
      clusters.setColorAt(i, c.set("#ffffff"));
      armLights.setColorAt(i, c.set(ARM_COLORS[i % ARMS]));
      clusterLights.setColorAt(i, c.set(ARM_COLORS[i % ARMS]));
    }
    setInstanceDelay(armLights, delays);
    setInstanceDelay(clusterLights, delays);
    for (const m of [arms, clusters]) m.castShadow = true;
    for (const m of [arms, armLights, clusters, clusterLights]) m.frustumCulled = false;
    return { arms, armLights, clusters, clusterLights };
  }, [kit, n]);
  useEffect(
    () => () => {
      const list = [parts.arms, parts.armLights, parts.clusters, parts.clusterLights];
      disposeAll(list.map((m) => m.geometry));
      disposeAll(list);
    },
    [parts],
  );

  useFrame(() => {
    const Lv = live.current;
    if (!Lv) return;
    const k = st.current;
    k.s += Lv.dt * Lv.run;
    const m = _m;
    SPIDERS.forEach(([x, z], r) => {
      k.a[r] += Lv.dt * Lv.run * (0.62 + r * 0.06);
      k.c[r] += Lv.dt * Lv.run * 1.5;
      for (let i = 0; i < ARMS; i++) {
        const idx = r * ARMS + i;
        const a = k.a[r] + (i / ARMS) * TAU;
        const tilt = REST + Lv.run * (0.36 + 0.24 * Math.sin(a * 2 + r));
        mat(x, PIVOT, z, 1, 1, 1, a, 0, tilt, m);
        parts.arms.setMatrixAt(idx, m);
        parts.armLights.setMatrixAt(idx, m);
        const ex = x + L * Math.cos(tilt) * Math.cos(a);
        const ey = PIVOT + L * Math.sin(tilt);
        const ez = z - L * Math.cos(tilt) * Math.sin(a);
        mat(ex, ey, ez, 1, 1, 1, k.c[r] + i * 0.8, 0, 0, m);
        parts.clusters.setMatrixAt(idx, m);
        parts.clusterLights.setMatrixAt(idx, m);
      }
    });
    for (const mesh of [parts.arms, parts.armLights, parts.clusters, parts.clusterLights]) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={parts.arms} />
      <primitive object={parts.armLights} />
      <primitive object={parts.clusters} />
      <primitive object={parts.clusterLights} />
    </>
  );
}
