import type * as THREE from "three";

import { Bake, Bulbs, G, TAU, mat, type V3 } from "../central/kit";
import { LIGHTS, NEON, STEEL, S, bar, tube } from "./kit";
import { POWER_BOX } from "./layout";

// DRAFT: what the West zone's static build collects, and small helpers shared
// by the rides and the decoration. All in zone metres.

/** A "closed" board (it reads "open" once the zone is powered): position, facing (0 faces +x). */
export type Board = { x: number; z: number; ry: number };
/** A soft light pool on the ground (or the water): centre, radius, colour. */
export type Pool = { x: number; z: number; r: number; c: string };

export type Parts = {
  lite: boolean;
  /** Ground: never fades. */
  paving: Bake;
  /** The lagoon's water. */
  water: Bake;
  /** Steel and paint: the paint loses its colour while the zone is off. */
  frame: Bake;
  /** Neon tubes and baked bulbs (one light material; see kit.ts). */
  light: Bake;
  /** Instanced bulbs (lite: every other one). */
  bulbs: Bulbs;
  boards: Board[];
  pools: Pool[];
};

export function newParts(lite: boolean): Parts {
  return {
    lite,
    paving: new Bake(),
    water: new Bake(),
    frame: new Bake(),
    light: new Bake(),
    bulbs: new Bulbs(lite ? 2 : 1),
    boards: [],
    pools: [],
  };
}

/** Farthest point of the zone from the power box (metres). */
const REACH = 160;

/**
 * When a light at (x, z) switches on during the power-up (0..1 of the ramp): the current runs out from the power
 * box, so nearer lights come on first. `extra` delays a piece along its own ride (for example up the wheel).
 */
export function tAt(x: number, z: number, extra = 0) {
  const d = Math.hypot(x - POWER_BOX[0], z - POWER_BOX[1]);
  return Math.min(0.97, 0.1 + 0.62 * Math.min(1, d / REACH) + extra);
}

/** Pieces of something turned `ry` about a centre: local [x, y, z] → zone metres (local +x is its front at ry 0). */
export function frame(cx: number, cz: number, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return (x: number, y: number, z: number): V3 => [cx + x * c + z * s, y, cz - x * s + z * c];
}

/** A lamp post: silver pole on a foot, a pink neon ring, a warm globe on top. */
export function lamp(p: Parts, x: number, z: number, y0: number, h = 6.6, ring: string = NEON.pink) {
  p.frame.cyl(STEEL.steel, [x, y0 + 0.3, z], 0.36, 0.6, G.cyl6);
  bar(p.frame, STEEL.white, [x, y0 + 0.6, z], [x, y0 + h - 0.2, z], 0.14, S.tube6);
  p.frame.cyl(STEEL.silver, [x, y0 + h - 0.15, z], 0.3, 0.2, G.cyl6);
  const t = tAt(x, z);
  p.light.add(S.tube8, mat(x, y0 + h - 1.2, z, 0.2, 0.55, 0.2), ring, t, -7);
  p.bulbs.add([x, y0 + h + 0.22, z], 0.4, NEON.warm, t);
}

/** A bulb string from a to b (sagging), with pennants under it when `flags` (paint: only by day). */
export function bunting(p: Parts, a: V3, b: V3, n: number, sag: number, flags = true, colors: string[] = LIGHTS) {
  p.bulbs.string(a, b, n, sag, 0.19, colors, tAt(a[0], a[2]), tAt(b[0], b[2]));
  if (!flags) return;
  const ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  const m = Math.max(2, Math.round(n * 0.6));
  const paint = [STEEL.pink, STEEL.cyan, STEEL.yellow, STEEL.lilac, STEEL.white];
  for (let i = 1; i < m; i++) {
    const f = i / m;
    const y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f) - 0.25;
    p.frame.add(G.pennant, mat(a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f, 0.85, 0.85, 0.85, ry), paint[i % 5]);
  }
}

