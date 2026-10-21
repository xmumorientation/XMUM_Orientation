"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { Bake, G, segMat, type V3 } from "./funfair/central/kit";
import {
  B1_FRONT_M,
  B1_NORTH_EAST_X,
  B1_NORTH_START_X,
  B1_PLACE,
  B1_DORM_ROAD,
  B1_ROADS_M,
  b1Point,
  b1StairsFoot,
  b1WestRoadMid,
  CARPARK,
  COLORS,
  UNITS_PER_M,
} from "./geo";
import { B1_WALL_W, makeB1Walls } from "./textures";

// B1, the Student Activity Centre, from Ben's photos and Esri imagery (2026-10-21). Its front faces west, to the
// lake: a plaza, grand stairs up to a podium, then the activity centre. Its two white floor bands stand out round
// glass and brick walls and carry planting; they round the north-west corner under a glass rotunda. A big sloping
// canopy covers the roof, three tall brick pillars hold a planted roof slab at the south-west corner, and the
// sports hall fills the east end.
//
// Modelled in metres in B1's own frame (b1Point in geo.ts): x east, z south, y up from the plaza, from the
// footprint's centre. Everything bakes into four meshes: the paint (vertex colours), two walls with textures, and
// the glass, which lights up at night.

/** Heights are drawn this many times real, like the A-blocks; positions stay true. */
const LIFT = 1.5;

/** The footprint's half sizes: the bands' west face and the hall's east wall; the bands' north and south faces. */
const HX = B1_PLACE.hx / UNITS_PER_M;
const HZ = B1_PLACE.hz / UNITS_PER_M;

/** How far the floor bands stand out from the walls, the radius of their north-west corner, and where they end. */
const BAND = { out: 4, corner: 11, east: 36 };

/**
 * Heights in metres above the plaza, from the photos: the stairs climb to the podium, the ground floor and the first
 * floor stand behind the two bands, the roof is level with the upper band, and the canopy rises over a third floor.
 */
const Y = { podium: 3, roof: 12, bandA: [6.8, 8.2], bandB: [10.8, 12.4] } as const;

const ROTUNDA = { x: -50.1, z: -21.9, r: 5, cap: 6, top: 15 };

/** The canopy's plan, and the height of its underside at each corner: it rises to the south-west. */
const CANOPY = { x: [-50, 10.6], z: [-15.1, 17.2], ne: 15.2, nw: 15.9, se: 17.1, sw: 17.8, depth: 0.9 } as const;

/** The pavilion of glass under the canopy, on the roof. */
const PAVILION = { x: [-46, 6], z: [-11, 13], top: 14.6 } as const;

/** The south-west corner: three brick pillars in front of the bands, and the roof slab they hold. */
const PORTAL = {
  x: -59,
  z: [16.3, 21.5, 26.7],
  size: 2.2,
  top: 19.2,
  slab: { x: [-61.2, -50.2], z: [13.5, 28.3] },
} as const;

const HALL = { x: [23.7, 57.6], z: [-18.6, 15.6], eaves: 15.2, ridge: 16.4 } as const;
const AC = { x: [14.2, 23.2], z: [-14.4, 15.4] } as const;
/** The low white rim round the hall's part of the roof (imagery). */
const RIM = { x: [10.7, HX], z: [-20.5, 18.2] } as const;

const PAINT = {
  white: "#f4f2ec",
  stone: "#a3a097",
  stoneLight: "#b7b3aa",
  landing: "#c6c2b8",
  brick: "#b4553e",
  roof: "#a4a8a1",
  hallRoof: "#c6cacc",
  steel: "#4a2a27",
  panel: "#ece6d8",
  green: "#4f8a3a",
  greenDark: "#3d7231",
  greenLight: "#6a9c45",
  trunk: "#6b4a2f",
  pot: "#5a4636",
  plant: "#cdd0d2",
  glass: "#55687a",
  soffit: "#ebe7df",
} as const;

