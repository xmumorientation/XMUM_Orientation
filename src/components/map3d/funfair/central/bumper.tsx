"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, BULB_COLORS, G, PAINT, mat, starPoints, type Kit, type V3 } from "./kit";
import { BUMPER, BUMPER_HX, BUMPER_HZ } from "./layout";
import { disposeAll, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY5, the bumper car pavilion. An open-roofed arena (so the cars show
// from the map): corner towers, a striped roof band round the edge, a sign on
// the midway side, and cars that weave about when powered.

const BASE = 0.32;
const FLOOR = BASE + 0.6;
const HX = BUMPER_HX;
const HZ = BUMPER_HZ;
const BEAM = 8.6;
/** The roof band: outer edge (low) and inner edge (high), measured out from the floor's edge. */
const OUT = 1.4;
const IN = -3.6;
const SIGN_Y = 12.4;

export function bakeBumper(p: Parts) {
  const [x, z] = BUMPER;
  const t0 = tAt(x, z);
  const P = (u: number, y: number, w: number): V3 => [x + u, y, z + w];
  // floor and its rubber rail (open on the midway side for the steps)
  p.paint.box("#4a4563", [x, BASE + 0.3, z], [2 * HX, 0.6, 2 * HZ]);
  for (let i = 0; i < 6; i++) p.paint.box("#58527a", [x - HX + 2.5 + i * 5, FLOOR + 0.01, z], [0.25, 0.02, 2 * HZ - 1.2]);
  const rail = (a: V3, b: V3, n: number) => {
    for (let i = 0; i < n; i++) {
      const f0 = i / n;
      const f1 = (i + 1) / n;
      const q0: V3 = [a[0] + (b[0] - a[0]) * f0, a[1], a[2] + (b[2] - a[2]) * f0];
      const q1: V3 = [a[0] + (b[0] - a[0]) * f1, a[1], a[2] + (b[2] - a[2]) * f1];
      if (Math.abs((q0[0] + q1[0]) / 2 - x) < 2.6 && (q0[2] + q1[2]) / 2 < z) continue;
      p.paint.seg(i % 2 ? PAINT.ink : PAINT.yellow, q0, q1, 0.6);
    }
  };
  const ry = FLOOR + 0.45;
  rail(P(-HX + 0.3, ry, -HZ + 0.3), P(HX - 0.3, ry, -HZ + 0.3), 12);
  rail(P(-HX + 0.3, ry, HZ - 0.3), P(HX - 0.3, ry, HZ - 0.3), 12);
  rail(P(-HX + 0.3, ry, -HZ + 0.3), P(-HX + 0.3, ry, HZ - 0.3), 9);
  rail(P(HX - 0.3, ry, -HZ + 0.3), P(HX - 0.3, ry, HZ - 0.3), 9);
  // steps up from the midway side
  p.paint.box(PAINT.cream, [x, BASE + 0.15, z - HZ - 0.6], [5, 0.3, 1.2]);
  p.paint.box(PAINT.cream, [x, BASE + 0.45, z - HZ - 0.2], [5, 0.3, 0.6]);
  // corner towers and side pillars up to the roof band
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const tx = x + sx * HX;
      const tz = z + sz * HZ;
      p.paint.box(PAINT.white, [tx, (BASE + BEAM + 1.6) / 2, tz], [1.6, BEAM + 1.6 - BASE, 1.6]);
      for (const y of [2.5, 5.2]) p.paint.box(PAINT.cyan, [tx, y, tz], [1.72, 0.8, 1.72]);
      p.paint.add(G.cone8, mat(tx, BEAM + 3.0, tz, 1.5, 2.8, 1.5, Math.PI / 8), PAINT.pink);
      p.bulbs.add([tx, BEAM + 4.7, tz], 0.4, BULB_COLORS[0], t0 + 0.08);
    }
  for (const [u, w] of [
    [0, -HZ],
    [0, HZ],
    [-HX, 0],
    [HX, 0],
  ])
    p.paint.box(PAINT.navy, [x + u, (BASE + BEAM) / 2, z + w], [0.9, BEAM - BASE, 0.9]);
  // perimeter beam
  p.paint.box(PAINT.navy, [x, BEAM, z - HZ], [2 * HX, 0.8, 0.7]);
  p.paint.box(PAINT.navy, [x, BEAM, z + HZ], [2 * HX, 0.8, 0.7]);
  p.paint.box(PAINT.navy, [x - HX, BEAM, z], [0.7, 0.8, 2 * HZ]);
  p.paint.box(PAINT.navy, [x + HX, BEAM, z], [0.7, 0.8, 2 * HZ]);
  // the roof band: four mitred trapezoids, striped pink and white, open in the middle
  const ox = HX + OUT, oz = HZ + OUT, ix = HX + IN, iz = HZ + IN;
  const yo = BEAM + 0.2, yi = BEAM + 2.2;
  const sides: [V3, V3, V3, V3][] = [
    [P(-ox, yo, -oz), P(ox, yo, -oz), P(ix, yi, -iz), P(-ix, yi, -iz)],
    [P(ox, yo, oz), P(-ox, yo, oz), P(-ix, yi, iz), P(ix, yi, iz)],
    [P(-ox, yo, oz), P(-ox, yo, -oz), P(-ix, yi, -iz), P(-ix, yi, iz)],
    [P(ox, yo, -oz), P(ox, yo, oz), P(ix, yi, iz), P(ix, yi, -iz)],
  ];
  const lerp = (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  for (const [a, b, c, d] of sides) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.round(len / 2.2);
    for (let i = 0; i < n; i++) {
      const f0 = i / n;
      const f1 = (i + 1) / n;
      p.paint.quad(i % 2 ? PAINT.white : PAINT.pink, lerp(a, b, f0), lerp(a, b, f1), lerp(d, c, f1), lerp(d, c, f0), true);
      // scallops under the outer edge
      const q = lerp(a, b, (f0 + f1) / 2);
      const ang = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      p.paint.add(G.pennant, mat(q[0], q[1] - 0.02, q[2], 1.9, 0.9, 1, ang), i % 2 ? PAINT.yellow : PAINT.cyan);
    }
    // bulbs along the outer edge
    const m = Math.round(len / (p.lite ? 2.4 : 1.4));
    for (let i = 0; i <= m; i++) {
      const q = lerp(a, b, i / m);
      p.bulbs.add([q[0], q[1] - 0.15, q[2]], 0.2, i % 2 ? BULB_COLORS[0] : BULB_COLORS[2], t0 + 0.04 + (0.08 * i) / m);
    }
  }
  // the ceiling grid (where the cars' poles take their power)
  for (let u = -HX + 4; u <= HX - 4; u += 3.5) p.paint.seg(PAINT.steel, P(u, yi - 0.1, -iz), P(u, yi - 0.1, iz), 0.14);
  for (const w of [-iz / 2, 0, iz / 2]) p.paint.seg(PAINT.steel, P(-ix, yi - 0.1, w), P(ix, yi - 0.1, w), 0.14);
  // the sign over the midway side: navy board, bulb border, neon bolt and stars on both faces
  const sw = 7.5;
  const sh = 1.9;
  const sz0 = z - HZ - 0.2;
  p.paint.box(PAINT.navy, [x, SIGN_Y, sz0], [2 * sw, 2 * sh, 0.5]);
  for (const u of [-5, 5]) p.paint.box(PAINT.navy, [x + u, (BEAM + SIGN_Y - sh) / 2, sz0], [0.5, SIGN_Y - sh - BEAM, 0.5]);
  for (const f of [-1, 1]) {
    const w = sz0 + f * 0.3;
    const bolt: V3[] = [
      [x + 1.0, SIGN_Y + 1.5, w],
      [x - 0.6, SIGN_Y + 0.15, w],
      [x + 0.6, SIGN_Y - 0.15, w],
      [x - 1.0, SIGN_Y - 1.5, w],
    ];
    for (let i = 0; i < 3; i++) p.neon.seg(PAINT.yellow, bolt[i], bolt[i + 1], 0.32, G.cyl6, t0 + 0.1);
    for (const u of [-4.6, 4.6]) {
      const pts = starPoints(0.45).map(([a, b]) => [x + u + a * 1.35, SIGN_Y + b * 1.35, w] as V3);
      for (let i = 0; i < pts.length; i++) p.neon.seg(PAINT.cyan, pts[i], pts[(i + 1) % pts.length], 0.24, G.cyl6, t0 + 0.12);
    }
    const n = p.lite ? 12 : 22;
    const border: V3[] = [
      [x - sw, SIGN_Y - sh, w],
      [x + sw, SIGN_Y - sh, w],
      [x + sw, SIGN_Y + sh, w],
      [x - sw, SIGN_Y + sh, w],
    ];
    for (let s = 0; s < 4; s++) {
      const a = border[s];
      const b = border[(s + 1) % 4];
      const k = s % 2 ? Math.round(n / 4) : n;
      for (let i = 0; i < k; i++) p.bulbs.add(lerp(a, b, i / k), 0.17, i % 2 ? BULB_COLORS[0] : "#ffffff", t0 + 0.1);
    }
  }
  p.boards.push({ x: x + 4.2, z: z - HZ - 3.2, ry: Math.PI / 2 });
  p.pools.push({ x, z, r: HX + 4, c: "#f2ff0b" });
}

type Car = { ax: number; az: number; wx: number; wz: number; px: number; pz: number };

export function BumperCars({ kit, live, lite }: { kit: Kit; live: RefObject<Live>; lite: boolean }) {
  const s = useRef(0);
  const parts = useMemo(() => {
    // a car: rubber skirt, body, nose, seat back, and its pole with a little light (white, tinted per car)
    const car = new Bake();
    car.cyl("#3a3846", [0, 0.25, 0], [1.45, 1.05], 0.5, G.cyl12);
    car.box("#ffffff", [0, 0.72, 0], [2.3, 0.5, 1.6]);
    car.box("#ffffff", [0.8, 1.05, 0], [0.75, 0.3, 1.4]);
    car.box("#ffffff", [-0.62, 1.35, 0], [0.3, 0.9, 1.3]);
    car.cyl("#33303d", [0.2, 1.15, 0], 0.32, 0.12, G.cyl8);
    car.seg("#c8c8d2", [-0.95, 1.0, 0], [-0.95, 3.2, 0], 0.1, G.cyl6);
    car.ball("#ffffff", [-0.95, 3.3, 0], 0.22);
    const n = lite ? 6 : 10;
    const cars = new THREE.InstancedMesh(car.geometry(), kit.paint, n);
    const c = new THREE.Color();
    const colors = [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.lilac, PAINT.orange, PAINT.mint, PAINT.red];
    for (let i = 0; i < n; i++) cars.setColorAt(i, c.set(colors[i % colors.length]));
    cars.frustumCulled = false;
    cars.castShadow = true;
    // each car weaves on its own figure (a Lissajous path) inside the rail
    const paths: Car[] = Array.from({ length: n }, (_, i) => ({
      ax: HX - 2.4,
      az: HZ - 2.2,
      wx: 0.23 + 0.05 * (i % 4),
      wz: 0.31 + 0.04 * ((i * 3) % 5),
      px: i * 1.9,
      pz: i * 0.7 + 0.5,
    }));
    return { cars, paths };
  }, [kit, lite]);
  useEffect(() => () => disposeAll([parts.cars.geometry]), [parts]);

  useFrame(() => {
    const L = live.current;
    if (!L) return;
    s.current += L.dt * L.run;
    const t = s.current + 3;
    parts.paths.forEach((c, i) => {
      const x = c.ax * Math.sin(c.wx * t + c.px);
      const z = c.az * Math.sin(c.wz * t + c.pz);
      const vx = c.ax * c.wx * Math.cos(c.wx * t + c.px);
      const vz = c.az * c.wz * Math.cos(c.wz * t + c.pz);
      const wob = 0.25 * Math.sin(t * 3.1 + i);
      parts.cars.setMatrixAt(i, mat(x, 0, z, 1, 1, 1, Math.atan2(-vz, vx) + wob));
    });
    parts.cars.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[BUMPER[0], FLOOR, BUMPER[1]]}>
      <primitive object={parts.cars} />
    </group>
  );
}
