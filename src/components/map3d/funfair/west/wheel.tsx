"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, G, TAU, mat, type V3 } from "../central/kit";
import { LIGHTS, NEON, S, STEEL, bar, circlePts, tube, type WestKit } from "./kit";
import { PLAZA_Y, WHEEL, WHEEL_R, WHEEL_ROT } from "./layout";
import { STALL_COLORS, STALL_KINDS, disposeAll, frame, lamp, stall, tAt, umbrellaTable, bunting, type Live, type Parts } from "./parts";

// DRAFT: LY3, the Vortexa Eye: a 45 m Ferris wheel, the funfair's landmark,
// ported from funfair-lab/styleA.tsx and brightened for day. Silver-white
// A-frame legs, a turning wheel with pink, cyan and lilac neon, and a glowing
// eye on each end of the axle (it stays still while the wheel turns round it).
// Food stalls stand round the edge of its plaza. In the wheel's own frame the
// wheel is the xy plane and the axle runs along z; the whole ride is turned
// WHEEL_ROT so its face looks at the map's default camera.

/** Hub height, rim radius, and the rims' distance from the wheel's middle plane. */
const H = 24.6;
const R = 20;
const RZ = 1.6;
const DECK = PLAZA_Y + 0.7;
/** The eye on each end of the axle, out in front of the legs. */
const EYE_Z = 4.7;

