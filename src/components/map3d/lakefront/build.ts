import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { Bake, G, mat, type V3 } from "../funfair/central/kit";
import { LITE_LIGHT_SCALE } from "../funfair/common";
import {
  AISLE_HW,
  AISLES,
  BANK_W,
  beams,
  BRIDGE_A,
  BRIDGE_HW,
  DECK_Y,
  DEG,
  KERB,
  MOAT_R,
  polar,
  RIB_R,
  RING_ARC,
  RING_R,
  RING_Y,
  SEATS_ARC,
  SHELL,
  shellPoint,
  SLATS_PER_BAY,
  STAGE_R,
  STONE_W,
  TERRACE_D,
  TERRACE_H,
  TERRACES,
  WALL,
  WILLOWS,
} from "./layout";

// DRAFT: bakes the LakeFront Café venue (layout.ts) into a few merged meshes: the venue (stage, moat bed,
// walkway, terraces, aisles, bridge, back wall, willows; flat colours), the steel (the shell's ribs and cross
// tubes), the shell's skin (slats outside, white membrane inside) and the moat's water.

export const PAINT = {
  red: "#d01c24",
  deck: "#7a4f3f",
  concrete: "#ebe6dc",
  white: "#f6f4ef",
  walkway: "#e2d5bb",
  grass: "#8fa552",
  grassDark: "#86a04d",
  stone: "#bfc2b9",
  riser: "#b3b6ad",
  brick: "#c46a52",
  bed: "#5fb4d8",
  trunk: "#6b4a2f",
  willow: "#9cc35a",
  willowDark: "#86b04c",
  fixture: "#2b2d35",
} as const;

const UP: V3 = [0, 1, 0];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Outward (radial) direction at angle a. */
const radial = (a: number): V3 => polar(1, a);
/** Direction of increasing angle at a. */
const tangent = (a: number): V3 => [Math.cos(a), 0, Math.sin(a)];

/**
 * A quad a-b-c-d turned to face `want` (its winding is flipped if needed). `kind` and `seed` go to the vertices'
 * aTS (the lights mesh: which light, and where along its run).
 */
function face(bk: Bake, c: string, a: V3, b: V3, cc: V3, d: V3, want: V3, kind = 0, seed = 0) {
  const fwd = dot(cross(sub(b, a), sub(cc, a)), want) >= 0;
  const [p, q] = fwd ? [b, d] : [d, b];
  bk.tri(c, a, p, cc, false, kind, seed);
  bk.tri(c, a, cc, q, false, kind, seed);
}

/** Segments for an arc of radius r from a0 to a1, about `step` metres long each. */
const steps = (r: number, a0: number, a1: number, step = 1.2) => Math.max(1, Math.ceil((r * Math.abs(a1 - a0)) / step));

/** A flat ring sector at height y, facing up. */
function sector(bk: Bake, c: string, y: number, r0: number, r1: number, a0: number, a1: number) {
  const n = steps(r1, a0, a1);
  for (let i = 0; i < n; i++) {
    const p = a0 + ((a1 - a0) * i) / n;
    const q = a0 + ((a1 - a0) * (i + 1)) / n;
    face(bk, c, polar(r0, p, y), polar(r0, q, y), polar(r1, q, y), polar(r1, p, y), UP);
  }
}

/**
 * A vertical band on the circle of radius r from y0 to y1, facing outwards (out = 1) or towards the centre (-1).
 * For the lights mesh, `kind` and `seed(angle)` tag each segment.
 */
function band(bk: Bake, c: string, r: number, y0: number, y1: number, a0: number, a1: number, out: 1 | -1, kind = 0, seed = (_a: number) => 0) {
  const n = steps(r, a0, a1);
  for (let i = 0; i < n; i++) {
    const p = a0 + ((a1 - a0) * i) / n;
    const q = a0 + ((a1 - a0) * (i + 1)) / n;
    const m = radial((p + q) / 2).map((v) => v * out) as V3;
    face(bk, c, polar(r, p, y0), polar(r, q, y0), polar(r, q, y1), polar(r, p, y1), m, kind, seed((p + q) / 2));
  }
}

/** A sloping band from (r0, y0) out to (r1, y1), facing up and outwards. */
function slope(bk: Bake, c: string, r0: number, y0: number, r1: number, y1: number, a0: number, a1: number) {
  const n = steps(r1, a0, a1);
  for (let i = 0; i < n; i++) {
    const p = a0 + ((a1 - a0) * i) / n;
    const q = a0 + ((a1 - a0) * (i + 1)) / n;
    const m = radial((p + q) / 2);
    face(bk, c, polar(r0, p, y0), polar(r0, q, y0), polar(r1, q, y1), polar(r1, p, y1), [m[0], 1, m[2]]);
  }
}

