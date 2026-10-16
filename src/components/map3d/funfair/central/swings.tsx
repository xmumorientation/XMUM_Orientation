"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, BULB_COLORS, G, PAINT, TAU, mat, starPoints, type Kit, type V3 } from "./kit";
import { SWINGS, SWINGS_R } from "./layout";
import { disposeAll, fenceRing, tAt, type Live, type Parts } from "./parts";

// DRAFT: LY8, the swing ride (chair-o-plane). A striped umbrella on a column;
// when it runs, the top rises, tilts and spins, and the chairs fly out.

const BASE = 0.32;
/** Height of the hub at rest, and how far it rises while running. */
const HUB = 8.6;
const LIFT = 3.6;
/** Where the chains hang from, and their length. */
const HOOK_R = 7.9;
const CHAIN = 6.4;

export function bakeSwings(p: Parts) {
  const [x, z] = SWINGS;
  p.paint.cyl(PAINT.yellow, [x, BASE + 0.45, z], 4.4, 0.9, G.cyl20);
  p.paint.cyl(PAINT.navy, [x, BASE + 1.15, z], 3.0, 0.5, G.cyl20);
  // column: pink and white bands
  const top = HUB - 0.6;
  for (let y = BASE + 1.4, i = 0; y < top; y += 1.6, i++) {
    const h = Math.min(1.6, top - y);
    p.paint.cyl(i % 2 ? PAINT.white : PAINT.pink, [x, y + h / 2, z], 1.0, h, G.cyl12);
  }
  fenceRing(p, x, z, 16.2, BASE, [-Math.PI / 2, Math.PI], PAINT.pink);
  p.boards.push({ x: x + 3.4, z: z + SWINGS_R - 2.4, ry: -Math.PI / 2 });
  p.pools.push({ x, z, r: SWINGS_R + 2, c: "#ff4fbf" });
}