type P2 = [number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A flat quad a-b-c-d (in order round its edge), turned to face `want`. */
function face(k: Bake, color: string, a: V3, b: V3, c: V3, d: V3, want: V3) {
  if (dot(cross(sub(b, a), sub(c, a)), want) < 0) k.quad(color, a, d, c, b);
  else k.quad(color, a, b, c, d);
}

/** The arc of the north-west corner, from the west face round to the north face, `r` from its centre. */
function corner(r: number): P2[] {
  const cx = -HX + BAND.corner;
  const cz = -HZ + BAND.corner;
  return Array.from({ length: 17 }, (_, i) => {
    const a = Math.PI + (i / 16) * (Math.PI / 2);
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
}

/** The bands' outer edge, walked from their south-east end round the west face to their north-east end. */
const BAND_EDGE: P2[] = [[BAND.east, HZ], [-HX, HZ], ...corner(BAND.corner), [BAND.east, -HZ]];

/** The activity centre's walls (behind the bands), walked the same way. */
const GLAZED_WALL: P2[] = [
  [BAND.east, HZ - BAND.out],
  [-HX + BAND.out, HZ - BAND.out],
  ...corner(BAND.corner - BAND.out),
  [BAND.east, -HZ + BAND.out],
];

/** The sports hall's walls: out to the footprint's north-east and south-east corners and back. */
const HALL_WALL: P2[] = [
  [BAND.east, -HZ + BAND.out],
  [BAND.east, -HZ],
  [HX, -HZ],
  [HX, HZ],
  [BAND.east, HZ],
  [BAND.east, HZ - BAND.out],
];

/** Outward normal of the segment from a to b (the building's inside is on the right as the outlines are walked). */
function outward(a: P2, b: P2): P2 {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
}

/** The polyline moved `w` metres inwards, with mitred corners. */
function inset(pts: P2[], w: number): P2[] {
  return pts.map((p, i) => {
    const n0 = outward(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]);
    const n1 = outward(pts[Math.min(i, pts.length - 2)], pts[Math.min(i + 1, pts.length - 1)]);
    const k = 1 + n0[0] * n1[0] + n0[1] * n1[1];
    return [p[0] - ((n0[0] + n1[0]) / k) * w, p[1] - ((n0[1] + n1[1]) / k) * w];
  });
}

/** Points every `step` metres along a polyline, `w` metres in from it. */
function along(pts: P2[], step: number, w: number): P2[] {
  const out: P2[] = [];
  let next = step / 2;
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const [nx, nz] = outward(pts[i], pts[i + 1]);
    for (; next <= walked + len; next += step) {
      const t = (next - walked) / len;
      out.push([ax + (bx - ax) * t - nx * w, az + (bz - az) * t - nz * w]);
    }
    walked += len;
  }
  return out;
}

/**
 * A band along a polyline, from `a` to `b` metres in from it and y0 to y1 high: its outer face, top and underside,
 * and its inner face and ends when `closed` (planting strips; the floor bands meet the walls there).
 */
function band(k: Bake, color: string, pts: P2[], a: number, b: number, y0: number, y1: number, closed = false) {
  const o = inset(pts, a);
  const q = inset(pts, b);
  const at = ([x, z]: P2, y: number): V3 => [x, y, z];
  for (let i = 0; i < pts.length - 1; i++) {
    const [nx, nz] = outward(pts[i], pts[i + 1]);
    face(k, color, at(o[i], y0), at(o[i + 1], y0), at(o[i + 1], y1), at(o[i], y1), [nx, 0, nz]);
    face(k, color, at(o[i], y1), at(o[i + 1], y1), at(q[i + 1], y1), at(q[i], y1), [0, 1, 0]);
    face(k, color, at(o[i], y0), at(o[i + 1], y0), at(q[i + 1], y0), at(q[i], y0), [0, -1, 0]);
    if (closed) face(k, color, at(q[i], y0), at(q[i + 1], y0), at(q[i + 1], y1), at(q[i], y1), [-nx, 0, -nz]);
  }
  if (!closed) return;
  const n = pts.length - 1;
  const d0: V3 = [pts[0][0] - pts[1][0], 0, pts[0][1] - pts[1][1]];
  const d1: V3 = [pts[n][0] - pts[n - 1][0], 0, pts[n][1] - pts[n - 1][1]];
  face(k, color, at(o[0], y0), at(q[0], y0), at(q[0], y1), at(o[0], y1), d0);
  face(k, color, at(o[n], y0), at(q[n], y0), at(q[n], y1), at(o[n], y1), d1);
}

/** Walls from the ground to the roof along a polyline, facing out; UVs in wall tiles (textures.ts). */
function wallGeometry(pts: P2[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const h = Y.roof;
  let u = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const [nx, nz] = outward(pts[i], pts[i + 1]);
    const u1 = u + Math.hypot(bx - ax, bz - az) / B1_WALL_W;
    // seen from outside, a is on the right
    pos.push(ax, 0, az, ax, h, az, bx, h, bz, ax, 0, az, bx, h, bz, bx, 0, bz);
    uv.push(u, 0, u, 1, u1, 1, u, 0, u1, 1, u1, 0);
    for (let j = 0; j < 6; j++) nor.push(nx, 0, nz);
    u = u1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A shape in the ground plane (points [x, z]) as flat triangles at height y, facing up. */
function flatShape(pts: P2[], y: number) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** A prism from y0 up to y1 over a shape in the ground plane (points [x, z]). */
function prism(pts: P2[], y0: number, y1: number) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false })
    .rotateX(-Math.PI / 2)
    .translate(0, y0, 0);
}