/** The end wall of a block at angle a, from r0 to r1 and up to y; `side` -1 faces back along the arc, 1 forward. */
function cap(bk: Bake, c: string, a: number, r0: number, r1: number, y: number, side: 1 | -1, y0 = 0) {
  const t = tangent(a).map((v) => v * side) as V3;
  face(bk, c, polar(r0, a, y0), polar(r1, a, y0), polar(r1, a, y), polar(r0, a, y), t);
}

/** A box centred on (r, a), `w` across, `d` deep along the radius, from y0 up to y1. */
function radialBox(bk: Bake, c: string, r: number, a: number, w: number, d: number, y0: number, y1: number) {
  const p = polar(r, a);
  bk.box(c, [p[0], (y0 + y1) / 2, p[2]], [w, y1 - y0, d], Math.PI - a);
}

const terraceTop = (k: number) => RING_Y + (k + 1) * TERRACE_H;

/** The seats' arc split round the aisles, at radius r: [from, to] angle pairs. */
function seatRuns(r: number): [number, number][] {
  const out: [number, number][] = [];
  let from = SEATS_ARC[0];
  for (const a of AISLES) {
    const hw = AISLE_HW / r;
    out.push([from, a - hw]);
    from = a + hw;
  }
  out.push([from, SEATS_ARC[1]]);
  return out;
}

function bakeAmphitheatre(bk: Bake) {
  for (let k = 0; k < TERRACES; k++) {
    const r0 = RING_R + k * TERRACE_D;
    const r1 = r0 + TERRACE_D;
    const y = terraceTop(k);
    const below = k === 0 ? RING_Y : terraceTop(k - 1);
    for (const [a0, a1] of seatRuns(r0 + TERRACE_D / 2)) {
      band(bk, PAINT.riser, r0, below, y, a0, a1, -1);
      sector(bk, PAINT.stone, y, r0, r0 + STONE_W, a0, a1);
      sector(bk, k % 2 ? PAINT.grassDark : PAINT.grass, y, r0 + STONE_W, r1, a0, a1);
      cap(bk, PAINT.riser, a0, r0, r1, y, -1);
      cap(bk, PAINT.riser, a1, r0, r1, y, 1);
    }
    // two brick steps per terrace in each aisle
    for (const a of AISLES) {
      radialBox(bk, PAINT.brick, r0 + TERRACE_D / 4, a, 2 * AISLE_HW, TERRACE_D / 2, 0, below + TERRACE_H / 2);
      radialBox(bk, PAINT.brick, r0 + (3 * TERRACE_D) / 4, a, 2 * AISLE_HW, TERRACE_D / 2, 0, y);
    }
  }
  // the bank behind the top terrace, down to the lawn
  const rTop = RING_R + TERRACES * TERRACE_D;
  const yTop = terraceTop(TERRACES - 1);
  slope(bk, PAINT.grassDark, rTop, yTop, rTop + BANK_W, 0, SEATS_ARC[0], SEATS_ARC[1]);
  for (const [a, side] of [
    [SEATS_ARC[0], -1],
    [SEATS_ARC[1], 1],
  ] as const) {
    const t = tangent(a).map((v) => v * side) as V3;
    const p = polar(rTop, a, 0);
    const q = polar(rTop + BANK_W, a, 0);
    const top = polar(rTop, a, yTop);
    if (dot(cross(sub(q, p), sub(top, p)), t) >= 0) bk.tri(PAINT.grassDark, p, q, top);
    else bk.tri(PAINT.grassDark, p, top, q);
  }
}

function bakeWalkway(bk: Bake) {
  const [s0, s1] = SEATS_ARC;
  sector(bk, PAINT.walkway, RING_Y, MOAT_R, RING_R, -RING_ARC, RING_ARC);
  band(bk, PAINT.concrete, MOAT_R, 0, RING_Y, -RING_ARC, RING_ARC, -1);
  // the walkway's outer edge where no terraces stand against it
  band(bk, PAINT.concrete, RING_R, 0, RING_Y, -RING_ARC, s0, 1);
  band(bk, PAINT.concrete, RING_R, 0, RING_Y, s1, RING_ARC, 1);
  cap(bk, PAINT.concrete, -RING_ARC, MOAT_R, RING_R, RING_Y, -1);
  cap(bk, PAINT.concrete, RING_ARC, MOAT_R, RING_R, RING_Y, 1);
  // the low kerb closing the moat behind the stage, on the lake side
  const r1 = MOAT_R + KERB.t;
  sector(bk, PAINT.concrete, KERB.h, MOAT_R, r1, RING_ARC, 2 * Math.PI - RING_ARC);
  band(bk, PAINT.concrete, MOAT_R, 0, KERB.h, RING_ARC, 2 * Math.PI - RING_ARC, -1);
  band(bk, PAINT.concrete, r1, 0, KERB.h, RING_ARC, 2 * Math.PI - RING_ARC, 1);
}