export function bakeWheel(p: Parts) {
  const [cx, cz] = WHEEL;
  const ry = WHEEL_ROT;
  const f = frame(cx, cz, ry);
  const t0 = tAt(cx, cz);
  const box = (b: Bake, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, t = 0, seed = 0) => {
    const q = f(x, y, z);
    b.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), c, t, seed);
  };
  // the deck: silver, a pink band round it, steps up at the front and the back
  box(p.frame, STEEL.silver, 0, PLAZA_Y + 0.35, 0, 32, 0.7, 13);
  box(p.frame, STEEL.pink, 0, PLAZA_Y + 0.42, 0, 32.1, 0.22, 13.1);
  for (const s of [-1, 1])
    for (let i = 0; i < 2; i++) box(p.frame, STEEL.white, 0, PLAZA_Y + 0.12 + i * 0.23, s * (6.9 + (1 - i) * 0.5), 8, 0.24 + i * 0.23, 0.8 + (1 - i) * 0.2);
  // neon round the deck's top edge, bulbs along its long sides
  const corners = [f(-16, DECK + 0.02, -6.5), f(16, DECK + 0.02, -6.5), f(16, DECK + 0.02, 6.5), f(-16, DECK + 0.02, 6.5)];
  tube(p.light, corners, 0.09, NEON.pink, t0 + 0.02, 0, true, true);
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 22; i++) {
      const q = f(-15.4 + i * 1.4, DECK + 0.2, s * 6.65);
      p.bulbs.add(q, 0.2, i % 2 ? NEON.warm : NEON.pink, t0 + 0.03 + 0.03 * (i / 22));
    }
  }
  // a ticket booth on the deck's front corner
  box(p.frame, STEEL.white, 13.2, DECK + 1.2, 4.6, 2.6, 2.4, 2.2);
  box(p.frame, STEEL.pink, 13.2, DECK + 2.55, 4.6, 3.0, 0.3, 2.6);
  box(p.light, NEON.cyan, 13.2, DECK + 1.5, 5.72, 1.6, 0.7, 0.06, t0 + 0.04, -21);

  // A-frame legs from the deck to the axle, braced; neon strips climb their outer sides
  const legT = (k: number) => t0 + 0.03 + 0.05 * k;
  for (const s of [-1, 1]) {
    const top = f(0, H, s * 3.4);
    for (const sx of [-1, 1]) {
      const foot = f(sx * 12.5, DECK, s * 6.0);
      bar(p.frame, STEEL.white, foot, top, 0.52, S.tube8);
      box(p.frame, STEEL.steel, sx * 12.5, DECK + 0.2, s * 6.0, 2.0, 0.4, 2.0);
      const pts: V3[] = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        pts.push(f(sx * (12.5 * (1 - u) + 0.62), DECK + 0.5 + (H - 2.2 - DECK) * u, s * (6.0 - 2.6 * u + 0.25)));
      }
      tube(p.light, pts, 0.11, s > 0 ? NEON.pink : NEON.lilac, (i) => legT(i / 6), 30 + sx * 7, false, true);
      // bulbs up the outside of each leg
      for (let k = 1; k <= 9; k++) {
        const u = k / 10;
        p.bulbs.add(f(sx * (12.5 * (1 - u) + 0.8), DECK + (H - DECK) * u, s * (6.0 - 2.6 * u - 0.5)), 0.22, k % 2 ? NEON.yellow : NEON.white, legT(u));
      }
    }
    const leg = (sx: number, u: number) => f(sx * 12.5 * (1 - u), DECK + (H - DECK) * u, s * (6.0 - 2.6 * u));
    bar(p.frame, STEEL.silver, leg(-1, 0.3), leg(1, 0.3), 0.26);
    bar(p.frame, STEEL.silver, leg(-1, 0.3), leg(1, 0.62), 0.18);
    bar(p.frame, STEEL.silver, leg(1, 0.3), leg(-1, 0.62), 0.18);
    bar(p.frame, STEEL.silver, leg(-1, 0.62), leg(1, 0.62), 0.2);
  }
  // the axle, and the eye on each end: a silver backing, a cyan iris, a dark pupil, a yellow ring, a pink lid line
  bar(p.frame, STEEL.steel, f(0, H, -EYE_Z + 0.2), f(0, H, EYE_Z - 0.2), 0.8, S.cyl12);
  const tEye = t0 + 0.06;
  for (const s of [-1, 1]) {
    const disc = (b: Bake, c: string, r: number, z: number, t = 0, seed = 0) => {
      const q = f(0, H, z);
      b.add(S.cyl20, mat(q[0], q[1], q[2], r, 0.14, r, ry, Math.PI / 2), c, t, seed);
    };
    disc(p.frame, STEEL.silver, 3.3, s * (EYE_Z - 0.25));
    disc(p.light, NEON.cyan, 2.55, s * EYE_Z, tEye, -40);
    disc(p.frame, "#2b2150", 1.08, s * (EYE_Z + 0.1));
    const hl = f(0.55 * s, H + 0.55, s * (EYE_Z + 0.2));
    p.frame.add(S.ball, mat(hl[0], hl[1], hl[2], 0.32, 0.32, 0.12, ry), STEEL.white);
    tube(p.light, circlePts([0, H, s * (EYE_Z + 0.05)], 2.85, 28, [1, 0, 0], [0, 1, 0]).map((q) => f(q[0], q[1], q[2])), 0.15, NEON.yellow, tEye + 0.02, 41, true);
    // the lids: two arcs meeting at the eye's corners
    for (const up of [1, -1]) {
      const lid: V3[] = [];
      for (let i = 0; i <= 14; i++) {
        const u = -1 + (2 * i) / 14;
        lid.push(f(u * 5.6, H + up * 3.0 * Math.cos((u * Math.PI) / 2), s * (EYE_Z + 0.05)));
      }
      tube(p.light, lid, 0.17, NEON.pink, tEye + 0.03, 50 + up, false, true);
    }
  }

  // food stalls round the plaza's edge, facing in; none in front of the walks or the boarding steps
  const r = WHEEL_R - 4.2;
  let k = 0;
  const angles = Array.from({ length: 12 }, (_, i) => (i / 12) * TAU + 0.26);
  const skip = (a: number) =>
    [0, Math.PI, -Math.PI / 4, (3 * Math.PI) / 4].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.42);
  for (const a of angles) {
    if (skip(a)) continue;
    if (p.lite && k % 2) {
      k++;
      continue;
    }
    const sx = cx + Math.cos(a) * r;
    const sz = cz - Math.sin(a) * r;
    // face the wheel: the counter's local +z points at the centre
    stall(p, sx, sz, PLAZA_Y, a - Math.PI / 2, STALL_COLORS[k % STALL_COLORS.length], STALL_KINDS[k % STALL_KINDS.length]);
    k++;
  }
  // tables between the stalls and the deck
  const tables = p.lite ? [0.9, 2.5, 4.2] : [0.6, 1.25, 1.9, 2.55, 3.9, 4.55, 5.2];
  tables.forEach((a, i) => {
    const tx = cx + Math.cos(a) * (r - 6.2);
    const tz = cz - Math.sin(a) * (r - 6.2);
    umbrellaTable(p, tx, tz, PLAZA_Y, [STEEL.pink, STEEL.cyan, STEEL.lilac, STEEL.yellow][i % 4]);
  });
  // lamps round the plaza with bulb strings between them
  const posts = Array.from({ length: p.lite ? 8 : 12 }, (_, i) => (i / (p.lite ? 8 : 12)) * TAU + 0.13);
  const top = (a: number): V3 => [cx + Math.cos(a) * (WHEEL_R - 0.9), PLAZA_Y + 6.7, cz - Math.sin(a) * (WHEEL_R - 0.9)];
  posts.forEach((a, i) => {
    const q = top(a);
    lamp(p, q[0], q[2], PLAZA_Y, 6.6, i % 2 ? NEON.pink : NEON.cyan);
    bunting(p, q, top(posts[(i + 1) % posts.length]), p.lite ? 6 : 10, 0.9, !p.lite);
  });
  p.boards.push({ x: cx + Math.cos(-Math.PI / 4) * 9.5, z: cz - Math.sin(-Math.PI / 4) * 9.5, ry: -Math.PI / 4 });
  p.pools.push({ x: cx, z: cz, r: WHEEL_R + 4, c: "#ff4fbf" });
  void LIGHTS;
}