/** A prism standing on the ground with a side profile (points [x, y]), `t` thick from z0 southwards. */
function profile(pts: P2[], z0: number, t: number) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }).translate(0, 0, z0);
}

/** Height of the canopy's underside. */
function canopyAt(x: number, z: number) {
  const s = (x - CANOPY.x[0]) / (CANOPY.x[1] - CANOPY.x[0]);
  const t = (z - CANOPY.z[0]) / (CANOPY.z[1] - CANOPY.z[0]);
  const north = CANOPY.nw + (CANOPY.ne - CANOPY.nw) * s;
  const south = CANOPY.sw + (CANOPY.se - CANOPY.sw) * s;
  return north + (south - north) * t;
}

const nearRotunda = ([x, z]: P2, m: number) => Math.hypot(x - ROTUNDA.x, z - ROTUNDA.z) < ROTUNDA.r + m;

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * The grand stairs: three flights of six steps with two landings, from the west road up to the podium. They slant
 * with the road (b1StairsFoot), one depth all along.
 */
function stairs(k: Bake) {
  const { depth, stairsN: zN, stairsS: zS } = B1_FRONT_M;
  // [from, to] as shares of the run from the foot, and the height of that tread
  const treads: [number, number, number, string][] = [];
  const flight = 0.22;
  for (let f = 0; f < 3; f++) {
    const start = f * 0.37;
    for (let i = 0; i < 6; i++) {
      const h = (Y.podium * (f * 6 + i + 1)) / 18;
      // every other step a shade lighter, so the flights read as steps from map distances
      const c = i % 2 ? PAINT.stoneLight : PAINT.stone;
      treads.push([start + (flight * i) / 6, start + (flight * (i + 1)) / 6, h, c]);
    }
    treads.push([start + flight, f < 2 ? start + 0.37 : 1, (Y.podium * (f + 1)) / 3, PAINT.landing]);
  }
  for (const [f0, f1, h, c] of treads) {
    const p = (f: number, z: number, y: number): V3 => [b1StairsFoot(z) + depth * f, y, z];
    face(k, c, p(f0, zN, h), p(f1, zN, h), p(f1, zS, h), p(f0, zS, h), [0, 1, 0]);
    face(k, c, p(f0, zN, 0), p(f0, zS, 0), p(f0, zS, h), p(f0, zN, h), [-1, 0, 0]);
    face(k, c, p(f0, zN, 0), p(f1, zN, 0), p(f1, zN, h), p(f0, zN, h), [0, 0, -1]);
    face(k, c, p(f0, zS, 0), p(f1, zS, 0), p(f1, zS, h), p(f0, zS, h), [0, 0, 1]);
  }
  // white walls at the stairs' ends
  const [footN, footS] = [b1StairsFoot(zN), b1StairsFoot(zS)];
  const [lx0, lx1] = B1_FRONT_M.landing.x;
  const [lz0, lz1] = B1_FRONT_M.landing.z;
  const none = new THREE.Matrix4();
  k.add(profile([[footS, 0], [footS + depth, 0], [footS + depth, Y.podium + 0.6], [footS, 0.5]], zS, 0.6), none, PAINT.white);
  k.add(profile([[footN, 0], [lx0, 0], [lx0, 2], [footN, 0.5]], zN - 0.6, 0.6), none, PAINT.white);
  // the podium, from the stairs' top to the walls (a wedge, as the stairs slant), with the landing north of the
  // stairs and its bonsai
  const wall = -HX + BAND.out;
  const podium: P2[] = [
    [lx0, lz0],
    [wall, lz0],
    [wall, zS],
    [footS + depth, zS],
    [footN + depth, zN],
    [lx0, zN],
  ];
  k.add(prism(podium, 0, Y.podium), none, PAINT.stone);
  for (const [bx, bz] of [[lx0 + 2, lz0 + 1.5], [lx0 + 6, lz0 + 1.5], [lx1 - 2, lz1 - 2]] as P2[]) {
    k.cyl(PAINT.pot, [bx, Y.podium + 0.3, bz], 0.5, 0.6, G.cyl8);
    k.cyl(PAINT.trunk, [bx, Y.podium + 1.1, bz], 0.12, 1.2, G.cyl6);
    k.ball(PAINT.greenDark, [bx, Y.podium + 1.9, bz], [1.1, 0.55, 1.1]);
  }
}