const BALUSTRADE_R = STAGE_R - 0.25;

/** The balustrade's post angles, in two runs either side of the bridge (fewer posts in lite). */
function balustradeRuns(lite: boolean): number[][] {
  const gap = (BRIDGE_HW + 0.2) / BALUSTRADE_R;
  const runs: [number, number][] = [
    [-100 * DEG, BRIDGE_A - gap],
    [BRIDGE_A + gap, 100 * DEG],
  ];
  return runs.map(([p, q]) => {
    const n = Math.max(2, Math.round((BALUSTRADE_R * (q - p)) / (lite ? 1.4 : 0.7)));
    return Array.from({ length: n + 1 }, (_, i) => p + ((q - p) * i) / n);
  });
}

function bakeStage(bk: Bake, lite: boolean) {
  // the moat's bed, the stage's drum and its deck
  sector(bk, PAINT.bed, 0.12, STAGE_R - 0.2, MOAT_R + 0.1, 0, 2 * Math.PI);
  band(bk, PAINT.concrete, STAGE_R, 0, DECK_Y, 0, 2 * Math.PI, 1);
  bk.add(G.disc48, mat(0, DECK_Y, 0, STAGE_R, 1, STAGE_R), PAINT.deck);

  // the white balustrade round the front of the stage, open where the bridge lands
  for (const run of balustradeRuns(lite)) {
    run.forEach((a, i) => {
      bk.box(PAINT.white, polar(BALUSTRADE_R, a, DECK_Y + 0.5), [0.12, 1, 0.12], Math.PI - a);
      const b = run[i + 1];
      if (b === undefined) return;
      for (const h of [0.98, 0.18]) {
        bk.seg(PAINT.white, polar(BALUSTRADE_R, a, DECK_Y + h), polar(BALUSTRADE_R, b, DECK_Y + h), h > 0.5 ? 0.14 : 0.1);
      }
    });
  }

  // the back wall round the back of the stage, under the shell
  const [w0, w1] = WALL.a;
  const top = DECK_Y + WALL.h;
  band(bk, PAINT.concrete, WALL.r, DECK_Y, top, w0, w1, -1);
  band(bk, PAINT.concrete, WALL.r + WALL.t, DECK_Y, top, w0, w1, 1);
  sector(bk, PAINT.concrete, top, WALL.r, WALL.r + WALL.t, w0, w1);
  cap(bk, PAINT.concrete, w0, WALL.r, WALL.r + WALL.t, top, -1, DECK_Y);
  cap(bk, PAINT.concrete, w1, WALL.r, WALL.r + WALL.t, top, 1, DECK_Y);
  // a dark doorway in the middle of the wall
  const door = polar(WALL.r - 0.03, Math.PI, DECK_Y + 1.25);
  bk.box("#3b3f4a", door, [2.4, 2.5, 0.06], 0);

  // the shell's feet: white plinths at the walkway's edge
  for (const sx of [-1, 1]) bk.box(PAINT.concrete, [sx * SHELL.span, SHELL.footY / 2, SHELL.footZ], [2.2, SHELL.footY, 2.2]);

  // the beams' fixtures (layout.ts beams): a dark base and a head tipped along the beam's aim
  for (const b of beams(lite)) {
    const base = b.p[1] - 0.55;
    bk.box(PAINT.fixture, [b.p[0], base + 0.15, b.p[2]], [0.6, 0.3, 0.6]);
    const tip: V3 = [b.p[0] + b.dir[0] * 0.35, b.p[1] + b.dir[1] * 0.35, b.p[2] + b.dir[2] * 0.35];
    bk.seg(PAINT.fixture, [b.p[0], base + 0.3, b.p[2]], tip, 0.42, G.cyl8);
  }
}

