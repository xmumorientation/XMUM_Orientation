"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, G, TAU, mat, type V3 } from "../central/kit";
import { NEON, S, STEEL, bar, circlePts, tube, type WestKit } from "./kit";
import { CAROUSEL, CAROUSEL_R, PLAZA_Y } from "./layout";
import { disposeAll, fenceRing, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY1, the carousel (funfair-lab/styleA.tsx, brightened): a pink and
// white canopy with neon ribs and scalloped bulbs, a mirrored column with a
// lilac neon spiral, glowing poles and pearl horses that bob as it turns.

const PLINTH = PLAZA_Y + 0.5;
/** Platform radius, canopy base height (over the platform), canopy radius and height. */
const PR = 8.6;
const CAN_Y = 7.4;
const CAN_R = 9.3;
const CAN_H = 3.4;
const SIDES = 16;

export function bakeCarousel(p: Parts) {
  const [x, z] = CAROUSEL;
  const t0 = tAt(x, z);
  p.frame.revolve([x, PLAZA_Y, z], [[PR + 1.4, 0], [PR + 1.4, 0.5], [0, 0.5]], 32, (s, k) => (k === 0 ? STEEL.pink : s % 2 ? STEEL.white : STEEL.silver));
  tube(p.light, circlePts([x, PLINTH + 0.03, z], PR + 1.42, 48), 0.08, NEON.cyan, t0 + 0.02, 0, true);
  // the fence, open towards the Neon Walk (+x)
  fenceRing(p, x, z, CAROUSEL_R - 1.4, PLAZA_Y, [0], NEON.lilac, t0 + 0.01);
  p.boards.push({ x: x + CAROUSEL_R - 3.2, z: z - 3.2, ry: 0 });
  p.pools.push({ x, z, r: CAROUSEL_R + 3, c: "#d58cff" });
}

type Slot = { r: number; a: number };

function carouselGeometry(lite: boolean, slots: Slot[]) {
  const [x, z] = CAROUSEL;
  const t0 = tAt(x, z) + 0.05;
  const fr = new Bake();
  const li = new Bake();
  // platform: pink edge, white and lilac wedges
  fr.revolve([0, 0, 0], [[PR, 0], [PR, 0.35], [0, 0.35]], 32, (s, k) => (k === 0 ? STEEL.pink : s % 2 ? STEEL.white : STEEL.lilac));
  // the column: white, mirrored lilac bands, gold caps
  fr.add(S.cyl20, mat(0, 0.35 + CAN_Y / 2, 0, 1.15, CAN_Y, 1.15), STEEL.white);
  for (let i = 0; i < 3; i++) fr.add(S.cyl20, mat(0, 1.6 + i * 2.2, 0, 1.19, 0.9, 1.19), i % 2 ? STEEL.cyan : STEEL.lilac);
  // canopy: pink and white panels, a valance below with scallops
  const y0 = 0.35 + CAN_Y;
  fr.revolve([0, y0, 0], [[CAN_R, 0], [CAN_R * 0.55, CAN_H * 0.55], [0.4, CAN_H]], SIDES, (s) => (s % 2 ? STEEL.white : STEEL.pink), true);
  fr.revolve([0, y0, 0], [[CAN_R, 0], [CAN_R, -1.0]], SIDES, (s) => (s % 2 ? STEEL.yellow : STEEL.pink), true);
  for (let i = 0; i < SIDES; i++) {
    const a = ((i + 0.5) / SIDES) * TAU;
    fr.add(G.pennant, mat(Math.cos(a) * (CAN_R - 0.02), y0 - 1.0, -Math.sin(a) * (CAN_R - 0.02), 3.6, 0.7, 1, a + Math.PI / 2), i % 2 ? STEEL.pink : STEEL.yellow);
  }
  bar(fr, STEEL.silver, [0, y0 + CAN_H - 0.2, 0], [0, y0 + CAN_H + 1.4, 0], 0.12, S.tube6);
  // neon: platform rim, valance rings, canopy ribs, the column's spiral, a yellow ball on top
  tube(li, circlePts([0, 0.37, 0], PR + 0.03, 48), 0.08, NEON.cyan, t0, 0, true);
  tube(li, circlePts([0, y0 + 0.03, 0], CAN_R + 0.06, SIDES), 0.09, NEON.yellow, t0 + 0.04, 50, true, true);
  tube(li, circlePts([0, y0 - 1.0, 0], CAN_R + 0.06, SIDES), 0.08, NEON.cyan, t0 + 0.04, 70, true, true);
  const ring = (r: number, y: number, i: number): V3 => {
    const a = (i / SIDES) * TAU;
    return [Math.cos(a) * r, y, -Math.sin(a) * r];
  };
  for (let i = 0; i < SIDES; i++) {
    const rib = [ring(CAN_R + 0.08, y0 + 0.06, i), ring(CAN_R * 0.55 + 0.08, y0 + CAN_H * 0.55 + 0.06, i), ring(0.45, y0 + CAN_H + 0.05, i)];
    tube(li, rib, 0.075, i % 2 ? NEON.lilac : NEON.pink, t0 + 0.06, 100 + i * 3, false, true);
    for (let j = 1; j <= (lite ? 2 : 4); j++) {
      const u = j / (lite ? 3 : 5);
      const r = CAN_R * (1 - u) + 0.45 * u + 0.2;
      const y = u < 0.55 ? y0 + (CAN_H * 0.55 * u) / 0.55 : y0 + CAN_H * 0.55 + (CAN_H * 0.45 * (u - 0.55)) / 0.45;
      li.add(G.ico, mat(...ring(r, y + 0.22, i), 0.2), NEON.warm, t0 + 0.06 + 0.05 * u, i * 5 + j);
    }
    for (let j = 0; j < (lite ? 1 : 3); j++) {
      const a = ((i + (j + 0.5) / (lite ? 1 : 3)) / SIDES) * TAU;
      li.add(G.ico, mat(Math.cos(a) * (CAN_R + 0.12), y0 - 1.18, -Math.sin(a) * (CAN_R + 0.12), 0.2), j === 1 ? NEON.yellow : NEON.warm, t0 + 0.05, 300 + i * 3 + j);
    }
  }
  const spiral: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const a = u * TAU * 4;
    spiral.push([Math.cos(a) * 1.22, 0.8 + u * (CAN_Y - 1.2), Math.sin(a) * 1.22]);
  }
  tube(li, spiral, 0.06, NEON.lilac, t0 + 0.02, 400);
  li.add(S.ball, mat(0, y0 + CAN_H + 1.7, 0, 0.55), NEON.yellow, t0 + 0.08, -500);
  // glowing poles through the horses (gold and lilac)
  slots.forEach(({ r, a }, i) => {
    const px = Math.cos(a) * r;
    const pz = -Math.sin(a) * r;
    li.add(S.tube6, mat(px, 0.35 + (CAN_Y - 0.4) / 2, pz, 0.07, CAN_Y - 0.4, 0.07), i % 2 ? NEON.lilac : NEON.yellow, t0 + 0.03, -600 - i);
  });
  return { frame: fr.geometry(), light: li.geometry() };
}