/** The floor bands with their planting, the brick columns under the lower band, and the light troughs under both. */
function bands(k: Bake, glass: Bake) {
  const r = rng(7);
  for (const [y0, y1] of [Y.bandA, Y.bandB]) {
    band(k, PAINT.white, BAND_EDGE, 0, BAND.out, y0, y1);
    band(glass, PAINT.soffit, BAND_EDGE, 0.4, 0.9, y0 - 0.08, y0);
  }
  // planting along the edges: a low hedge on the lower band, shrubs and small trees on the upper one
  band(k, PAINT.green, BAND_EDGE, 0.15, 0.95, Y.bandA[1], Y.bandA[1] + 0.35, true);
  band(k, PAINT.greenDark, BAND_EDGE, 0.15, 1.65, Y.bandB[1], Y.bandB[1] + 0.5, true);
  for (const p of along(BAND_EDGE, 3.4, 0.55)) {
    k.ball(r() < 0.5 ? PAINT.green : PAINT.greenLight, [p[0], Y.bandA[1] + 0.5, p[1]], 0.35 + r() * 0.2);
  }
  along(BAND_EDGE, 2.3, 0.9).forEach((p, i) => {
    if (nearRotunda(p, 0.8)) return;
    const y = Y.bandB[1] + 0.5;
    if (i % 6 === 3) {
      k.cyl(PAINT.trunk, [p[0], y + 0.8, p[1]], 0.14, 1.6, G.cyl6);
      k.ball(r() < 0.5 ? PAINT.green : PAINT.greenDark, [p[0], y + 2.1, p[1]], [1.3, 1.1, 1.3], G.ball);
      return;
    }
    const s = 0.55 + r() * 0.45;
    k.ball([PAINT.green, PAINT.greenDark, PAINT.greenLight][Math.floor(r() * 3)], [p[0], y + s * 0.5, p[1]], s);
  });
  // brick columns under the lower band, kept clear of the outside stair and the pillars on the west face
  for (const [x, z] of along(BAND_EDGE, 9, 0.7)) {
    const west = x < -HX + 1;
    if ((west && z > 2) || x > BAND.east - 3) continue;
    const base = west ? Y.podium : 0;
    k.box(PAINT.brick, [x, (base + Y.bandA[0]) / 2, z], [0.9, Y.bandA[0] - base, 0.9]);
  }
}

/** The glass rotunda at the north-west corner, with its saucer cap. */
function rotunda(k: Bake, glass: Bake) {
  const { x, z, r, cap, top } = ROTUNDA;
  glass.cyl(PAINT.glass, [x, (Y.roof + top) / 2, z], r, top - Y.roof, G.cyl20);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.box(PAINT.white, [x + Math.cos(a) * r, (Y.roof + top) / 2, z + Math.sin(a) * r], [0.25, top - Y.roof, 0.25], -a);
  }
  const rings: P2[] = [
    [0, top],
    [cap - 0.6, top],
    [cap, top + 0.45],
    [cap, top + 0.75],
    [cap - 2.5, top + 1.2],
    [0, top + 1.3],
  ];
  k.revolve([x, 0, z], rings, 32, () => PAINT.white);
}

