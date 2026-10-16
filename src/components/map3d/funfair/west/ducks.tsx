"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, G, TAU, mat } from "../central/kit";
import { RAILS } from "./booths";
import { S, STEEL, type WestKit } from "./kit";
import { LAGOON, WATER_Y } from "./layout";
import { disposeAll, type Live } from "./parts";

// DRAFT: the crowned ducks, like the one on the lake: the duck shoot's targets
// sliding along their rails, and duck boats paddling round the lagoon. One
// instanced mesh for all of them (a target is 0.7 m long, a boat 4 m).

const GOLD = "#f2b33d";

/** One duck facing +x, about 0.95 long and 0.85 tall, floating at y = 0. */
function duckGeometry() {
  const b = new Bake();
  b.ball(STEEL.white, [0, 0.26, 0], [0.42, 0.26, 0.27], S.ball);
  b.add(G.cone6, mat(-0.42, 0.36, 0, 0.1, 0.24, 0.1, 0, 0, Math.PI / 2 + 0.6), STEEL.white);
  b.ball("#f1f1f7", [-0.02, 0.33, 0.25], [0.24, 0.1, 0.05]);
  b.ball("#f1f1f7", [-0.02, 0.33, -0.25], [0.24, 0.1, 0.05]);
  b.ball(STEEL.white, [0.28, 0.6, 0], 0.17);
  b.add(G.cone6, mat(0.48, 0.57, 0, 0.07, 0.18, 0.055, 0, 0, -Math.PI / 2), STEEL.orange);
  b.add(S.bulb, mat(0.41, 0.64, 0.1, 0.03), "#1b1b22");
  b.add(S.bulb, mat(0.41, 0.64, -0.1, 0.03), "#1b1b22");
  b.add(G.cyl6, mat(0.27, 0.79, 0, 0.1, 0.08, 0.1), GOLD);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.add(S.bulb, mat(0.27 + Math.cos(a) * 0.08, 0.87, Math.sin(a) * 0.08, 0.03, 0.06, 0.03), GOLD);
  }
  return b.geometry();
}

/** The duck boats' two loops in the lagoon, either side of the pier: centre x, z and radii. */
const LOOPS: [number, number, number, number][] = [
  [LAGOON.x - 2, LAGOON.z - 17, 10, 8],
  [LAGOON.x - 2, LAGOON.z + 17, 10, 8],
];
const SPAN = RAILS[0].z[1] - RAILS[0].z[0];

export function Ducks({ kit, live, lite }: { kit: WestKit; live: RefObject<Live>; lite: boolean }) {
  const st = useRef({ s: 0, b: 0 });
  const perRail = lite ? 6 : 10;
  const perLoop = lite ? 2 : 3;
  const n = perRail * RAILS.length + perLoop * LOOPS.length;

  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(duckGeometry(), kit.frame, n);
    const c = new THREE.Color("#ffffff");
    for (let i = 0; i < n; i++) m.setColorAt(i, c);
    m.frustumCulled = false;
    return m;
  }, [kit, n]);
  useEffect(() => () => disposeAll([mesh.geometry, mesh]), [mesh]);

  useFrame(() => {
    const L = live.current;
    if (!L) return;
    const k = st.current;
    k.s += L.dt * L.run * 1.1;
    k.b += L.dt * L.run;
    const m = mesh;
    const tmp = _m;
    let i = 0;
    RAILS.forEach((r, ri) => {
      const dir = ri === 0 ? 1 : -1;
      for (let j = 0; j < perRail; j++) {
        const u = (((k.s + (j * SPAN) / perRail) % SPAN) + SPAN) % SPAN;
        const z = dir > 0 ? r.z[0] + u : r.z[1] - u;
        // pop in and out at the ends of the rail
        const sc = 0.72 * Math.min(1, u / 0.5, (SPAN - u) / 0.5);
        const bob = 0.04 * Math.sin(k.b * 6 + j) * L.run;
        m.setMatrixAt(i++, mat(r.x, r.y + bob, z, sc, sc, sc, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0, tmp));
      }
    });
    LOOPS.forEach(([cx, cz, rx, rz], li) => {
      for (let j = 0; j < perLoop; j++) {
        const a = k.s * 0.05 * (li ? -1 : 1) + (j / perLoop) * TAU + li;
        const dx = -rx * Math.sin(a) * (li ? -1 : 1);
        const dz = rz * Math.cos(a) * (li ? -1 : 1);
        const bob = 0.08 * Math.sin(k.b * 1.3 + j * 2) * L.run;
        m.setMatrixAt(
          i++,
          mat(cx + rx * Math.cos(a), WATER_Y - 0.15 + bob, cz + rz * Math.sin(a), 4.2, 4.2, 4.2, Math.atan2(-dz, dx), 0, bob * 0.3, tmp),
        );
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

const _m = new THREE.Matrix4();