/** The turning wheel (rims, spokes, hub, neon, bulbs) in its own frame: origin at the hub. */
function wheelGeometry(lite: boolean) {
  const fr = new Bake();
  const li = new Bake();
  const t0 = tAt(WHEEL[0], WHEEL[1]);
  // the eye opens: the wheel's lights run out from the hub to the rim
  const tr = (r: number) => t0 + 0.08 + 0.2 * (r / R);
  const SPOKES = 24;
  for (const s of [-1, 1]) {
    const z = s * RZ;
    tube(fr, circlePts([0, 0, z], R, 64, [1, 0, 0], [0, 1, 0]), 0.32, STEEL.white, 0, 0, true, false, S.tube8);
    tube(fr, circlePts([0, 0, z], 12.5, 40, [1, 0, 0], [0, 1, 0]), 0.2, STEEL.silver, 0, 0, true);
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      bar(fr, STEEL.silver, [c * 2.0, sn * 2.0, s * 2.1], [c * R, sn * R, z], 0.12, S.tube6);
      // trusses between the inner ring and the rim
      const a2 = ((i + 0.5) / SPOKES) * TAU;
      bar(fr, STEEL.silver, [c * 12.5, sn * 12.5, z], [Math.cos(a2) * R, Math.sin(a2) * R, z], 0.08, S.tube4);
    }
    // neon: pink round the rim, cyan round the inner ring, lilac along every other spoke
    const zf = s * (RZ + 0.36);
    tube(li, circlePts([0, 0, zf], R, lite ? 64 : 96, [1, 0, 0], [0, 1, 0]), 0.13, NEON.pink, tr(R), 60, true);
    tube(li, circlePts([0, 0, s * (RZ + 0.24)], 12.5, 48, [1, 0, 0], [0, 1, 0]), 0.11, NEON.cyan, tr(12.5), 70, true);
    for (let i = 0; i < SPOKES; i += 2) {
      const a = (i / SPOKES) * TAU;
      tube(li, [[Math.cos(a) * 3.2, Math.sin(a) * 3.2, zf], [Math.cos(a) * (R - 0.5), Math.sin(a) * (R - 0.5), zf]], 0.075, NEON.lilac, tr(8), 80 + i);
    }
    // bulbs: round the outside of the rim (chasing), and along the other spokes
    const nRim = lite ? 36 : 64;
    for (let i = 0; i < nRim; i++) {
      const a = (i / nRim) * TAU;
      li.add(G.ico, mat(Math.cos(a) * (R + 0.6), Math.sin(a) * (R + 0.6), z, 0.3), i % 3 === 0 ? NEON.yellow : NEON.warm, tr(R) + 0.01, i);
    }
    for (let i = 1; i < SPOKES; i += lite ? 4 : 2) {
      const a = (i / SPOKES) * TAU;
      for (let j = 0; j < 5; j++) {
        const rr = 4.6 + j * 3.1;
        li.add(G.ico, mat(Math.cos(a) * rr, Math.sin(a) * rr, zf, 0.22), j % 2 ? NEON.cyan : NEON.white, tr(rr), 200 + i * 5 + j);
      }
    }
  }
  // cross bars between the rims, and the hub
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * TAU;
    bar(fr, STEEL.silver, [Math.cos(a) * R, Math.sin(a) * R, -RZ], [Math.cos(a) * R, Math.sin(a) * R, RZ], 0.14, S.tube6);
  }
  fr.add(S.cyl20, mat(0, 0, 0, 2.0, 4.4, 2.0, 0, Math.PI / 2), STEEL.white);
  fr.add(S.cyl20, mat(0, 0, 0, 2.1, 0.5, 2.1, 0, Math.PI / 2), STEEL.pink);
  return { frame: fr.geometry(), light: li.geometry() };
}

