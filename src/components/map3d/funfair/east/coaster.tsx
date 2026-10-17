"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { Bake, G, TAU, mat, smooth, type V3 } from "../central/kit";
import { S, bar } from "../west/kit";
import { COURT_Y } from "./ground";
import { NEON, PAINT, bulbC, type EastKit } from "./kit";
import { LOOP_C, MAIN, MAIN_X, STATION, STATION_COURT } from "./layout";
import { beads, commit, disposeAll, neonText, newLocal, placeM, tAt, type Live, type Parts } from "./parts";

// DRAFT: D4 and D5, the coaster "VORTEX". The station is on D4's middle: a
// deck under a red and cream striped roof with the VORTEX sign. The train
// leaves east, turns north up the lift hill (over the walk from Central),
// drops, turns west and back south round D5's north arm, rides the loop over
// D5's middle, swings west and runs back south over the walk again, and brakes
// into the station. Red rails on a cream spine and white supports; yellow neon
// and marquee bulbs along both sides light up from the station round the
// circuit. The train (five cars) runs once the zone is on.

/** The loop, ridden heading south (-x), centred on D5's middle; the track steps sideways from z0 to z1 through it. */
const LOOP = { x: LOOP_C[0], y: 10.6, r: 8, z0: LOOP_C[1] + 2, z1: LOOP_C[1] - 2 };

const loopPts = (): V3[] =>
  Array.from({ length: 9 }, (_, i) => {
    const f = i / 8;
    const a = f * TAU;
    return [LOOP.x - LOOP.r * Math.sin(a), LOOP.y - LOOP.r * Math.cos(a), LOOP.z0 + (LOOP.z1 - LOOP.z0) * f] as V3;
  });

const SX = STATION.x;
const [SZ0, SZ1] = STATION.z;

/** The circuit's control points, in travel order (a closed centripetal Catmull-Rom curve through them). */
const CTRL: V3[] = [
  // 0-2: the station, heading east
  [SX, 1.4, SZ0 + 2],
  [SX, 1.4, SZ0 + 12],
  [SX, 1.4, SZ1 - 1],
  // 3-4: the turn north
  [SX + 4.1, 1.5, -50],
  [SX + 14, 1.7, -46],
  // 5-9: the lift hill, over the walk from Central
  [-26, 4.5, -46],
  [-14, 12, -46],
  [-3, 19.5, -46],
  [5, 24.5, -46],
  [11, 25, -46],
  // 10-12: the first drop
  [17, 19, -46],
  [23, 9, -46],
  [29, 3.2, -46],
  // 13-18: the turn west and back south, round D5's north arm, to the loop
  [34, 3.8, -46.2],
  [40, 5.4, -48.5],
  [42.5, 6.4, -54.5],
  [40, 6, -60.5],
  [34, 4.6, LOOP.z0],
  [LOOP.x + 7.8, 3.2, LOOP.z0],
  // 19-27: the loop over D5's middle
  ...loopPts(),
  // 28-35: the swing west, then south over the walk again
  [LOOP.x - 6.2, 3.1, LOOP.z1 - 1.1],
  [9.6, 4, -73],
  [10.4, 5.2, -80],
  [10.6, 6.6, -88],
  [8.6, 7.6, -95.5],
  [2.6, 8.2, -100.8],
  [-6, 8.2, -102],
  [-13, 6.5, -102],
  // 36-40: the brakes and the turn into the station
  [-23, 3, -102],
  [-33, 1.6, -102],
  [-41, 1.4, -102],
  [SX + 2.6, 1.4, -99.4],
  [SX, 1.4, -93],
];
const LOOP_K: [number, number] = [19, 27];
const LIFT_K: [number, number] = [4, 9];
const BRAKE_K = 36;
/** The turn round D5's north arm, lit cyan. */
const TURN_K: [number, number] = [12, 18];

const curve = new THREE.CatmullRomCurve3(
  CTRL.map((q) => new THREE.Vector3(q[0], q[1], q[2])),
  true,
  "centripetal",
);
curve.arcLengthDivisions = 2000;
const LEN = curve.getLength();