/** The sloping canopy (dark steel frame, light panels) on columns over the glass pavilion. */
function canopy(k: Bake, glass: Bake) {
  const [x0, x1] = CANOPY.x;
  const [z0, z1] = CANOPY.z;
  const d = CANOPY.depth;
  const p = (x: number, z: number, up: number): V3 => [x, canopyAt(x, z) + up, z];
  // the panels: a thin slab on top of the frame
  face(k, PAINT.panel, p(x0, z0, d), p(x1, z0, d), p(x1, z1, d), p(x0, z1, d), [0, 1, 0]);
  face(k, PAINT.panel, p(x0, z0, d - 0.25), p(x1, z0, d - 0.25), p(x1, z1, d - 0.25), p(x0, z1, d - 0.25), [0, -1, 0]);
  const edges: [number, number, number, number, V3][] = [
    [x0, z0, x1, z0, [0, 0, -1]],
    [x0, z1, x1, z1, [0, 0, 1]],
    [x0, z0, x0, z1, [-1, 0, 0]],
    [x1, z0, x1, z1, [1, 0, 0]],
  ];
  for (const [ax, az, bx, bz, n] of edges) {
    face(k, PAINT.panel, p(ax, az, d - 0.25), p(bx, bz, d - 0.25), p(bx, bz, d), p(ax, az, d), n);
  }
  // the frame: deep edge beams, then lighter beams across
  const beam = (a: V3, b: V3, w: number) => k.seg(PAINT.steel, a, b, w);
  for (const z of [z0, z1]) beam(p(x0, z, d * 0.4), p(x1, z, d * 0.4), 0.8);
  for (const x of [x0, x1]) beam(p(x, z0, d * 0.4), p(x, z1, d * 0.4), 0.8);
  for (let z = z0 + 4; z < z1 - 1; z += 4) beam(p(x0, z, d * 0.55), p(x1, z, d * 0.55), 0.35);
  for (let x = x0 + 10; x < x1 - 2; x += 10) beam(p(x, z0, d * 0.5), p(x, z1, d * 0.5), 0.45);
  for (const x of [-48, -20, 8.5]) {
    for (const z of [-13, 15]) k.seg(PAINT.steel, [x, Y.roof, z], p(x, z, 0), 0.5);
  }
  // the pavilion under it
  const [px0, px1] = PAVILION.x;
  const [pz0, pz1] = PAVILION.z;
  const h = PAVILION.top - Y.roof;
  glass.box(PAINT.glass, [(px0 + px1) / 2, Y.roof + h / 2, (pz0 + pz1) / 2], [px1 - px0, h, pz1 - pz0]);
  k.box(PAINT.white, [(px0 + px1) / 2, PAVILION.top + 0.15, (pz0 + pz1) / 2], [px1 - px0 + 0.4, 0.3, pz1 - pz0 + 0.4]);
}

