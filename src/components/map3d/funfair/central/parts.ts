import type * as THREE from "three";

import { Bake, BULB_COLORS, Bulbs, G, PAINT, TAU, lightBake, mat, type V3 } from "./kit";
import { POWER_BOX } from "./layout";

// DRAFT: what the static build of the Central zone collects, and small
// helpers shared by the rides and the decoration. All in zone metres.

/** A "closed" board (it reads "open" once the zone is powered): position, facing. */
export type Board = { x: number; z: number; ry: number };
/** A soft light pool on the ground: centre, radius, colour. */
export type Pool = { x: number; z: number; r: number; c: string };

export type Parts = {
  lite: boolean;
  /** Ground: never fades. */
  paving: Bake;
  /** Painted pieces: grey and dark while the zone is off. */
  paint: Bake;
  /** Neon tubes (and other glowing solids): dead grey while off. */
  neon: Bake;
  bulbs: Bulbs;
  boards: Board[];
  pools: Pool[];
};

export function newParts(lite: boolean): Parts {
  return { lite, paving: new Bake(), paint: new Bake(), neon: lightBake(lite), bulbs: new Bulbs(lite ? 2 : 1), boards: [], pools: [] };
}

/** Farthest point of the zone from the power box (metres). */
const REACH = 150;

/**
 * When a light at (x, z) switches on during the power-up (0..1 of the ramp):
 * the current runs out from the power box, so nearer lights come on first.
 * `extra` delays a piece along its own ride (for example up a tower).
 */
export function tAt(x: number, z: number, extra = 0) {
  const d = Math.hypot(x - POWER_BOX[0], z - POWER_BOX[1]);
  return Math.min(0.97, 0.1 + 0.62 * Math.min(1, d / REACH) + extra);
}

/** A lamp post: navy pole, little cap, and a big round bulb on top. */
export function lamp(p: Parts, x: number, z: number, h: number, c: string = PAINT.navy, bulb: string = BULB_COLORS[0]) {
  p.paint.cyl(c, [x, 0.35, z], 0.42, 0.7, G.cyl8);
  p.paint.cyl(c, [x, h / 2, z], 0.17, h, G.cyl6);
  p.paint.cyl(PAINT.yellow, [x, h - 0.25, z], 0.36, 0.22, G.cyl8);
  p.bulbs.add([x, h + 0.25, z], 0.42, bulb, tAt(x, z));
}

/** A bulb string with small coloured pennants hanging under it (pennants only by day, they're paint). */
export function bunting(p: Parts, a: V3, b: V3, n: number, sag: number, flags = true) {
  const t0 = tAt(a[0], a[2]);
  const t1 = tAt(b[0], b[2]);
  p.bulbs.string(a, b, n, sag, 0.2, BULB_COLORS, t0, t1);
  if (!flags) return;
  const ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  const m = Math.max(2, Math.round(n * 0.6));
  for (let i = 1; i < m; i++) {
    const f = i / m;
    const y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f) - 0.25;
    p.paint.add(
      G.pennant,
      mat(a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f, 0.9, 0.9, 0.9, ry),
      [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.lilac, PAINT.orange][i % 5],
    );
  }
}

/** A low fence on a circle (posts and a rail), with gaps at the given angles (radians, 0 = +x, turning to -z). */
export function fenceRing(p: Parts, cx: number, cz: number, r: number, y: number, gaps: number[], color: string = PAINT.white, gap = 0.32) {
  const n = Math.max(12, Math.round((TAU * r) / 2.4));
  const inGap = (a: number) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap);
  const pt = (a: number, h: number): V3 => [cx + Math.cos(a) * r, y + h, cz - Math.sin(a) * r];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    if (inGap(a0)) continue;
    p.paint.seg(PAINT.navy, pt(a0, 0), pt(a0, 1.25), 0.22);
    if (inGap(a1)) continue;
    p.paint.seg(color, pt(a0, 1.05), pt(a1, 1.05), 0.2);
    p.paint.seg(color, pt(a0, 0.55), pt(a1, 0.55), 0.14);
  }
}

/** A toy tree: a stubby trunk and two stacked chunky crowns. */
export function tree(p: Parts, x: number, z: number, s: number, kind: number) {
  p.paint.cyl(PAINT.trunk, [x, 0.9 * s, z], 0.35 * s, 1.8 * s, G.cyl6);
  if (kind % 3 === 0) {
    p.paint.add(G.cone8, mat(x, 3.2 * s, z, 2.1 * s, 3.4 * s, 2.1 * s, kind), PAINT.leafDark);
    p.paint.add(G.cone8, mat(x, 4.9 * s, z, 1.5 * s, 2.6 * s, 1.5 * s, kind), PAINT.leaf);
  } else {
    p.paint.ball(kind % 3 === 1 ? PAINT.leaf : PAINT.leafDark, [x, 3.1 * s, z], [2.0 * s, 1.8 * s, 2.0 * s]);
    p.paint.ball(PAINT.leaf, [x + 0.4 * s, 4.3 * s, z - 0.3 * s], [1.3 * s, 1.2 * s, 1.3 * s]);
  }
}

/** Pieces of a box turned `ry` about a centre: local [x, y, z] → zone metres. */
export function frame(cx: number, cz: number, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return (x: number, y: number, z: number): V3 => [cx + x * c + z * s, y, cz - x * s + z * c];
}

export type Color = THREE.ColorRepresentation;

/**
 * What the rides read every frame (one shared object, mutated in place):
 * `p` the shown power (0..1), `run` how fast the rides go (0 until the lights
 * are on, then up to 1), `dt` this frame's step in seconds.
 */
export type Live = { p: number; run: number; dt: number; time: number };

/** Disposes geometries when a memo is replaced or the zone unmounts. */
export function disposeAll(list: { dispose(): void }[]) {
  for (const g of list) g.dispose();
}