/** Kinds of track: plain, station, lift, brakes, loop. */
const K_PLAIN = 0;
const K_STATION = 1;
const K_LIFT = 2;
const K_BRAKE = 3;
const K_LOOP = 4;

type Track = { n: number; pos: Float32Array; tan: Float32Array; up: Float32Array; side: Float32Array; kind: Uint8Array; speed: Float32Array };

function makeTrack(n: number): Track {
  const pos = new Float32Array(n * 3);
  const tan = new Float32Array(n * 3);
  const up = new Float32Array(n * 3);
  const side = new Float32Array(n * 3);
  const kind = new Uint8Array(n);
  const speed = new Float32Array(n);
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const U = new THREE.Vector3();
  const B = new THREE.Vector3();
  const K = CTRL.length;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const t = curve.getUtoTmapping(u, u * LEN);
    curve.getPoint(t, P);
    curve.getTangent(t, T).normalize();
    const k = Math.min(K - 1, Math.floor(t * K));
    const loop = k >= LOOP_K[0] && k < LOOP_K[1];
    // up: the loop's centre inside the loop, the sky elsewhere
    if (loop) U.set(LOOP.x - P.x, LOOP.y - P.y, 0).normalize();
    else U.set(0, 1, 0);
    U.addScaledVector(T, -U.dot(T)).normalize();
    B.crossVectors(T, U).normalize();
    P.toArray(pos, i * 3);
    T.toArray(tan, i * 3);
    U.toArray(up, i * 3);
    B.toArray(side, i * 3);
    kind[i] = loop ? K_LOOP : k >= K - 1 || k <= 2 ? K_STATION : k >= LIFT_K[0] && k < LIFT_K[1] ? K_LIFT : k >= BRAKE_K ? K_BRAKE : K_PLAIN;
  }
  // bank the fast turns into their centre
  const ds = LEN / n;
  const heading = (i: number) => Math.atan2(tan[i * 3 + 2], tan[i * 3]);
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    if (kind[i] !== K_PLAIN || Math.abs(tan[i * 3 + 1]) > 0.6) continue;
    const a = heading((i - 2 + n) % n);
    const b = heading((i + 2) % n);
    const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / (4 * ds);
    const bank = THREE.MathUtils.clamp(-turn * 9, -0.45, 0.45) * smooth(2.2, 4.5, y);
    if (Math.abs(bank) < 1e-3) continue;
    T.fromArray(tan, i * 3);
    U.fromArray(up, i * 3);
    B.fromArray(side, i * 3);
    U.multiplyScalar(Math.cos(bank)).addScaledVector(B, -Math.sin(bank)).normalize();
    B.crossVectors(T, U).normalize();
    U.toArray(up, i * 3);
    B.toArray(side, i * 3);
  }
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    const k = kind[i];
    speed[i] = k === K_STATION ? 3.5 : k === K_LIFT ? 4.5 : k === K_BRAKE ? 6 : THREE.MathUtils.clamp(Math.sqrt(2 * 9.81 * Math.max(0, 26.5 - y)), 5, 22);
  }
  return { n, pos, tan, up, side, kind, speed };
}

const tracks: Partial<Record<"full" | "lite", Track>> = {};
function track(lite: boolean) {
  const key = lite ? "lite" : "full";
  return (tracks[key] ??= makeTrack(lite ? 260 : 380));
}

/** The track's plan, every 3 m (for keeping trees and lamps out from under it). */
const PLAN: [number, number][] = curve.getSpacedPoints(Math.round(LEN / 3)).map((v) => [v.x, v.z]);

/** Distance in plan from (x, z) to the track. */
export function trackDist(x: number, z: number) {
  let d = Infinity;
  for (const [px, pz] of PLAN) d = Math.min(d, Math.hypot(x - px, z - pz));
  return d;
}

/** The station's light threshold; the track lights up from it round the circuit. */
const T_STATION = () => tAt(STATION.x, (STATION.z[0] + STATION.z[1]) / 2);