/** One gondola, hanging from its pin on the rim (origin): a pink dome roof, a glass band, a white cabin. */
function gondolaGeometry() {
  const b = new Bake();
  bar(b, STEEL.steel, [0, 0, -RZ], [0, 0, RZ], 0.1, S.tube6);
  bar(b, STEEL.silver, [0, 0, 0], [0, -0.95, 0], 0.09, S.tube6);
  b.add(S.domeLo, mat(0, -1.05, 0, 1.3, 0.62, 1.3), STEEL.pink);
  b.add(S.cyl10, mat(0, -1.1, 0, 1.32, 0.16, 1.32), STEEL.white);
  b.add(S.cyl10, mat(0, -1.62, 0, 1.12, 0.88, 1.12), "#cdeff6");
  b.add(S.cyl10, mat(0, -2.52, 0, 1.16, 0.92, 1.16), STEEL.white);
  b.add(G.cyl8, mat(0, -3.05, 0, 1.26, 0.14, 1.26), STEEL.silver);
  return b.geometry();
}

/** The glowing band round each gondola (tinted per gondola). */
function bandGeometry(t: number) {
  const b = new Bake();
  b.add(S.tube8, mat(0, -2.06, 0, 1.2, 0.17, 1.2), "#ffffff", t, -90);
  return b.geometry();
}

const BAND_COLORS = [NEON.pink, NEON.cyan, NEON.lilac, NEON.yellow];
const _o = new THREE.Object3D();

export function VortexaEye({ kit, live, lite }: { kit: WestKit; live: RefObject<Live>; lite: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  const st = useRef({ a: 0.35, s: 0 });
  const n = lite ? 12 : 18;

  const parts = useMemo(() => {
    const geo = wheelGeometry(lite);
    const t0 = tAt(WHEEL[0], WHEEL[1]) + 0.29;
    const gondolas = new THREE.InstancedMesh(gondolaGeometry(), kit.frame, n);
    const bands = new THREE.InstancedMesh(bandGeometry(t0), kit.light, n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      gondolas.setColorAt(i, c.set("#ffffff"));
      bands.setColorAt(i, c.set(BAND_COLORS[i % BAND_COLORS.length]));
    }
    gondolas.castShadow = true;
    gondolas.frustumCulled = false;
    bands.frustumCulled = false;
    return { ...geo, gondolas, bands };
  }, [kit, lite, n]);
  useEffect(
    () => () => disposeAll([parts.frame, parts.light, parts.gondolas.geometry, parts.bands.geometry, parts.gondolas, parts.bands]),
    [parts],
  );

  useFrame(() => {
    const L = live.current;
    if (!L || !wheel.current) return;
    const k = st.current;
    k.a += L.dt * L.run * 0.1;
    k.s += L.dt * L.run;
    wheel.current.rotation.z = k.a;
    for (let i = 0; i < n; i++) {
      const a = k.a + (i / n) * TAU;
      _o.position.set(Math.cos(a) * R, H + Math.sin(a) * R, 0);
      _o.rotation.set(0, 0, 0.035 * L.run * Math.sin(k.s * 0.9 + i * 1.7));
      _o.updateMatrix();
      parts.gondolas.setMatrixAt(i, _o.matrix);
      parts.bands.setMatrixAt(i, _o.matrix);
    }
    parts.gondolas.instanceMatrix.needsUpdate = true;
    parts.bands.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[WHEEL[0], 0, WHEEL[1]]} rotation-y={WHEEL_ROT}>
      <group ref={wheel} position-y={H} rotation-z={0.35}>
        <mesh geometry={parts.frame} material={kit.frame} castShadow receiveShadow />
        <mesh geometry={parts.light} material={kit.light} />
      </group>
      <primitive object={parts.gondolas} />
      <primitive object={parts.bands} />
    </group>
  );
}