/** A low ring fence: silver posts, a white rail and a neon top rail; gaps at the given angles (0 = +x, turning to -z). */
export function fenceRing(p: Parts, cx: number, cz: number, r: number, y: number, gaps: number[], neon: string, t: number, gap = 0.3) {
  const n = Math.max(12, Math.round((TAU * r) / 2.6));
  const inGap = (a: number) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap);
  const pt = (a: number, h: number): V3 => [cx + Math.cos(a) * r, y + h, cz - Math.sin(a) * r];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    if (inGap(a0)) continue;
    bar(p.frame, STEEL.silver, pt(a0, 0), pt(a0, 1.15), 0.07, S.tube4);
    if (inGap(a1)) continue;
    bar(p.frame, STEEL.white, pt(a0, 0.55), pt(a1, 0.55), 0.05, S.tube4);
    tube(p.light, [pt(a0, 1.15), pt(a1, 1.15)], 0.07, neon, t, i, false, false, S.tube4);
  }
}

/** A round tree: a short trunk and two stacked crowns. */
export function tree(p: Parts, x: number, z: number, y0: number, s: number, kind: number) {
  p.frame.cyl(STEEL.trunk, [x, y0 + 0.9 * s, z], 0.32 * s, 1.8 * s, G.cyl6);
  if (kind % 3 === 0) {
    p.frame.add(G.cone8, mat(x, y0 + 3.2 * s, z, 2.1 * s, 3.4 * s, 2.1 * s, kind), STEEL.leafDark);
    p.frame.add(G.cone8, mat(x, y0 + 4.9 * s, z, 1.5 * s, 2.6 * s, 1.5 * s, kind), STEEL.leaf);
  } else {
    p.frame.ball(kind % 3 === 1 ? STEEL.leaf : STEEL.leafDark, [x, y0 + 3.1 * s, z], [2.0 * s, 1.8 * s, 2.0 * s]);
    p.frame.ball(STEEL.leaf, [x + 0.4 * s, y0 + 4.3 * s, z - 0.3 * s], [1.3 * s, 1.2 * s, 1.3 * s]);
  }
}

/** A palm tree, bending a little; with `neon`, two glowing rings round its trunk (the pier's look at night). */
export function palm(p: Parts, x: number, z: number, y0: number, s: number, k: number, neon: string | null) {
  const lean = 0.9 * s;
  const dir = k * 2.39;
  const dx = Math.cos(dir);
  const dz = Math.sin(dir);
  const H = 8.5 * s;
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) {
    const f = i / 5;
    pts.push([x + dx * lean * f * f, y0 + H * f, z + dz * lean * f * f]);
  }
  for (let i = 0; i < 5; i++) {
    const r = (0.36 - i * 0.04) * s;
    bar(p.frame, STEEL.trunk, pts[i], pts[i + 1], r, S.tube6);
  }
  const top = pts[5];
  for (let i = 0; i < 7; i++) {
    const a = dir + (i / 7) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const mid: V3 = [top[0] + ca * 2.2 * s, top[1] + 0.5 * s, top[2] + sa * 2.2 * s];
    const tip: V3 = [top[0] + ca * 4.2 * s, top[1] - 1.1 * s, top[2] + sa * 4.2 * s];
    const w = 0.75 * s;
    const side: V3 = [-sa * w, 0, ca * w];
    const col = i % 2 ? STEEL.palm : STEEL.leafDark;
    p.frame.tri(col, top, [mid[0] + side[0], mid[1], mid[2] + side[2]], [mid[0] - side[0], mid[1], mid[2] - side[2]], true);
    p.frame.tri(col, [mid[0] + side[0], mid[1], mid[2] + side[2]], tip, [mid[0] - side[0], mid[1], mid[2] - side[2]], true);
  }
  p.frame.add(S.bulb, mat(top[0], top[1] - 0.3 * s, top[2], 0.45 * s), STEEL.trunk);
  if (!neon) return;
  const t = tAt(x, z);
  for (const i of [2, 3]) {
    const q = pts[i];
    const r = (0.36 - i * 0.04) * s + 0.05;
    p.light.add(S.tube8, mat(q[0], q[1], q[2], r, 0.4 * s, r), neon, t + i * 0.02, -3 - k);
  }
}