/** The south-west corner: brick pillars, the planted roof slab on them and the white block under its back. */
function portal(k: Bake, glass: Bake) {
  const { x, size, top, slab } = PORTAL;
  for (const z of PORTAL.z) k.box(PAINT.brick, [x, (Y.podium + top) / 2, z], [size, top - Y.podium, size]);
  const [sx0, sx1] = slab.x;
  const [sz0, sz1] = slab.z;
  const cx = (sx0 + sx1) / 2;
  const cz = (sz0 + sz1) / 2;
  k.box(PAINT.white, [cx, top + 0.6, cz], [sx1 - sx0, 1.2, sz1 - sz0]);
  k.box(PAINT.greenDark, [cx, top + 1.4, cz], [sx1 - sx0 - 0.8, 0.4, sz1 - sz0 - 0.8]);
  const r = rng(3);
  for (let i = 0; i < 9; i++) {
    const s = 0.6 + r() * 0.5;
    const at: V3 = [sx0 + 1 + r() * (sx1 - sx0 - 2), top + 1.6 + s * 0.4, sz0 + 1 + r() * (sz1 - sz0 - 2)];
    k.ball(r() < 0.5 ? PAINT.green : PAINT.greenLight, at, s);
  }
  // the block under the slab's back, on the roof, from the wall line to the slab's east edge, with a glass front
  const [bx0, bz1] = [-HX + BAND.out, HZ - BAND.out];
  const [by, bh] = [(Y.roof + top) / 2, top - Y.roof];
  k.box(PAINT.white, [(bx0 + sx1) / 2, by, (sz0 + bz1) / 2], [sx1 - bx0, bh, bz1 - sz0]);
  glass.box(PAINT.glass, [bx0 - 0.06, by, (sz0 + bz1) / 2], [0.12, bh - 2.5, bz1 - sz0 - 1.4]);
  // the outside stair along the west face, up to the lower band
  const sx = -HX - 1.2;
  k.add(G.box, segMat([sx, Y.podium + 0.25, 13], [sx, Y.bandA[0] + 0.25, 4], 1.8, 0.5), PAINT.white);
  k.seg(PAINT.steel, [sx - 0.85, Y.podium + 1.2, 13], [sx - 0.85, Y.bandA[0] + 1.2, 4], 0.14);
  k.box(PAINT.white, [-HX - 1.1, Y.bandA[0] + 0.05, 3], [2.2, 0.5, 2.4]);
}

/** The east end: the sports hall rising from the roof, its air-conditioning plant and the rim round both. */
function hall(k: Bake, glass: Bake) {
  const [x0, x1] = HALL.x;
  const [z0, z1] = HALL.z;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const h = HALL.eaves - Y.roof;
  k.box(PAINT.white, [cx, Y.roof + h / 2, cz], [x1 - x0, h, z1 - z0]);
  const band = (p: V3, s: V3) => glass.box(PAINT.glass, p, s);
  const yb = Y.roof + h * 0.55;
  band([cx, yb, z0 - 0.06], [x1 - x0 - 2, 1.6, 0.12]);
  band([cx, yb, z1 + 0.06], [x1 - x0 - 2, 1.6, 0.12]);
  band([x0 - 0.06, yb, cz], [0.12, 1.6, z1 - z0 - 2]);
  band([x1 + 0.06, yb, cz], [0.12, 1.6, z1 - z0 - 2]);
  // a low gable roof, its ridge north-south
  const o = 0.6;
  const e = HALL.eaves;
  const ridge = (z: number): V3 => [cx, HALL.ridge, z];
  const eave = (x: number, z: number): V3 => [x, e - 0.1, z];
  face(k, PAINT.hallRoof, eave(x0 - o, z0 - o), ridge(z0 - o), ridge(z1 + o), eave(x0 - o, z1 + o), [-1, 4, 0]);
  face(k, PAINT.hallRoof, eave(x1 + o, z0 - o), ridge(z0 - o), ridge(z1 + o), eave(x1 + o, z1 + o), [1, 4, 0]);
  for (const z of [z0, z1]) k.tri(PAINT.white, [x0, e, z], [x1, e, z], [cx, HALL.ridge - 0.1, z], true);
  // air-conditioning units in rows, and two big ones (imagery)
  const [ax0, ax1] = AC.x;
  const [az0, az1] = AC.z;
  for (let x = ax0 + 1.6; x < ax1 - 1; x += 3.2) {
    for (let z = az0 + 1.5; z < az1 - 1; z += 3) {
      if (z > 6 && z < 12) continue;
      k.box(PAINT.plant, [x, Y.roof + 0.7, z], [2, 1.4, 2]);
    }
  }
  for (const x of [ax0 + 2.6, ax0 + 6.6]) k.box(PAINT.plant, [x, Y.roof + 1.1, 9], [3.4, 2.2, 4.6]);
  const [rx0, rx1] = RIM.x;
  const [rz0, rz1] = RIM.z;
  const rim = (p: V3, s: V3) => k.box(PAINT.white, p, s);
  rim([(rx0 + rx1) / 2, Y.roof + 0.4, rz0], [rx1 - rx0, 0.8, 0.4]);
  rim([(rx0 + rx1) / 2, Y.roof + 0.4, rz1], [rx1 - rx0, 0.8, 0.4]);
  rim([rx0, Y.roof + 0.4, (rz0 + rz1) / 2], [0.4, 0.8, rz1 - rz0]);
  rim([rx1, Y.roof + 0.4, (rz0 + rz1) / 2], [0.4, 0.8, rz1 - rz0]);
}

