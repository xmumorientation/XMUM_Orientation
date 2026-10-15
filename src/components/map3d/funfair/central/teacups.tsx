"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, BULB_COLORS, G, PAINT, TAU, mat, type Kit } from "./kit";
import { TEACUPS, TEACUPS_R } from "./layout";
import { bunting, disposeAll, fenceRing, lamp, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY4, the teacups. A big turntable with three small ones, four cups
// on each; everything turns its own way. A giant teapot in the middle, with
// bulb strings from its lid to six lamp posts round the fence.

const BASE = 0.32;
const DECK = BASE + 0.5;
const TABLE_R = 13.6;
const SUB_AT = 8.2;
const SUB_R = 4.6;
const CUP_AT = 2.55;
const TEAPOT_TOP = DECK + 8.6;

export function bakeTeacups(p: Parts) {
  const [x, z] = TEACUPS;
  const t0 = tAt(x, z);
  p.paint.cyl(PAINT.navy, [x, BASE + 0.25, z], 14.6, 0.5, G.cyl48);
  p.neon.add(G.torus, mat(x, DECK - 0.05, z, 14.65, 1.6, 14.65), PAINT.cyan, t0 + 0.05);
  // the teapot: cream with a pink lid and band, spout and handle
  p.paint.cyl(PAINT.lilac, [x, DECK + 0.9, z], 2.8, 1.0, G.cyl12);
  p.paint.ball(PAINT.cream, [x, DECK + 3.9, z], [3.7, 2.9, 3.7], G.ball);
  p.paint.cyl(PAINT.pink, [x, DECK + 3.9, z], 3.62, 0.7, G.cyl20);
  p.paint.cyl(PAINT.pink, [x, DECK + 6.7, z], 2.1, 0.7, G.cyl12);
  p.paint.ball(PAINT.cyan, [x, DECK + 7.5, z], 0.8, G.ball);
  p.paint.seg(PAINT.cream, [x + 3.0, DECK + 3.4, z], [x + 5.8, DECK + 6.1, z], 0.85, G.cyl8);
  p.paint.cyl(PAINT.cream, [x + 6.0, DECK + 6.25, z], 0.62, 0.35, G.cyl8);
  p.paint.add(G.torus, mat(x - 3.9, DECK + 4.1, z, 1.5, 1.8, 1.9, 0, Math.PI / 2), PAINT.cream);
  // dots on the pot
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    p.paint.ball(i % 2 ? PAINT.cyan : PAINT.yellow, [x + Math.cos(a) * 3.35, DECK + 2.8, z - Math.sin(a) * 3.35], 0.5);
  }
  // fence with gaps to the midway (+z) and the promenade (+x); six lamps with strings to the lid
  fenceRing(p, x, z, 17.6, BASE, [-Math.PI / 2, 0], PAINT.lilac);
  const top: [number, number, number] = [x, TEAPOT_TOP, z];
  const posts = [40, 100, 145, 190, 220, 315].map((d) => (d * Math.PI) / 180);
  for (const a of posts) {
    const px = x + Math.cos(a) * 18.8;
    const pz = z - Math.sin(a) * 18.8;
    lamp(p, px, pz, BASE + 7.4, PAINT.navy, BULB_COLORS[2]);
    bunting(p, [px, BASE + 7.5, pz], top, p.lite ? 8 : 13, 0.9, !p.lite);
  }
  p.boards.push({ x: x - 3.4, z: z + TEACUPS_R - 2.4, ry: -Math.PI / 2 });
  p.pools.push({ x, z, r: TEACUPS_R + 2, c: "#c9a2f2" });
}

export function Teacups({ kit, live, lite }: { kit: Kit; live: RefObject<Live>; lite: boolean }) {
  const table = useRef<THREE.Group>(null);
  const st = useRef({ a: 0, b: 0, c: 0 });

  const parts = useMemo(() => {
    const deck = new Bake();
    deck.revolve([0, 0, 0], [[TABLE_R, 0], [TABLE_R, 0.35], [0, 0.35]], 32, (s, k) => (k === 0 ? PAINT.navy : s % 2 ? PAINT.white : PAINT.lilac));
    const sub = new Bake();
    sub.revolve([0, 0, 0], [[SUB_R, 0], [SUB_R, 0.32], [0, 0.32]], 12, (s, k) => (k === 0 ? PAINT.yellow : s % 2 ? PAINT.pink : "#ffd0e8"));
    sub.cyl(PAINT.navy, [0, 0.45, 0], 0.6, 0.3, G.cyl8);
    const subs = new THREE.InstancedMesh(sub.geometry(), kit.paint, 3);
    subs.frustumCulled = false;
    subs.receiveShadow = true;
    // a cup: saucer, cup body, rim, a handle, a wheel in the middle (white, tinted per cup)
    const cup = new Bake();
    cup.cyl("#e6e6ee", [0, 0.1, 0], 1.75, 0.2, G.cyl12);
    cup.add(G.cup, mat(0, 0.95, 0, 1.6, 1.5, 1.6), "#ffffff");
    cup.add(G.torus, mat(0, 1.7, 0, 1.6, 1.0, 1.6), "#ffffff");
    cup.add(G.disc, mat(0, 1.25, 0, 1.45, 1, 1.45), "#7d7a8c");
    cup.add(G.torus, mat(1.75, 1.05, 0, 0.45, 0.7, 0.55, 0, Math.PI / 2), "#ffffff");
    cup.cyl("#d8d8e0", [0, 1.55, 0], 0.12, 0.6, G.cyl6);
    cup.cyl("#ffffff", [0, 1.85, 0], 0.5, 0.12, G.cyl8);
    const n = lite ? 9 : 12;
    const cups = new THREE.InstancedMesh(cup.geometry(), kit.paint, n);
    const c = new THREE.Color();
    const colors = [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.lilac, PAINT.orange, PAINT.mint];
    for (let i = 0; i < n; i++) cups.setColorAt(i, c.set(colors[(i * 5) % colors.length]));
    cups.frustumCulled = false;
    cups.castShadow = true;
    return { deck: deck.geometry(), subs, cups, perSub: n / 3 };
  }, [kit, lite]);
  useEffect(() => () => disposeAll([parts.deck, parts.subs.geometry, parts.cups.geometry]), [parts]);

  useFrame(() => {
    const L = live.current;
    if (!L || !table.current) return;
    const k = st.current;
    k.a += L.dt * L.run * 0.32;
    k.b -= L.dt * L.run * 0.75;
    k.c += L.dt * L.run * 1.6;
    table.current.rotation.y = k.a;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const sx = Math.cos(a) * SUB_AT;
      const sz = -Math.sin(a) * SUB_AT;
      const b = k.b + i;
      parts.subs.setMatrixAt(i, mat(sx, 0.35, sz, 1, 1, 1, b));
      for (let j = 0; j < parts.perSub; j++) {
        const ca = b + (j / parts.perSub) * TAU;
        const idx = i * parts.perSub + j;
        parts.cups.setMatrixAt(idx, mat(sx + Math.cos(ca) * CUP_AT, 0.67, sz - Math.sin(ca) * CUP_AT, 1, 1, 1, k.c * (j % 2 ? 1 : -1.3) + idx));
      }
    }
    parts.subs.instanceMatrix.needsUpdate = true;
    parts.cups.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[TEACUPS[0], DECK, TEACUPS[1]]}>
      <group ref={table}>
        <mesh geometry={parts.deck} material={kit.paint} receiveShadow />
        <primitive object={parts.subs} />
        <primitive object={parts.cups} />
      </group>
    </group>
  );
}