/** A bench along local z, facing local +x. */
export function bench(p: Parts, x: number, z: number, y: number, ry: number) {
  const f = frame(x, z, ry);
  const seat = f(0, y + 0.45, 0);
  p.frame.add(G.box, mat(seat[0], seat[1], seat[2], 0.6, 0.12, 2.2, ry), STEEL.wood);
  const back = f(-0.28, y + 0.85, 0);
  p.frame.add(G.box, mat(back[0], back[1], back[2], 0.1, 0.5, 2.2, ry), STEEL.wood);
  for (const s of [-0.9, 0.9]) {
    const q = f(0, y + 0.22, s);
    p.frame.add(G.box, mat(q[0], q[1], q[2], 0.5, 0.44, 0.1, ry), STEEL.steel);
  }
}

/**
 * A neon arch over a walk: two silver posts and a round top, neon running up one post, over and down the other,
 * bulbs under it. It spans local z (`half` either side of the centre), turned `ry` (0 spans z, π/2 spans x).
 */
export function arch(p: Parts, x: number, z: number, half: number, y0: number, h: number, neon: string, k: number, ry = 0) {
  const f = frame(x, z, ry);
  const t = tAt(x, z);
  const yc = y0 + h - half;
  const local: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    local.push([yc + Math.sin(a) * half, -Math.cos(a) * half]);
  }
  for (const s of [-1, 1]) {
    bar(p.frame, STEEL.white, f(0, y0, s * half), f(0, yc, s * half), 0.2, S.tube8);
    p.frame.cyl(STEEL.steel, f(0, y0 + 0.25, s * half), 0.42, 0.5, G.cyl6);
  }
  tube(p.frame, local.map(([y, v]) => f(0, y, v)), 0.2, STEEL.white, 0, 0, false, false, S.tube6);
  const neonPts: V3[] = [f(0.24, y0 + 0.6, -half), ...local.map(([y, v]) => f(0.24, y, v)), f(0.24, y0 + 0.6, half)];
  tube(p.light, neonPts, 0.1, neon, (i) => t + 0.05 * (i / neonPts.length), 200 + k * 20, false, false);
  for (let i = 1; i < 16; i += p.lite ? 3 : 2) {
    const [y, v] = local[i];
    const l = Math.hypot(v, y - yc) || 1;
    p.bulbs.add(f(-0.1, y - ((y - yc) / l) * 0.45, v - (v / l) * 0.45), 0.18, i % 4 === 1 ? NEON.white : neon, t + 0.03);
  }
}

/** What stands on a stall's roof. */
export type StallKind = "ice" | "drink" | "donut" | "candy" | "prize";
export const STALL_KINDS: StallKind[] = ["ice", "drink", "donut", "candy", "prize"];
/** Stall paint, each with its neon. */
export const STALL_COLORS: [string, string][] = [
  [STEEL.pink, NEON.pink],
  [STEEL.cyan, NEON.cyan],
  [STEEL.lilac, NEON.lilac],
  [STEEL.yellow, NEON.yellow],
  [STEEL.orange, NEON.orange],
];

/**
 * A neon-pier stall 3.6 m wide: a painted booth with a white counter, silver posts and roof, a striped awning, a
 * glowing sign box and a topper. Its counter faces local +z, turned `ry` (0 faces +z, π faces -z, π/2 faces +x).
 */
