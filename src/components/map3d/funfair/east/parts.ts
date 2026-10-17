import * as THREE from "three";

import { Bake, Bulbs, G, TAU, lightBake, mat, type Bulb, type V3 } from "../central/kit";
import { S, bar, tube } from "../west/kit";
import { disposeAll, frame, type Board, type Live, type Pool } from "../west/parts";
import { MARQUEE, NEON, PAINT } from "./kit";
import { POWER_BOX } from "./layout";

// DRAFT: what the East zone's static build collects, and small helpers shared
// by the rides and the decoration (lamps, bulb strings, stalls, trees, neon
// letters). All in zone metres. A building or ride is often baked in its own
// frame (local +z its front) into a Local, then moved into place with commit().

export { disposeAll, frame };
export type { Board, Live, Pool };

export type Parts = {
  lite: boolean;
  /** Ground: never fades. */
  paving: Bake;
  /** Paint, canvas and steel: the paint loses its colour while the zone is off. */
  frame: Bake;
  /** Neon tubes and baked bulbs (one light material; see kit.ts). */
  light: Bake;
  /** Instanced bulbs (lite: every other one). */
  bulbs: Bulbs;
  boards: Board[];
  pools: Pool[];
};

export function newParts(lite: boolean): Parts {
  return { lite, paving: new Bake(), frame: new Bake(), light: lightBake(lite), bulbs: new Bulbs(lite ? 2 : 1), boards: [], pools: [] };
}

/** Farthest point of the zone from the power box (metres). */
const REACH = 175;

/**
 * When a light at (x, z) switches on during the power-up (0..1 of the ramp): the current runs out from the power
 * box, so nearer lights come on first. `extra` delays a piece along its own ride (for example up the tent).
 */
export function tAt(x: number, z: number, extra = 0) {
  const d = Math.hypot(x - POWER_BOX[0], z - POWER_BOX[1]);
  return Math.min(0.97, 0.1 + 0.62 * Math.min(1, d / REACH) + extra);
}

// ---------- local frames ----------

/** Paint, light and bulbs of one building or ride, in its own frame. */
export type Local = { frame: Bake; light: Bake; bulbs: Bulbs };
export const newLocal = (lite: boolean): Local => ({ frame: new Bake(), light: lightBake(lite), bulbs: new Bulbs(lite ? 2 : 1) });

/** The matrix that puts a local frame at (x, z), turned ry (local +z, its front, then faces (sin ry, cos ry)). */
export function placeM(x: number, z: number, ry: number, y = 0) {
  return new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
}

/** Appends a Bake built in a local frame, moved by m. */
export function bakeInto(dst: Bake, src: Bake, m: THREE.Matrix4) {
  const n3 = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  const { pos, nor, col, ts } = src;
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    dst.pos.push(v.x, v.y, v.z);
    v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(n3).normalize();
    dst.nor.push(v.x, v.y, v.z);
  }
  for (let i = 0; i < col.length; i++) dst.col.push(col[i]);
  for (let i = 0; i < ts.length; i++) dst.ts.push(ts[i]);
}

/** Moves a Local into the zone's parts. */
export function commit(p: Parts, l: Local, m: THREE.Matrix4) {
  bakeInto(p.frame, l.frame, m);
  bakeInto(p.light, l.light, m);
  const v = new THREE.Vector3();
  for (const b of l.bulbs.list) {
    v.set(b.p[0], b.p[1], b.p[2]).applyMatrix4(m);
    p.bulbs.list.push({ ...b, p: [v.x, v.y, v.z] } as Bulb);
  }
}

/** Bulbs every `step` metres along a polyline (marquee colours). */
export function beads(bulbs: Bulbs, pts: V3[], step: number, r: number, t: number | ((f: number) => number), k = 0) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
  let carry = 0;
  let done = 0;
  let n = k;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let s = carry;
    while (s <= len) {
      const f = len > 0 ? s / len : 0;
      const ti = typeof t === "function" ? t((done + s) / (total || 1)) : t;
      bulbs.add([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], r, MARQUEE[n++ % MARQUEE.length], ti);
      s += step;
    }
    carry = s - len;
    done += len;
  }
}