export function bakeCoaster(p: Parts) {
  const tr = track(p.lite);
  const { n, pos, up, side, kind } = tr;
  const t0 = T_STATION();
  const off = (i: number, s: number, u: number): V3 => {
    const j = (i % n) * 3;
    return [pos[j] + side[j] * s + up[j] * u, pos[j + 1] + side[j + 1] * s + up[j + 1] * u, pos[j + 2] + side[j + 2] * s + up[j + 2] * u];
  };
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    for (const sd of [-0.55, 0.55]) bar(p.frame, PAINT.red, off(i, sd, 0), off(j, sd, 0), 0.11, S.tube4);
    bar(p.frame, PAINT.cream, off(i, 0, -0.5), off(j, 0, -0.5), 0.24, S.tube4);
    if (i % 2 === 0) {
      bar(p.frame, PAINT.gold, off(i, -0.62, -0.12), off(i, 0.62, -0.12), 0.07, S.tube4);
      bar(p.frame, PAINT.gold, off(i, 0, -0.12), off(i, 0, -0.5), 0.07, S.tube4);
      // neon along both sides: yellow, pink through the loop, cyan round the turn before it
      const k = Math.floor(curve.getUtoTmapping(i / n, (i / n) * LEN) * CTRL.length);
      const neon = kind[i] === K_LOOP ? NEON.pink : k >= TURN_K[0] && k < TURN_K[1] ? NEON.cyan : NEON.yellow;
      const ti = t0 + 0.2 * (i / n);
      for (const sd of [-0.74, 0.74]) p.light.seg(neon, off(i, sd, -0.06), off(i + 2, sd, -0.06), 0.05, S.tube4, ti, -900 - i);
    }
    if (i % 3 === 0) for (const sd of [-0.8, 0.8]) p.bulbs.add(off(i, sd, 0.06), 0.14, bulbC(i / 3), t0 + 0.2 * (i / n));
  }
  // supports: white columns (A-frames under the tall parts), none over the walk or in the loop
  const every = Math.max(4, Math.round(n / (LEN / 6.5)));
  for (let i = 0; i < n; i += every) {
    const j = i * 3;
    if (kind[i] === K_LOOP || kind[i] === K_STATION || up[j + 1] < 0.8) continue;
    const top = off(i, 0, -0.6);
    if (top[1] < 1.6 || Math.abs(top[0] - MAIN_X) < MAIN.hw + 2.5) continue;
    bar(p.frame, PAINT.white, top, [top[0], 0, top[2]], 0.2 + top[1] * 0.006, S.tube6);
    p.frame.cyl(PAINT.red, [top[0], 0.2, top[2]], 0.45, 0.4, G.cyl6);
    if (top[1] > 9) {
      const l = Math.hypot(side[j], side[j + 2]) || 1;
      const w = top[1] * 0.24;
      for (const sd of [-1, 1]) {
        const foot: V3 = [top[0] + (side[j] / l) * w * sd, 0, top[2] + (side[j + 2] / l) * w * sd];
        bar(p.frame, PAINT.white, top, foot, 0.15, S.tube6);
        p.frame.cyl(PAINT.red, [foot[0], 0.2, foot[2]], 0.38, 0.4, G.cyl6);
      }
      bar(p.frame, PAINT.red, [top[0] + (side[j] / l) * w * 0.5, top[1] * 0.5, top[2] + (side[j + 2] / l) * w * 0.5], [top[0] - (side[j] / l) * w * 0.5, top[1] * 0.5, top[2] - (side[j + 2] / l) * w * 0.5], 0.1, S.tube4);
    }
  }
  // the loop's supports: an A-frame over its top and columns under its sides
  const lz = (LOOP.z0 + LOOP.z1) / 2;
  const crown: V3 = [LOOP.x, LOOP.y + LOOP.r + 0.6, lz];
  for (const sd of [-1, 1]) {
    bar(p.frame, PAINT.white, crown, [LOOP.x, 0, lz + sd * 8], 0.22, S.tube6);
    p.frame.cyl(PAINT.red, [LOOP.x, 0.2, lz + sd * 8], 0.45, 0.4, G.cyl6);
    const x = LOOP.x + sd * (LOOP.r + 0.55);
    const z = lz - sd * 1;
    bar(p.frame, PAINT.white, [x, LOOP.y, z], [x, 0, z], 0.22, S.tube6);
    p.frame.cyl(PAINT.red, [x, 0.2, z], 0.45, 0.4, G.cyl6);
  }
  bar(p.frame, PAINT.red, [LOOP.x, LOOP.y + LOOP.r + 0.6, lz - 8.2], [LOOP.x, LOOP.y + LOOP.r + 0.6, lz + 8.2], 0.12, S.tube4);
  station(p, t0);
  p.pools.push({ x: LOOP.x, z: lz, r: 14, c: NEON.pink });
}