/** A horse, facing +x: pearl white with a pink saddle and a lilac mane (tinted per horse). */
function horseGeometry() {
  const b = new Bake();
  b.box(STEEL.pearl, [0, 0, 0], [1.5, 0.5, 0.42]);
  b.add(G.box, mat(0.62, 0.4, 0, 0.32, 0.8, 0.3, 0, 0, -0.5), STEEL.pearl);
  b.add(G.box, mat(0.96, 0.74, 0, 0.62, 0.26, 0.26, 0, 0, -0.35), STEEL.pearl);
  b.add(G.box, mat(0.55, 0.62, 0, 0.36, 0.55, 0.1, 0, 0, -0.5), STEEL.lilac);
  b.box(STEEL.pink, [-0.05, 0.3, 0], [0.55, 0.12, 0.5]);
  for (const zz of [-0.12, 0.12]) {
    b.add(G.box, mat(0.72, -0.45, zz, 0.12, 0.72, 0.12, 0, 0, 0.6), STEEL.pearl);
    b.add(G.box, mat(-0.72, -0.45, zz, 0.12, 0.72, 0.12, 0, 0, -0.6), STEEL.pearl);
  }
  b.add(G.box, mat(-0.88, -0.05, 0, 0.1, 0.55, 0.1, 0, 0, 0.7), STEEL.lilac);
  return b.geometry();
}

const TINTS = ["#ffffff", "#efe4ff", "#ddfbff", "#ffe2f2"];
const _o = new THREE.Object3D();

export function Carousel({ kit, live, lite }: { kit: WestKit; live: RefObject<Live>; lite: boolean }) {
  const spin = useRef<THREE.Group>(null);
  const st = useRef({ a: 0.4, s: 0 });
  const n = lite ? 16 : 24;

  const parts = useMemo(() => {
    const slots: Slot[] = Array.from({ length: n }, (_, i) => ({ r: i % 2 ? 4.6 : 6.9, a: (i / n) * TAU }));
    const geo = carouselGeometry(lite, slots);
    const horses = new THREE.InstancedMesh(horseGeometry(), kit.frame, n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) horses.setColorAt(i, c.set(TINTS[i % TINTS.length]));
    horses.castShadow = true;
    horses.frustumCulled = false;
    return { ...geo, horses, slots };
  }, [kit, lite, n]);
  useEffect(() => () => disposeAll([parts.frame, parts.light, parts.horses.geometry, parts.horses]), [parts]);

  useFrame(() => {
    const L = live.current;
    if (!L || !spin.current) return;
    const k = st.current;
    k.a += L.dt * L.run * 0.5;
    k.s += L.dt * L.run;
    spin.current.rotation.y = k.a;
    parts.slots.forEach(({ r, a }, i) => {
      _o.position.set(Math.cos(a) * r, 2.0 + Math.sin(k.s * 2.4 + i * 1.7) * 0.4 * L.run, -Math.sin(a) * r);
      _o.rotation.set(0, a + Math.PI / 2, Math.sin(k.s * 2.4 + i * 1.7 + 1.2) * 0.08 * L.run);
      _o.updateMatrix();
      parts.horses.setMatrixAt(i, _o.matrix);
    });
    parts.horses.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[CAROUSEL[0], PLINTH, CAROUSEL[1]]}>
      <group ref={spin} rotation-y={0.4}>
        <mesh geometry={parts.frame} material={kit.frame} castShadow receiveShadow />
        <mesh geometry={parts.light} material={kit.light} />
        <primitive object={parts.horses} />
      </group>
    </group>
  );
}
