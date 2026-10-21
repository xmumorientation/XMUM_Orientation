"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  BLOCK_PLINTH,
  BLOCKS,
  EXTENT,
  NORTH_STAIRS,
  PLATEAU,
  PLATEAU_H,
  TERRACE,
  UNITS_PER_M,
  courtyardWall,
  groundY,
  type World,
} from "./geo";

// The raised ground under the A-row (geo.ts PLATEAU): a mesh of its top and slopes that wears the ground's canvas like
// the flat ground does, and the stone on it: the terrace's steps down to the lawn with stairs cut through them, the
// steps down behind the blocks, the walls beside them, and a stone base under each block.

type V3 = [number, number, number];

/** The terrace's seat-like tiers, the steps of the stairs cut through it, and the steps behind the blocks. */
const TIERS = 14;
const STEPS = 28;
const BACK_STEPS = 28;
/** The steps behind the blocks start at the top of the block's plinth. */
const BACK_TOP = PLATEAU_H + BLOCK_PLINTH.h;
/** Walls beside the steps: how far they stand above them, and how thick they are (world units). */
const PARAPET = 0.6 * UNITS_PER_M;
const WALL = 0.6 * UNITS_PER_M;

const surfaces = new Map<string, THREE.BufferGeometry>();

/**
 * The raised ground's top and slopes as a grid mesh (`lite`: coarser), with the flat ground's UVs, so a canvas laid on
 * the flat ground (the ground's paint, GroundMarks) lies on it in the same place. Only cells that rise above `minY`
 * are kept; the flat ground shows elsewhere. Shared, so not disposed.
 */