/** The station: a deck, cream posts, a red and cream striped gable roof with bulbs, and the VORTEX sign on top. */
function station(p: Parts, t0: number) {
  const sx = STATION.x;
  const [z0, z1] = STATION.z;
  const zc = (z0 + z1) / 2;
  p.frame.box(PAINT.deck, [sx, (COURT_Y - 0.05 + 1.0) / 2, zc], [9.5, 1.05 - COURT_Y, z1 - z0]);
  p.frame.box(PAINT.gold, [sx + 4.8, 0.95, zc], [0.12, 0.12, z1 - z0]);
  for (const z of [z0 + 0.4, zc, z1 - 0.4]) for (const s of [-4.4, 4.4]) bar(p.frame, PAINT.cream, [sx + s, 1.0, z], [sx + s, 5.4, z], 0.16, S.tube6);
  const eave = 5.4;
  const ridge = 7.0;
  const n = Math.round((z1 - z0 + 2) / 2);
  const za = z0 - 1;
  const dz = (z1 - z0 + 2) / n;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? PAINT.cream : PAINT.red;
    const a = za + i * dz;
    const b = a + dz;
    p.frame.quad(c, [sx + 5.2, eave, a], [sx, ridge, a], [sx, ridge, b], [sx + 5.2, eave, b], true);
    p.frame.quad(c, [sx - 5.2, eave, b], [sx, ridge, b], [sx, ridge, a], [sx - 5.2, eave, a], true);
  }
  for (const z of [za, za + n * dz]) p.frame.tri(PAINT.red, [sx - 5.2, eave, z], [sx, ridge, z], [sx + 5.2, eave, z], true);
  for (const s of [-5.25, 5.25]) beads(p.bulbs, [[sx + s, eave - 0.15, za], [sx + s, eave - 0.15, za + n * dz]], p.lite ? 2.2 : 1.1, 0.15, t0 - 0.02);
  // the VORTEX sign on the ridge, facing north (+x)
  const l = newLocal(p.lite);
  l.frame.box(PAINT.red, [0, ridge + 1.5, 0], [11, 2.2, 0.3]);
  l.frame.box(PAINT.gold, [0, ridge + 0.38, 0], [11.2, 0.2, 0.42]);
  l.frame.box(PAINT.gold, [0, ridge + 2.62, 0], [11.2, 0.2, 0.42]);
  neonText(l.light, "VORTEX", 1.3, ridge + 0.85, 0.2, 0.08, NEON.yellow, t0 - 0.03, 600);
  beads(l.bulbs, [[-5.4, ridge + 2.85, 0.15], [5.4, ridge + 2.85, 0.15]], 0.6, 0.13, t0 - 0.02);
  commit(p, l, placeM(sx, zc, Math.PI / 2));
  // the queue: a board where the lane from the walk arrives
  p.boards.push({ x: STATION_COURT.x[1] - 1.5, z: -68.5, ry: 0 });
  p.pools.push({ x: sx + 3, z: zc, r: 15, c: NEON.warm });
}

// ---------- the train ----------

const CARS = 5;
const CAR_GAP = 2.8;