function buildB1() {
  const paint = new Bake();
  const glass = new Bake();
  stairs(paint);
  bands(paint, glass);
  rotunda(paint, glass);
  canopy(paint, glass);
  portal(paint, glass);
  hall(paint, glass);
  paint.add(flatShape([...GLAZED_WALL, ...HALL_WALL.slice(1, -1)], Y.roof), new THREE.Matrix4(), PAINT.roof);
  return {
    paint: paint.geometry(),
    glass: glass.geometry(),
    glazed: wallGeometry(GLAZED_WALL),
    hall: wallGeometry(HALL_WALL),
  };
}

export function B1Building({ glow }: { glow: number }) {
  const geo = useMemo(buildB1, []);
  const walls = useMemo(() => makeB1Walls(5, Y), []);
  const { pos, rotY } = B1_PLACE;
  return (
    <group position={[pos[0], 0, pos[1]]} rotation-y={rotY} scale={[UNITS_PER_M, UNITS_PER_M * LIFT, UNITS_PER_M]}>
      <mesh geometry={geo.paint} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      <mesh geometry={geo.glazed} castShadow receiveShadow>
        <meshStandardMaterial {...walls.glazed} emissive="#ffffff" emissiveIntensity={glow} roughness={0.7} />
      </mesh>
      <mesh geometry={geo.hall} castShadow receiveShadow>
        <meshStandardMaterial {...walls.hall} emissive="#ffffff" emissiveIntensity={glow} roughness={0.8} />
      </mesh>
      <mesh geometry={geo.glass} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.35} emissive="#ffcf86" emissiveIntensity={glow * 0.6} />
      </mesh>
    </group>
  );
}

type Ctx = CanvasRenderingContext2D;

/** Canvas helpers that take points in B1's frame (metres) and draw in the world (ground.tsx's canvas). */
function b1Canvas(ctx: Ctx) {
  const to = ([x, z]: readonly number[]) => b1Point(x, z);
  const trace = (pts: readonly (readonly number[])[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [wx, wz] = to(p);
      if (i) ctx.lineTo(wx, wz);
      else ctx.moveTo(wx, wz);
    });
  };
  const fill = (pts: readonly (readonly number[])[], color: string) => {
    trace(pts);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const rect = ([x0, x1]: readonly number[], [z0, z1]: readonly number[], color: string) =>
    fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color);
  const line = (pts: readonly (readonly number[])[], width: number, color: string) => {
    trace(pts);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  return { to, trace, fill, rect, line };
}

const PAVING = "#9a968f";
const BAY_LINE = "rgba(236,218,170,0.85)";
const KERB = "#c9c4ba";
const MIDDLE = "rgba(255,255,255,0.6)";

/** The west road across [z0, z1]: paving between its slanting edges, the bays' lines square to it, its west kerb. */
function drawWestRoad(ctx: Ctx, z0: number, z1: number) {
  const { fill, line } = b1Canvas(ctx);
  const half = B1_ROADS_M.west.width / 2;
  const [w0, w1] = [b1WestRoadMid(z0) - half, b1WestRoadMid(z1) - half];
  fill([[w0, z0], [w0 + 2 * half, z0], [w1 + 2 * half, z1], [w1, z1]], PAVING);
  const slope = B1_FRONT_M.slope;
  const across = 1 / Math.hypot(1, slope);
  const len = 2 * half - 2.3;
  // every 6 m down the road, on one rhythm from the north road
  const first = B1_ROADS_M.north.road[1] + 2;
  for (let z = first + Math.max(0, Math.ceil((z0 - first) / 6)) * 6; z < z1 - 1; z += 6) {
    const x = b1WestRoadMid(z) - half + 0.8;
    line([[x, z], [x + len * across, z - len * across * slope]], 0.06, BAY_LINE);
  }
  line([[w0, z0], [w1, z1]], 0.12, KERB);
}