function bakeBridge(bk: Bake) {
  const a = BRIDGE_A;
  const r0 = STAGE_R - 0.3;
  const r1 = MOAT_R + 0.5;
  const y = 1.22;
  radialBox(bk, PAINT.white, (r0 + r1) / 2, a, 2 * BRIDGE_HW, r1 - r0, y - 0.25, y);
  // one step down to the walkway
  radialBox(bk, PAINT.concrete, r1 + 0.35, a, 2 * BRIDGE_HW, 0.7, 0, (y + RING_Y) / 2);
  // railings on both sides
  const t = tangent(a);
  for (const side of [-1, 1]) {
    const off = (r: number, h: number): V3 => {
      const p = polar(r, a, h);
      return [p[0] + t[0] * side * (BRIDGE_HW - 0.08), h, p[2] + t[2] * side * (BRIDGE_HW - 0.08)];
    };
    for (const r of [r0 + 0.2, (r0 + r1) / 2, r1 - 0.1]) bk.seg(PAINT.white, off(r, y), off(r, y + 1), 0.1);
    bk.seg(PAINT.white, off(r0 + 0.2, y + 1), off(r1 - 0.1, y + 1), 0.12);
  }
}

/** Weeping willows: a leaning trunk, a soft crown, and long strands hanging from its rim nearly to the ground. */
function bakeWillows(bk: Bake) {
  WILLOWS.forEach(([x, z, s], w) => {
    const top: V3 = [x + 0.4 * s, 6.2 * s, z - 0.3 * s];
    bk.seg(PAINT.trunk, [x, 0, z], top, 0.5 * s, G.cyl6);
    bk.ball(PAINT.willow, [top[0], 7 * s, top[2]], [2.6 * s, 1.5 * s, 2.6 * s], G.ball);
    bk.ball(PAINT.willowDark, [top[0] - 0.8 * s, 6.5 * s, top[2] + 0.6 * s], [1.9 * s, 1.2 * s, 1.9 * s], G.ball);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + w;
      const r = (2.3 + 0.35 * Math.sin(i * 2.7 + w)) * s;
      const len = (4.4 + 0.9 * Math.sin(i * 1.9 + w * 3)) * s;
      const cx = top[0] + Math.cos(a) * r;
      const cz = top[2] - Math.sin(a) * r;
      // a strand: a thin cone hanging point down (turned over, not mirrored, so its faces still look out)
      const strand = mat(cx + Math.cos(a) * 0.4 * s, 6.6 * s - len / 2, cz - Math.sin(a) * 0.4 * s, 0.75 * s, len, 0.75 * s, 0, Math.PI);
      bk.add(G.cone8, strand, i % 2 ? PAINT.willow : PAINT.willowDark);
    }
  });
}

/** Everything of the venue that is flat colours: one mesh. */
export function bakeVenue(lite: boolean) {
  const bk = new Bake();
  bakeStage(bk, lite);
  bakeWalkway(bk);
  bakeAmphitheatre(bk);
  bakeBridge(bk);
  bakeWillows(bk);
  return bk.geometry();
}

/** The kinds of light in the lights mesh (its aTS.x); kit.ts gives each its brightness and its look by day. */
export const LIGHT = { bulb: 0, dot: 1, step: 2, riser: 3 } as const;

export const LIGHT_COLORS = {
  bulb: "#ffd28a",
  dot: "#0dfcfd",
  step: "#ffd9a0",
  riser: "#ffe6c4",
} as const;

/**
 * The venue's small lights, one mesh: bulbs on the balustrade's posts, dots along the walkway, a light on each
 * aisle step and a strip under each terrace's stone edge. aTS = (kind, seed); a riser strip's seed is its terrace
 * plus how far round the arc it is (0..1), for the concert's chases later. Bigger in lite (no bloom there).
 */