export function stall(p: Parts, x: number, z: number, y0: number, ry: number, color: [string, string], kind: StallKind) {
  const f = frame(x, z, ry);
  const [paint, neon] = color;
  const box = (col: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
    const q = f(cx, y0 + cy, cz);
    p.frame.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), col);
  };
  const t = tAt(x, z);
  box(paint, 0, 1.3, -0.55, 3.6, 2.6, 1.5);
  box(STEEL.white, 0, 0.55, 0.65, 3.6, 1.1, 1.0);
  box(paint, 0, 1.15, 0.65, 3.7, 0.12, 1.1);
  for (const sx of [-1.72, 1.72]) box(STEEL.silver, sx, 1.7, 1.08, 0.14, 2.4, 0.14);
  box(STEEL.silver, 0, 2.95, -0.05, 3.9, 0.18, 2.6);
  // striped awning, sloping down to the front
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = -1.9 + (3.8 * i) / n;
    const u1 = -1.9 + (3.8 * (i + 1)) / n;
    p.frame.quad(i % 2 ? STEEL.white : paint, f(u0, y0 + 2.55, 1.85), f(u1, y0 + 2.55, 1.85), f(u1, y0 + 2.95, 1.2), f(u0, y0 + 2.95, 1.2), true);
  }
  // the sign box: silver, a glowing face and a neon frame
  box(STEEL.silver, 0, 3.55, -0.3, 2.6, 1.0, 0.3);
  const face = f(0, y0 + 3.55, -0.12);
  p.light.add(G.box, mat(face[0], face[1], face[2], 2.2, 0.62, 0.08, ry), neon, t + 0.02, -11);
  const c0 = f(-1.3, y0 + 3.05, -0.12);
  const c1 = f(1.3, y0 + 3.05, -0.12);
  const c2 = f(1.3, y0 + 4.05, -0.12);
  const c3 = f(-1.3, y0 + 4.05, -0.12);
  tube(p.light, [c0, c1, c2, c3], 0.06, NEON.white, t + 0.03, 12, true, false, S.tube4);
  // topper
  const [tx, ty, tz] = f(0, y0 + 4.05, -0.55);
  if (kind === "ice") {
    p.frame.add(G.cone8, mat(tx, ty + 0.85, tz, 0.5, 1.5, 0.5, 0, Math.PI), STEEL.wood);
    p.frame.ball(STEEL.pink, [tx, ty + 1.9, tz], 0.7);
    p.frame.ball(STEEL.cream, [tx, ty + 2.55, tz], 0.48);
  } else if (kind === "drink") {
    p.frame.add(G.cup, mat(tx, ty + 0.8, tz, 0.6, 1.5, 0.6), STEEL.cyan);
    bar(p.frame, STEEL.pink, [tx, ty + 1.3, tz], [tx + 0.3, ty + 2.4, tz + 0.2], 0.12, S.tube6);
  } else if (kind === "donut") {
    p.frame.add(G.torus, mat(tx, ty + 1.05, tz, 0.8, 5.5, 0.8, ry, Math.PI / 2), STEEL.pink);
  } else if (kind === "candy") {
    bar(p.frame, STEEL.white, [tx, ty, tz], [tx, ty + 1.4, tz], 0.1, S.tube6);
    p.frame.ball(STEEL.rose, [tx, ty + 1.9, tz], [0.8, 0.7, 0.8]);
  } else {
    p.frame.add(G.star, mat(tx, ty + 1.1, tz, 0.95, 0.95, 0.3, ry), STEEL.yellow);
  }
  // bulbs along the awning's front edge
  for (let i = 0; i <= 5; i++) {
    const q = f(-1.8 + i * 0.72, y0 + 2.48, 1.9);
    p.bulbs.add(q, 0.15, LIGHTS[(i + Math.round(x)) % 5], t + 0.02);
  }
}

/** A round table with a striped umbrella and four stools. */
export function umbrellaTable(p: Parts, x: number, z: number, y: number, c: string) {
  bar(p.frame, STEEL.white, [x, y, z], [x, y + 1, z], 0.1, S.tube6);
  p.frame.cyl(STEEL.white, [x, y + 1.02, z], 1.0, 0.1, G.cyl8);
  bar(p.frame, STEEL.silver, [x, y + 1, z], [x, y + 3.2, z], 0.07, S.tube4);
  p.frame.revolve([x, y + 2.75, z], [[2.3, 0], [0, 0.8]], 8, (s) => (s % 2 ? STEEL.white : c), true);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    p.frame.cyl(c, [x + Math.cos(a) * 1.6, y + 0.3, z + Math.sin(a) * 1.6], 0.35, 0.6, G.cyl6);
  }
}

export type Color = THREE.ColorRepresentation;

/**
 * What the rides read every frame (one shared object, mutated in place): `p` the shown power (0..1), `run` how
 * fast the rides go (0 until the lights are on, then up to 1), `dt` this frame's step in seconds.
 */
export type Live = { p: number; run: number; dt: number; time: number };

/** Disposes geometries (and instance buffers) when a memo is replaced or the zone unmounts. */
export function disposeAll(list: { dispose(): void }[]) {
  for (const g of list) g.dispose();
}