/**
 * B1's roads on the ground canvas (ground.tsx; B1_ROADS_M), over the walks, in the colours of Ben's route drawing
 * (2026-10-21): asphalt for the north road (with its drive, palm strip and parking bays) and for the road to the
 * dorms, which carries on the west road's line; grey paving with beige bays for the west road, slanting with the
 * stairs. The west road's stretch across the service road is drawB1Crossing's, drawn after the service road.
 */
export function drawB1Grounds(ctx: Ctx) {
  const { to, trace, rect, line } = b1Canvas(ctx);
  const { stairsN, stairsS } = B1_FRONT_M;
  const { west, dorm, north } = B1_ROADS_M;
  const { drive, palms, palmGap, road, bays } = north;
  const east = B1_NORTH_EAST_X;
  const start = B1_NORTH_START_X;
  const foot = b1StairsFoot;
  const mid = (road[0] + road[1]) / 2;
  const south = (B1_PLACE.pos[0] - CARPARK.x[1]) / UNITS_PER_M;

  // the road to the dorms
  trace(B1_DORM_ROAD);
  ctx.lineWidth = dorm.width * UNITS_PER_M;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.road;
  ctx.stroke();
  // the north road from the T, the bays behind it, the drive along B1 and the link through the palm strip's gap
  rect([b1WestRoadMid(road[1]) - west.width / 2, east], road, COLORS.road);
  rect([start, east - 16], bays, COLORS.road);
  rect([foot(drive[0]), east], drive, COLORS.road);
  rect(palmGap, palms, COLORS.road);
  // a round kerb where the north road's north side meets the road to the dorms
  {
    const kx = b1WestRoadMid(road[0]) + dorm.width / 2;
    const [ax, az] = to([kx + 6, road[0]]);
    const [kxw, kzw] = to([kx, road[0]]);
    const [bx, bz] = to([b1WestRoadMid(road[0] - 6) + dorm.width / 2, road[0] - 6]);
    ctx.beginPath();
    ctx.moveTo(ax, az);
    ctx.arcTo(kxw, kzw, bx, bz, 4 * UNITS_PER_M);
    ctx.lineTo(kxw, kzw);
    ctx.closePath();
    ctx.fillStyle = COLORS.road;
    ctx.fill();
  }
  // the palm strip, in two parts round its gap
  for (const xs of [[start, palmGap[0]], [palmGap[1], east - 14]]) rect(xs, palms, "#86964a");
  for (const z of palms) line([[start, z], [east - 14, z]], 0.05, KERB);
  // dashed middle lines on both roads, the north road's north kerb, and the bays' lines
  ctx.setLineDash([0.5, 0.4]);
  line([[foot(mid), mid], [east - 2, mid]], 0.05, MIDDLE);
  line(B1_DORM_ROAD.slice(1), 0.05, MIDDLE);
  ctx.setLineDash([]);
  line([[b1WestRoadMid(road[0]) + dorm.width / 2 + 4, road[0]], [east - 2, road[0]]], 0.05, KERB);
  for (let x = start + 2; x < east - 18 + 1e-6; x += 2.5) line([[x, bays[0] + 0.3], [x, bays[1]]], 0.05, "rgba(255,255,255,0.75)");

  // the west road, from the north road to the service road, and the line along the stairs' foot
  drawWestRoad(ctx, road[1], south);
  line([[foot(stairsN) - 1.5, stairsN], [foot(stairsS) - 1.5, stairsS]], 0.06, BAY_LINE);
}

/**
 * The west road across the service road south of B1 (drawn after it: sports.tsx's drawCarPark), on to the walk to
 * the south, which carries on from it.
 */
export function drawB1Crossing(ctx: Ctx) {
  const south0 = (B1_PLACE.pos[0] - CARPARK.x[1]) / UNITS_PER_M;
  const south1 = (B1_PLACE.pos[0] - CARPARK.x[0]) / UNITS_PER_M;
  drawWestRoad(ctx, south0 - 0.3, south1);
}
