"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type * as THREE from "three";

import { Bake, BULB_COLORS, G, PAINT, TAU, lightBake, mat, smooth, starPoints, type Kit, type V3 } from "./kit";
import { DROP, DROP_R } from "./layout";
import { disposeAll, fenceRing, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY9, the drop tower. A striped toy tower with a star on top; a ring
// of seats climbs slowly, waits, then drops. Zone metres.

/** Top of the tower's column. */
const H = 36;
const BASE = 0.32;
const PLINTH = BASE + 1.6;
/** The seat ring's lowest and highest positions (its floor). */
const LOW = PLINTH + 0.3;
const HIGH = H - 5.5;

export function bakeDrop(p: Parts) {
  const [x, z] = DROP;
  const t0 = tAt(x, z);
  p.paint.cyl(PAINT.cyan, [x, BASE + 0.3, z], 5.6, 0.6, G.cyl8, Math.PI / 8);
  p.paint.cyl(PAINT.navy, [x, BASE + 1.1, z], 4.6, 1.0, G.cyl8, Math.PI / 8);
  // the column: white with coloured bands, yellow rails on the corners
  p.paint.box(PAINT.white, [x, (PLINTH + H) / 2, z], [2.4, H - PLINTH, 2.4]);
  for (let y = PLINTH + 3, i = 0; y < H - 1; y += 4.5, i++) p.paint.box(i % 2 ? PAINT.pink : PAINT.cyan, [x, y, z], [2.62, 1.0, 2.62]);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) p.paint.box(PAINT.yellow, [x + sx * 1.25, (PLINTH + H - 1) / 2, z + sz * 1.25], [0.34, H - 1 - PLINTH, 0.34]);
  // the top: cap, machine house, pyramid roof, ball
  p.paint.box(PAINT.navy, [x, H + 0.7, z], [4.6, 1.4, 4.6]);
  p.paint.box(PAINT.white, [x, H + 2.4, z], [3.2, 2.0, 3.2]);
  p.paint.box(PAINT.pink, [x, H + 2.4, z], [3.3, 0.5, 3.3]);
  p.paint.add(G.cone6, mat(x, H + 4.3, z, 2.6, 1.8, 2.6, Math.PI / 6), PAINT.yellow);
  p.paint.seg(PAINT.white, [x, H + 5, z], [x, H + 6.2, z], 0.25, G.cyl6);
  // neon: a ring round the cap and two crossed stars on top (seen from every side)
  p.neon.add(G.torus, mat(x, H + 0.05, z, 3.15, 2.6, 3.15), PAINT.cyan, t0 + 0.17);
  const star = starPoints(0.46);
  for (const ry of [Math.PI / 4, -Math.PI / 4]) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const pts = star.map(([u, v]) => [x + u * 2.6 * c, H + 8.6 + v * 2.6, z - u * 2.6 * s] as V3);
    for (let i = 0; i < pts.length; i++) p.neon.seg(PAINT.yellow, pts[i], pts[(i + 1) % pts.length], 0.34, G.cyl6, t0 + 0.2);
    p.paint.add(G.star, mat(x, H + 8.6, z, 2.3, 2.3, 0.3, ry + Math.PI / 2), PAINT.yellow);
  }
  // bulbs running up the corners
  let seed = 0;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (let y = PLINTH + 1, j = 0; y < H - 0.5; y += 1.35, j++)
        p.bulbs.add([x + sx * 1.55, y, z + sz * 1.55], 0.2, j % 2 ? BULB_COLORS[1] : "#ffffff", t0 + 0.15 * (y / H), seed++);
  p.bulbs.ring(x, H + 1.5, z, 2.55, 14, 0.22, [BULB_COLORS[0], BULB_COLORS[2]], t0 + 0.16, t0 + 0.18);
  // fence with gaps to the midway path (-z) and the promenade path (-x)
  fenceRing(p, x, z, 9.2, BASE, [Math.PI / 2, Math.PI], PAINT.cyan);
  p.boards.push({ x: x + 3.3, z: z - DROP_R + 2.4, ry: Math.PI / 2 });
  p.pools.push({ x, z, r: DROP_R + 2, c: "#3ff0ff" });
}

/** Where the seat ring is at ride time s (seconds): rest, slow climb, wait, drop, brake. */
function ringY(s: number) {
  const c = s % 12;
  if (c < 1.5) return LOW;
  if (c < 7.5) return LOW + (HIGH - LOW) * smooth(0, 1, (c - 1.5) / 6);
  if (c < 9) return HIGH;
  if (c < 10.1) {
    const f = (c - 9) / 1.1;
    return HIGH - (HIGH - LOW - 1.2) * f * f;
  }
  const f = (c - 10.1) / 1.9;
  return LOW + 1.2 * (1 - smooth(0, 1, f)) + 0.35 * Math.sin(f * Math.PI) * (1 - f);
}

export function DropRing({ kit, live, lite }: { kit: Kit; live: RefObject<Live>; lite: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const s = useRef(0);
  const geo = useMemo(() => {
    const [x, z] = DROP;
    const t0 = tAt(x, z) + 0.12;
    const paint = new Bake();
    const light = lightBake(lite);
    paint.box(PAINT.yellow, [0, 1.1, 0], [3.6, 2.2, 3.6]);
    paint.add(G.cyl8, mat(0, 0.22, 0, 4.4, 0.44, 4.4, Math.PI / 8), PAINT.navy);
    const seats = [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.lilac];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const P = (r: number, y: number): V3 => [Math.cos(a) * r, y, -Math.sin(a) * r];
      const q = P(3.35, 0.75);
      paint.add(G.box, mat(q[0], q[1], q[2], 1.2, 0.4, 1.3, a), seats[i % 4]);
      const b = P(2.75, 1.45);
      paint.add(G.box, mat(b[0], b[1], b[2], 0.35, 1.7, 1.3, a), seats[i % 4]);
      const h = P(3.05, 2.25);
      paint.add(G.box, mat(h[0], h[1], h[2], 0.8, 0.3, 0.9, a), PAINT.navy);
    }
    const n = lite ? 12 : 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      light.add(G.ico, mat(Math.cos(a) * 4.5, 0.25, -Math.sin(a) * 4.5, 0.22), BULB_COLORS[i % 5], t0, i);
    }
    return { paint: paint.geometry(), light: light.geometry() };
  }, [lite]);
  useEffect(() => () => disposeAll([geo.paint, geo.light]), [geo]);

  useFrame(() => {
    const L = live.current;
    if (!L || !ref.current) return;
    // the ride clock only runs while powered; a stopped ride stays where it was
    s.current += L.dt * L.run;
    ref.current.position.y = ringY(s.current);
  });

  return (
    <group position={[DROP[0], 0, DROP[1]]}>
      <group ref={ref} position-y={LOW}>
        <mesh geometry={geo.paint} material={kit.paint} castShadow receiveShadow />
        <mesh geometry={geo.light} material={kit.bulb} />
      </group>
    </group>
  );
}