// ---------- neon letters (style B's, on a 4 x 6 grid) ----------

const GLYPHS: Record<string, number[][][]> = {
  V: [[[0, 6], [2, 0], [4, 6]]],
  O: [[[0.9, 0], [3.1, 0], [4, 0.9], [4, 5.1], [3.1, 6], [0.9, 6], [0, 5.1], [0, 0.9], [0.9, 0]]],
  R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  X: [[[0, 6], [4, 0]], [[0, 0], [4, 6]]],
  A: [[[0, 0], [2, 6], [4, 0]], [[0.8, 2.4], [3.2, 2.4]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  I: [[[2, 0], [2, 6]], [[1, 6], [3, 6]], [[1, 0], [3, 0]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2.2, 3]]],
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  D: [[[0, 0], [0, 6], [2.6, 6], [4, 4.6], [4, 1.4], [2.6, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
};

/** Neon text in a local frame: centred on x = 0, baseline at y, in the plane z, read from +z. */
export function neonText(b: Bake, text: string, h: number, y: number, z: number, r: number, c: string, t: number, k = 0) {
  const s = h / 6;
  const adv = (ch: string) => (ch === " " ? 2.6 : 5.4) * s;
  const width = [...text].reduce((w, ch) => w + adv(ch), 0) - 1.4 * s;
  let x = -width / 2;
  let n = 0;
  for (const ch of text) {
    for (const stroke of GLYPHS[ch] ?? []) {
      tube(b, stroke.map(([gx, gy]) => [x + gx * s, y + gy * s, z] as V3), r, c, t + n * 0.006, k + n * 20, false, true, S.tube4);
      n++;
    }
    x += adv(ch);
  }
}

// ---------- small pieces ----------

/** A carnival lamp post: a cream pole on a red foot, gold band, a yellow neon ring and a warm globe on top. */
export function lamp(p: Parts, x: number, z: number, y0: number, h = 6.4, ring: string = NEON.yellow) {
  p.frame.cyl(PAINT.red, [x, y0 + 0.3, z], 0.34, 0.6, G.cyl6);
  bar(p.frame, PAINT.cream, [x, y0 + 0.6, z], [x, y0 + h - 0.2, z], 0.13, S.tube6);
  p.frame.cyl(PAINT.gold, [x, y0 + 2.3, z], 0.2, 0.3, G.cyl6);
  p.frame.cyl(PAINT.red, [x, y0 + h - 0.12, z], 0.32, 0.24, G.cyl6);
  const t = tAt(x, z);
  p.light.add(S.tube8, mat(x, y0 + h - 1.1, z, 0.19, 0.5, 0.19), ring, t, -7);
  p.bulbs.add([x, y0 + h + 0.22, z], 0.4, NEON.warm, t);
}

const FLAGS = [PAINT.red, PAINT.cream, PAINT.gold, PAINT.teal, PAINT.cream];

/** A bulb string from a to b (sagging), with red, cream, gold and teal pennants under it when `flags`. */
export function bunting(p: Parts, a: V3, b: V3, n: number, sag: number, flags = true) {
  p.bulbs.string(a, b, n, sag, 0.19, MARQUEE, tAt(a[0], a[2]), tAt(b[0], b[2]));
  if (!flags) return;
  const ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  const m = Math.max(2, Math.round(n * 0.6));
  for (let i = 1; i < m; i++) {
    const f = i / m;
    const y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f) - 0.25;
    p.frame.add(G.pennant, mat(a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f, 0.85, 0.85, 0.85, ry), FLAGS[i % FLAGS.length]);
  }
}

/** A low ring fence: gold posts, a cream rail and a neon top rail; gaps at the given angles (0 = +x, turning to -z). */
export function fenceRing(p: Parts, cx: number, cz: number, r: number, y: number, gaps: number[], neon: string, t: number, gap = 0.3) {
  const n = Math.max(12, Math.round((TAU * r) / 2.8));
  const inGap = (a: number) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap);
  const pt = (a: number, h: number): V3 => [cx + Math.cos(a) * r, y + h, cz - Math.sin(a) * r];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    if (inGap(a0)) continue;
    bar(p.frame, PAINT.gold, pt(a0, 0), pt(a0, 1.1), 0.07, S.tube4);
    if (inGap(a1)) continue;
    bar(p.frame, PAINT.cream, pt(a0, 0.55), pt(a1, 0.55), 0.05, S.tube4);
    tube(p.light, [pt(a0, 1.1), pt(a1, 1.1)], 0.07, neon, t, i, false, false, S.tube4);
  }
}

/** A round tree: a short trunk and two stacked crowns (every third one a cone). */
export function tree(p: Parts, x: number, z: number, y0: number, s: number, kind: number) {
  p.frame.cyl(PAINT.trunk, [x, y0 + 0.9 * s, z], 0.32 * s, 1.8 * s, G.cyl6);
  if (kind % 3 === 0) {
    p.frame.add(G.cone8, mat(x, y0 + 3.2 * s, z, 2.1 * s, 3.4 * s, 2.1 * s, kind), PAINT.leafDark);
    p.frame.add(G.cone8, mat(x, y0 + 4.9 * s, z, 1.5 * s, 2.6 * s, 1.5 * s, kind), PAINT.leaf);
  } else {
    p.frame.ball(kind % 3 === 1 ? PAINT.leaf : PAINT.leafDark, [x, y0 + 3.1 * s, z], [2.0 * s, 1.8 * s, 2.0 * s]);
    p.frame.ball(PAINT.leaf, [x + 0.4 * s, y0 + 4.3 * s, z - 0.3 * s], [1.3 * s, 1.2 * s, 1.3 * s]);
  }
}

/** A bench along local z, facing local +x. */
export function bench(p: Parts, x: number, z: number, y: number, ry: number) {
  const f = frame(x, z, ry);
  const seat = f(0, y + 0.45, 0);
  p.frame.add(G.box, mat(seat[0], seat[1], seat[2], 0.6, 0.12, 2.2, ry), PAINT.red);
  const back = f(-0.28, y + 0.85, 0);
  p.frame.add(G.box, mat(back[0], back[1], back[2], 0.1, 0.5, 2.2, ry), PAINT.red);
  for (const sd of [-0.9, 0.9]) {
    const q = f(0, y + 0.22, sd);
    p.frame.add(G.box, mat(q[0], q[1], q[2], 0.5, 0.44, 0.1, ry), PAINT.iron);
  }
}

/** What stands on a stall's roof. */
export type StallKind = "popcorn" | "candy" | "drink" | "hotdog" | "prize";
export const STALL_KINDS: StallKind[] = ["popcorn", "candy", "drink", "hotdog", "prize"];
/** Stall paint (stripes with cream), each with its sign's neon. */
export const STALL_COLORS: [string, string][] = [
  [PAINT.red, NEON.yellow],
  [PAINT.teal, NEON.cyan],
  [PAINT.red, NEON.pink],
  [PAINT.navy, NEON.yellow],
  [PAINT.gold, NEON.orange],
];

/**
 * A carnival stall 3.6 m wide: a painted booth with a cream counter, gold posts, a red and cream striped awning, a
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
  box(PAINT.cream, 0, 0.55, 0.65, 3.6, 1.1, 1.0);
  box(PAINT.gold, 0, 1.15, 0.65, 3.7, 0.12, 1.1);
  for (const sx of [-1.72, 1.72]) box(PAINT.gold, sx, 1.7, 1.08, 0.14, 2.4, 0.14);
  box(PAINT.cream, 0, 2.95, -0.05, 3.9, 0.18, 2.6);
  // striped awning, sloping down to the front
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = -1.9 + (3.8 * i) / n;
    const u1 = -1.9 + (3.8 * (i + 1)) / n;
    p.frame.quad(i % 2 ? PAINT.cream : PAINT.red, f(u0, y0 + 2.55, 1.85), f(u1, y0 + 2.55, 1.85), f(u1, y0 + 2.95, 1.2), f(u0, y0 + 2.95, 1.2), true);
  }
  // the sign box: gold, a glowing face and a warm neon frame
  box(PAINT.gold, 0, 3.55, -0.3, 2.6, 1.0, 0.3);
  const face = f(0, y0 + 3.55, -0.12);
  p.light.add(G.box, mat(face[0], face[1], face[2], 2.2, 0.62, 0.08, ry), neon, t + 0.02, -11);
  const c0 = f(-1.3, y0 + 3.05, -0.12);
  const c1 = f(1.3, y0 + 3.05, -0.12);
  const c2 = f(1.3, y0 + 4.05, -0.12);
  const c3 = f(-1.3, y0 + 4.05, -0.12);
  tube(p.light, [c0, c1, c2, c3], 0.06, NEON.white, t + 0.03, 12, true, false, S.tube4);
  // topper
  const [tx, ty, tz] = f(0, y0 + 4.05, -0.55);
  if (kind === "popcorn") {
    p.frame.add(G.cup, mat(tx, ty + 0.75, tz, 0.6, 1.4, 0.6), PAINT.red);
    p.frame.ball(PAINT.ivory, [tx, ty + 1.55, tz], [0.65, 0.4, 0.65]);
  } else if (kind === "candy") {
    bar(p.frame, PAINT.white, [tx, ty, tz], [tx, ty + 1.4, tz], 0.1, S.tube6);
    p.frame.ball(PAINT.pink, [tx, ty + 1.9, tz], [0.8, 0.7, 0.8]);
  } else if (kind === "drink") {
    p.frame.add(G.cup, mat(tx, ty + 0.8, tz, 0.6, 1.5, 0.6), PAINT.cyan);
    bar(p.frame, PAINT.red, [tx, ty + 1.3, tz], [tx + 0.3, ty + 2.4, tz + 0.2], 0.12, S.tube6);
  } else if (kind === "hotdog") {
    const q = f(0, y0 + 4.6, -0.55);
    p.frame.add(S.cyl12, mat(q[0], q[1], q[2], 0.42, 2.2, 0.42, ry, 0, Math.PI / 2), PAINT.orange);
    p.frame.add(G.box, mat(q[0], q[1] - 0.25, q[2], 2.0, 0.3, 0.8, ry), PAINT.gold);
  } else {
    p.frame.add(G.star, mat(tx, ty + 1.1, tz, 0.95, 0.95, 0.3, ry), PAINT.yellow);
  }
  // bulbs along the awning's front edge
  for (let i = 0; i <= 5; i++) {
    const q = f(-1.8 + i * 0.72, y0 + 2.48, 1.9);
    p.bulbs.add(q, 0.15, MARQUEE[(i + Math.round(x)) % MARQUEE.length], t + 0.02);
  }
}

/** A round table with a red and cream umbrella and three stools. */
export function umbrellaTable(p: Parts, x: number, z: number, y: number, c: string) {
  bar(p.frame, PAINT.white, [x, y, z], [x, y + 1, z], 0.1, S.tube6);
  p.frame.cyl(PAINT.white, [x, y + 1.02, z], 1.0, 0.1, G.cyl8);
  bar(p.frame, PAINT.gold, [x, y + 1, z], [x, y + 3.2, z], 0.07, S.tube4);
  p.frame.revolve([x, y + 2.75, z], [[2.3, 0], [0, 0.8]], 8, (s) => (s % 2 ? PAINT.cream : c), true);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    p.frame.cyl(c, [x + Math.cos(a) * 1.6, y + 0.3, z + Math.sin(a) * 1.6], 0.35, 0.6, G.cyl6);
  }
}