/** A car, facing +x (forward), standing on the rails: red with a cream stripe and gold rim, two rows of riders. */
function carGeometry() {
  const b = new Bake();
  b.box(PAINT.iron, [0, 0.32, 0], [2.3, 0.3, 1.1]);
  b.box(PAINT.red, [0, 0.85, 0], [2.4, 0.75, 1.5]);
  b.box(PAINT.cream, [0, 0.98, 0], [2.42, 0.14, 1.52]);
  b.box(PAINT.gold, [0, 1.25, 0], [2.44, 0.08, 1.54]);
  for (const x of [-0.75, 0.35]) b.box(PAINT.redDeep, [x, 1.45, 0], [0.22, 0.55, 1.3]);
  const skin = ["#f1c8a5", "#c48a63", "#8d5a3b", "#e8b48f"];
  let k = 0;
  for (const x of [-0.45, 0.65]) for (const z of [-0.35, 0.35]) b.ball(skin[k++ % 4], [x, 1.62, z], 0.2);
  b.add(G.cone8, mat(1.3, 0.85, 0, 0.55, 0.5, 0.55, 0, 0, -Math.PI / 2), PAINT.gold);
  return b.geometry();
}

/** Its lights: warm bulbs along both sides and a yellow headlamp. */
function carLights(t: number) {
  const b = new Bake();
  let k = 0;
  for (const z of [-0.78, 0.78]) for (const x of [-0.8, 0, 0.8]) b.add(S.bulb, mat(x, 0.7, z, 0.11), NEON.warm, t, k++);
  b.add(S.bulb, mat(1.6, 0.85, 0, 0.17), NEON.yellow, t, -5);
  return b.geometry();
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _u = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Vector3();

/** Position and frame at arc length s (interpolated), into _p/_t/_u/_b. */
function frameAt(tr: Track, s: number) {
  const f = (((s / LEN) % 1) + 1) % 1;
  const x = f * tr.n;
  const i0 = Math.floor(x) % tr.n;
  const i1 = (i0 + 1) % tr.n;
  const w = x - Math.floor(x);
  const lerp = (arr: Float32Array, out: THREE.Vector3) => out.fromArray(arr, i0 * 3).lerp(_q.fromArray(arr, i1 * 3), w);
  lerp(tr.pos, _p);
  lerp(tr.tan, _t).normalize();
  lerp(tr.up, _u);
  _u.addScaledVector(_t, -_u.dot(_t)).normalize();
  _b.crossVectors(_t, _u);
  return Math.floor(x) % tr.n;
}

export function Coaster({ kit, live, lite }: { kit: EastKit; live: RefObject<Live>; lite: boolean }) {
  const parts = useMemo(() => {
    const tr = track(lite);
    const n = lite ? 4 : CARS;
    const cars = new THREE.InstancedMesh(carGeometry(), kit.frame, n);
    const lights = new THREE.InstancedMesh(carLights(T_STATION() + 0.21), kit.light, n);
    cars.castShadow = true;
    cars.frustumCulled = false;
    lights.frustumCulled = false;
    // the train waits in the station: its lead car near the station's east end
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < tr.n; i++) {
      const d = Math.hypot(tr.pos[i * 3] - STATION.x, tr.pos[i * 3 + 2] - (STATION.z[1] - 3));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { tr, cars, lights, n, start: (best / tr.n) * LEN };
  }, [kit, lite]);
  useEffect(() => () => disposeAll([parts.cars.geometry, parts.lights.geometry, parts.cars, parts.lights]), [parts]);
  const st = useRef({ s: parts.start, v: 0, placed: false });

  useFrame(() => {
    const L = live.current;
    if (!L) return;
    const k = st.current;
    const { tr, cars, lights, n } = parts;
    if (L.run > 0.001) {
      const i = frameAt(tr, k.s);
      k.v += (tr.speed[i] * L.run - k.v) * Math.min(1, L.dt * 1.5);
      k.s = (k.s + k.v * L.dt) % LEN;
    } else if (k.placed) return;
    for (let c = 0; c < n; c++) {
      frameAt(tr, k.s - c * CAR_GAP + LEN);
      _m.makeBasis(_t, _u, _b).setPosition(_p.x, _p.y, _p.z);
      cars.setMatrixAt(c, _m);
      lights.setMatrixAt(c, _m);
    }
    cars.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
    k.placed = true;
  });

  return (
    <>
      <primitive object={parts.cars} />
      <primitive object={parts.lights} />
    </>
  );
}