export function bakeLights(lite: boolean) {
  const bk = new Bake();
  const w = lite ? LITE_LIGHT_SCALE : 1;

  // warm bulbs on every other balustrade post
  for (const run of balustradeRuns(lite)) {
    run.forEach((a, i) => {
      if (i % 2) return;
      bk.ball(LIGHT_COLORS.bulb, polar(BALUSTRADE_R, a, DECK_Y + 1.14), 0.13 * w, G.ico, LIGHT.bulb, i);
    });
  }

  // dots along the walkway, at the foot of the terraces
  const rDot = RING_R - 0.5;
  const nDot = Math.round((rDot * 2 * RING_ARC) / (lite ? 3.6 : 2.4));
  for (let i = 0; i <= nDot; i++) {
    const a = -RING_ARC + (2 * RING_ARC * i) / nDot;
    const p = polar(rDot, a, RING_Y + 0.02);
    bk.add(G.cyl12, mat(p[0], p[1], p[2], 0.2 * w, 0.05, 0.2 * w), LIGHT_COLORS.dot, LIGHT.dot, i / nDot);
  }

  for (let k = 0; k < TERRACES; k++) {
    const r0 = RING_R + k * TERRACE_D;
    const y = terraceTop(k);
    const below = k === 0 ? RING_Y : terraceTop(k - 1);
    // a light on the face of each aisle step
    for (const a of AISLES) {
      for (const [r, h] of [
        [r0, below + TERRACE_H / 4],
        [r0 + TERRACE_D / 2, below + (3 * TERRACE_H) / 4],
      ]) {
        const p = polar(r - 0.03, a, h);
        bk.box(LIGHT_COLORS.step, p, [1.1 * w, 0.05 * w, 0.04], Math.PI - a, LIGHT.step, k);
      }
    }
    // a strip under the stone edge of each terrace
    const span = SEATS_ARC[1] - SEATS_ARC[0];
    for (const [a0, a1] of seatRuns(r0 + TERRACE_D / 2)) {
      const seed = (a: number) => k + Math.min(0.999, (a - SEATS_ARC[0]) / span);
      band(bk, LIGHT_COLORS.riser, r0 - 0.03, y - 0.08 - 0.03 * w, y - 0.04, a0, a1, -1, LIGHT.riser, seed);
    }
  }
  return bk.geometry();
}

/**
 * The shell's steel: the ribs (from foot to foot) and the cross tubes between them. aLed = (how far along the
 * rib from the south foot, 0..1; the rib's index 0..6 from the front arch, or -1 for a cross tube): the ribs are
 * the shell's LED lines at night (kit.ts).
 */
export function steelGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.TubeGeometry, rib: number) => {
    const uv = g.getAttribute("uv");
    const led = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) led.set([uv.getX(i), rib], i * 2);
    g.setAttribute("aLed", new THREE.BufferAttribute(led, 2));
    parts.push(g);
  };
  SHELL.ribs.forEach((t, k) => {
    const pts = Array.from({ length: 41 }, (_, i) => new THREE.Vector3(...shellPoint((Math.PI * i) / 40, t)));
    // the front arch is the thickest tube (photos)
    tag(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, RIB_R * (k === 0 ? 1.4 : 1), 8, false), k);
  });
  const t0 = SHELL.ribs[0];
  const t1 = SHELL.ribs[SHELL.ribs.length - 1];
  for (const k of [0.2, 0.31, 0.42, 0.58, 0.69, 0.8]) {
    const pts = Array.from({ length: 13 }, (_, i) => new THREE.Vector3(...shellPoint(Math.PI * k, t0 + ((t1 - t0) * i) / 12, -0.05)));
    tag(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.16, 6, false), -1);
  }
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/**
 * The shell's skin between the front and the last rib: a grid over (s, t) with `aShell` = (along the span, across
 * the ribs), both 0..1. Its front faces look outwards: the material paints slats there and the membrane inside.
 */
export function shellGeometry() {
  const ns = 48;
  const nt = 6 * SLATS_PER_BAY + 6;
  const { s0, ribs } = SHELL;
  const t0 = ribs[0];
  const t1 = ribs[ribs.length - 1];
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= nt; j++)
    for (let i = 0; i <= ns; i++) {
      const s = s0 + ((Math.PI - 2 * s0) * i) / ns;
      const t = t0 + ((t1 - t0) * j) / nt;
      pos.push(...shellPoint(s, t, 0.12));
      uv.push(i / ns, j / nt);
    }
  const idx: number[] = [];
  const row = ns + 1;
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < ns; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aShell", new THREE.Float32BufferAttribute(uv, 2));
  // front faces outwards: check one triangle against the direction away from the feet's axis, flip if needed
  const P = (k: number): V3 => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
  const k0 = Math.floor(nt / 2) * row + Math.floor(ns / 2);
  const n = cross(sub(P(k0 + 1), P(k0)), sub(P(k0 + row), P(k0)));
  const away: V3 = [0, P(k0)[1] - SHELL.footY, P(k0)[2] - SHELL.footZ];
  if (dot(n, away) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The moat's water: a ring from under the stage's edge to the walkway. */
export function moatGeometry() {
  return new THREE.RingGeometry(STAGE_R - 0.1, MOAT_R + 0.05, 72, 1).rotateX(-Math.PI / 2);
}