export function plateauSurface(lite: boolean, minY = 0): THREE.BufferGeometry {
  const key = `${lite}:${minY}`;
  const cached = surfaces.get(key);
  if (cached) return cached;
  const cell = lite ? 0.5 : 0.25;
  const { outline, slope } = PLATEAU;
  const grow = Math.max(...slope);
  const x0 = Math.min(...outline.map((p) => p[0])) - grow;
  const z0 = Math.min(...outline.map((p) => p[1])) - grow;
  const nx = Math.ceil((Math.max(...outline.map((p) => p[0])) + grow - x0) / cell) + 1;
  const nz = Math.ceil((Math.max(...outline.map((p) => p[1])) + grow - z0) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const ys = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      ys[k] = groundY(x, z);
      pos.set([x, ys[k], z], k * 3);
      uv.set([(x + EXTENT.x) / (2 * EXTENT.x), (EXTENT.z - z) / (2 * EXTENT.z)], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const [b, c, d] = [a + 1, a + nx, a + nx + 1];
      if (Math.max(ys[a], ys[b], ys[c], ys[d]) > minY) index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  surfaces.set(key, g);
  return g;
}

/** Quads (corners in order round each) turned to face `facing`, as one geometry. */
function quads() {
  const pos: number[] = [];
  const nor: number[] = [];
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const quad = (a: V3, b: V3, c: V3, d: V3, facing: V3) => {
    v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    w.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    v.cross(w).normalize();
    const flip = v.x * facing[0] + v.y * facing[1] + v.z * facing[2] < 0;
    for (const p of flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) pos.push(...p);
    for (let i = 0; i < 6; i++) nor.push(...(flip ? [-v.x, -v.y, -v.z] : [v.x, v.y, v.z]));
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  };
  return { quad, geometry };
}

/** The terrace's tiers and the stairs cut through them, and the steps behind the blocks: one geometry. */
function stepsGeometry() {
  const { quad, geometry } = quads();
  const up: V3 = [0, 1, 0];

  const { centre, r0, r1, from, to, flights } = TERRACE;
  const at = (r: number, a: number, y: number): V3 => [centre[0] + r * Math.cos(a), y, centre[1] + r * Math.sin(a)];
  const pieces: [number, number, number][] = [];
  let start = from;
  for (const f of flights) {
    pieces.push([start, f.at - f.half, TIERS], [f.at - f.half, f.at + f.half, STEPS]);
    start = f.at + f.half;
  }
  pieces.push([start, to, TIERS]);
  for (const [a0, a1, n] of pieces) {
    const segs = Math.max(1, Math.ceil(((a1 - a0) * r1) / 0.5));
    for (let s = 0; s < segs; s++) {
      const p = a0 + ((a1 - a0) * s) / segs;
      const q = a0 + ((a1 - a0) * (s + 1)) / segs;
      // risers face down the steps, toward the centre
      const down: V3 = [-Math.cos((p + q) / 2), 0, -Math.sin((p + q) / 2)];
      for (let i = 0; i < n; i++) {
        const [ra, rb] = [r0 + ((r1 - r0) * i) / n, r0 + ((r1 - r0) * (i + 1)) / n];
        const [y0, y1] = [(PLATEAU_H * i) / n, (PLATEAU_H * (i + 1)) / n];
        quad(at(ra, p, y0), at(ra, q, y0), at(ra, q, y1), at(ra, p, y1), down);
        quad(at(ra, p, y1), at(ra, q, y1), at(rb, q, y1), at(rb, p, y1), up);
      }
    }
  }

  // from the top of the block's plinth, right at it, down to the lower ground
  for (const { top, down, across, half, run } of NORTH_STAIRS) {
    const pt = (s: number, a: number, y: number): V3 => [
      top[0] + down[0] * s + across[0] * a,
      y,
      top[1] + down[1] * s + across[1] * a,
    ];
    const facing: V3 = [down[0], 0, down[1]];
    for (let k = 0; k < BACK_STEPS; k++) {
      const [s0, s1] = [(run * k) / BACK_STEPS, (run * (k + 1)) / BACK_STEPS];
      const [y, below] = [BACK_TOP * (1 - k / BACK_STEPS), BACK_TOP * (1 - (k + 1) / BACK_STEPS)];
      quad(pt(s0, -half, y), pt(s0, half, y), pt(s1, half, y), pt(s1, -half, y), up);
      quad(pt(s1, -half, below), pt(s1, half, below), pt(s1, half, y), pt(s1, -half, y), facing);
    }
  }
  return geometry();
}

/** A wall from `a` to `b` on the ground, `thick` wide, its top rising from `ya` at `a` to `yb` at `b`. */
function wall(a: World, b: World, thick: number, ya: number, yb: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.BoxGeometry(len, 1, thick).translate(0, 0.5, 0);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.5) p.setY(i, ya + ((yb - ya) * (p.getX(i) + len / 2)) / len);
  }
  g.computeVertexNormals();
  g.rotateY(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  return g.translate((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
}

/**
 * Pale stone: walls beside the stairs cut through the terrace (A3's grand stair thicker, as in Ben's photo) and at its
 * two ends, walls beside the steps behind the blocks, and a base under each block down to the lawn (it shows where the
 * ground falls away beside a block).
 */
function stoneGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const { centre, r0, r1, from, to, flights } = TERRACE;
  const radial = (a: number, thick: number) => {
    const at = (r: number): World => [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)];
    parts.push(wall(at(r0 - 0.4 * UNITS_PER_M), at(r1 + 0.4 * UNITS_PER_M), thick, PARAPET, PLATEAU_H + PARAPET));
  };
  for (const f of flights) for (const a of [f.at - f.half, f.at + f.half]) radial(a, f.grand ? 1.4 * WALL : WALL);
  radial(from, WALL);
  radial(to, WALL);

  for (const { top, down, across, half, run } of NORTH_STAIRS) {
    for (const side of [-1, 1]) {
      const a = side * (half + WALL / 2);
      const pt = (s: number): World => [top[0] + down[0] * s + across[0] * a, top[1] + down[1] * s + across[1] * a];
      parts.push(wall(pt(0), pt(run + 0.4 * UNITS_PER_M), WALL, BACK_TOP + PARAPET, PARAPET));
    }
  }

  // under each block's plinth, as drawn: the courtyard blocks are smaller than their footprint, A3 fills its own
  for (const b of BLOCKS) {
    const square = courtyardWall(b) + BLOCK_PLINTH.out;
    const [hx, hz] = b.flat ? [b.hx + BLOCK_PLINTH.out, b.hz + BLOCK_PLINTH.out] : [square, square];
    const base = new THREE.BoxGeometry(2 * hx, PLATEAU_H, 2 * hz);
    parts.push(base.translate(0, PLATEAU_H / 2, 0).rotateY(b.rotY).translate(b.pos[0], 0, b.pos[1]));
  }
  return mergeGeometries(parts)!;
}

/** The steps and stone on the raised ground (its top and slopes are drawn by Ground). */
export function Plateau() {
  const steps = useMemo(stepsGeometry, []);
  const stone = useMemo(stoneGeometry, []);
  useEffect(
    () => () => {
      steps.dispose();
      stone.dispose();
    },
    [steps, stone],
  );
  return (
    <>
      <mesh geometry={steps} castShadow receiveShadow>
        <meshStandardMaterial color="#aaa59c" roughness={0.95} />
      </mesh>
      <mesh geometry={stone} castShadow receiveShadow>
        <meshStandardMaterial color="#e2dccf" roughness={0.9} />
      </mesh>
    </>
  );
}