export function SwingTop({ kit, live, lite }: { kit: Kit; live: RefObject<Live>; lite: boolean }) {
  const lift = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const st = useRef({ a: 0, s: 0 });
  const n = lite ? 12 : 16;

  const parts = useMemo(() => {
    const [x, z] = SWINGS;
    const t0 = tAt(x, z) + 0.1;
    const paint = new Bake();
    const light = new Bake();
    paint.cyl(PAINT.navy, [0, -3.1, 0], 0.72, 6.2, G.cyl12);
    paint.cyl(PAINT.navy, [0, 0.2, 0], 1.8, 1.4, G.cyl12);
    // the umbrella: pink and white panels, a yellow and cyan valance with scallops
    paint.revolve([0, 0.9, 0], [[9.0, 0], [7.0, 1.0], [3.8, 2.5], [1.1, 3.4], [0, 3.6]], 24, (s) => (s % 2 ? PAINT.white : PAINT.pink), true);
    paint.revolve([0, 0.9, 0], [[9.05, 0], [9.05, -1.0]], 24, (s) => (s % 2 ? PAINT.cyan : PAINT.yellow), true);
    for (let i = 0; i < 24; i++) {
      const a = ((i + 0.5) / 24) * TAU;
      paint.add(G.pennant, mat(Math.cos(a) * 9.05, -0.1, -Math.sin(a) * 9.05, 2.3, 0.9, 1, a + Math.PI / 2), i % 2 ? PAINT.yellow : PAINT.cyan);
    }
    // spokes under the umbrella, to the chain hooks
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      paint.seg(PAINT.navy, [Math.cos(a) * 1.6, 0.0, -Math.sin(a) * 1.6], [Math.cos(a) * HOOK_R, 0.15, -Math.sin(a) * HOOK_R], 0.22);
    }
    paint.ball(PAINT.pink, [0, 4.9, 0], 0.85, G.ball);
    // lights: a ring under the valance, lines up the panels, a star on top
    const rim = lite ? 24 : 40;
    for (let i = 0; i < rim; i++) {
      const a = (i / rim) * TAU;
      light.add(G.ico, mat(Math.cos(a) * 9.2, -0.15, -Math.sin(a) * 9.2, 0.24), i % 2 ? BULB_COLORS[0] : "#ffffff", t0, i);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      for (let j = 1; j <= 4; j++) {
        const f = j / 5;
        const r = 9.0 * (1 - f) + 0.6 * f;
        const y = 0.9 + 3.6 * (1 - (1 - f) ** 1.6) + 0.25;
        light.add(G.ico, mat(Math.cos(a) * r, y, -Math.sin(a) * r, 0.2), j % 2 ? BULB_COLORS[1] : BULB_COLORS[2], t0 + 0.03 * j, j + i * 5);
      }
    }
    const star = starPoints(0.46);
    for (const ry of [0, Math.PI / 2]) {
      const pts = star.map(([u, v]) => [u * 1.5 * Math.cos(ry), 6.9 + v * 1.5, -u * 1.5 * Math.sin(ry)] as V3);
      for (let i = 0; i < pts.length; i++) light.seg(PAINT.cyan, pts[i], pts[(i + 1) % pts.length], 0.24, G.cyl6, t0 + 0.15);
    }
    light.seg(PAINT.cyan, [0, 5.6, 0], [0, 5.9, 0], 0.2, G.cyl6, t0 + 0.15);

    // one chair: two chains from the hook, seat, back and foot bar (white, tinted per chair)
    const chair = new Bake();
    for (const s of [-0.34, 0.34]) chair.seg("#9a9aa6", [0, 0, s], [0, -CHAIN, s], 0.07);
    chair.box("#ffffff", [0, -CHAIN - 0.12, 0], [0.9, 0.22, 0.86]);
    chair.box("#ffffff", [-0.38, -CHAIN + 0.38, 0], [0.16, 0.9, 0.86]);
    chair.box("#d8d8e0", [0.5, -CHAIN - 0.5, 0], [0.12, 0.12, 0.86]);
    const chairs = new THREE.InstancedMesh(chair.geometry(), kit.paint, n);
    const c = new THREE.Color();
    const colors = [PAINT.cyan, PAINT.yellow, PAINT.pink, PAINT.lilac, PAINT.orange, PAINT.mint];
    for (let i = 0; i < n; i++) chairs.setColorAt(i, c.set(colors[i % colors.length]));
    chairs.castShadow = true;
    chairs.frustumCulled = false;
    return { paint: paint.geometry(), light: light.geometry(), chairs };
  }, [kit, lite, n]);
  useEffect(() => () => disposeAll([parts.paint, parts.light, parts.chairs.geometry, parts.chairs]), [parts]);

  useFrame(() => {
    const L = live.current;
    if (!L || !lift.current || !tilt.current || !spin.current) return;
    const k = st.current;
    k.s += L.dt * L.run;
    // speed and swing-out follow how hard the ride runs
    k.a += L.dt * L.run * 1.15;
    lift.current.position.y = BASE + HUB + LIFT * L.run;
    tilt.current.rotation.x = 0.13 * L.run * Math.sin(k.s * 0.45);
    tilt.current.rotation.z = 0.13 * L.run * Math.cos(k.s * 0.45);
    spin.current.rotation.y = k.a;
    const out = 0.62 * L.run;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      const sway = 0.04 * L.run * Math.sin(k.s * 2.1 + i * 1.3);
      parts.chairs.setMatrixAt(i, mat(Math.cos(a) * HOOK_R, 0.15, -Math.sin(a) * HOOK_R, 1, 1, 1, a, sway, out));
    }
    parts.chairs.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[SWINGS[0], 0, SWINGS[1]]}>
      <group ref={lift} position-y={BASE + HUB}>
        <group ref={tilt}>
          <group ref={spin}>
            <mesh geometry={parts.paint} material={kit.paint} castShadow receiveShadow />
            <mesh geometry={parts.light} material={kit.bulb} />
            <primitive object={parts.chairs} />
          </group>
        </group>
      </group>
    </group>
  );
}

