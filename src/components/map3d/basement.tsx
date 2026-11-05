"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
  BASEMENT_HOUSE,
  BASEMENT_HOUSE_H_M,
  BASEMENT_RAMP,
  BASEMENT_RISE,
  BASEMENT_ROAD,
  BASEMENT_WALL_M,
  COLORS,
  EXTENT,
  PORTAL_OPEN_M,
  RAMP_DEPTH_M,
  UNITS_PER_M,
  aRowArc,
  type World,
} from "./geo";

// The road to the A-row's basement car park (geo.ts BASEMENT_M, Ben 2026-11-05): its paint on the ground's canvas, the
// cut in that canvas over the ramp, the ramp's floor (it wears the same canvas, so the road's paint runs on down it),
// and the white house at the terrace's east end, the white walls along the ramp and the dark way in under the house.

/** Traces a world polyline on the ground's canvas (its transform maps world x, z to pixels: ground.tsx). */
function trace(ctx: CanvasRenderingContext2D, pts: readonly World[], close: boolean) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
  if (close) ctx.closePath();
}

/**
 * The road on the ground's canvas, after the campus road: the brick walk inside the bend (its outline first), the
 * kerb, the asphalt (over the campus road's kerb at the mouth), the dashed middle line and the stop line. `kerb` and
 * `edge` are ground.tsx's kerb and walk-outline widths (world units).
 */
export function drawBasementRoad(ctx: CanvasRenderingContext2D, kerb: number, edge: number) {
  const { asphalt, kerb: kerbLine, centre, stop, walk } = BASEMENT_ROAD;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace(ctx, walk, true);
  ctx.lineWidth = 2 * edge;
  ctx.strokeStyle = COLORS.pathEdge;
  ctx.stroke();
  ctx.fillStyle = COLORS.path;
  ctx.fill();
  trace(ctx, kerbLine, false);
  ctx.lineWidth = 2 * kerb;
  ctx.strokeStyle = COLORS.kerb;
  ctx.stroke();
  trace(ctx, asphalt, true);
  ctx.fillStyle = COLORS.road;
  ctx.fill();
  trace(ctx, centre, false);
  ctx.setLineDash([0.8, 0.7]);
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = COLORS.roadLine;
  ctx.stroke();
  ctx.setLineDash([]);
  trace(ctx, stop, false);
  ctx.lineCap = "butt";
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.restore();
}

/**
 * The paved way that climbs beside the ramp to the A-row's walk, after the A-row's paving: a kerb along its outer edge,
 * the grey paving (it covers the walk's end, which it carries on) and joints across it.
 */
export function drawBasementRise(ctx: CanvasRenderingContext2D, kerb: number) {
  const { band, edge, mid } = BASEMENT_RISE;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  trace(ctx, edge, false);
  ctx.lineWidth = 2 * kerb;
  ctx.strokeStyle = COLORS.kerb;
  ctx.stroke();
  trace(ctx, band, true);
  ctx.fillStyle = COLORS.paving;
  ctx.fill();
  ctx.clip();
  // joints across it, about every 3.7 m, as on the A-row's walk
  trace(ctx, mid, false);
  ctx.lineWidth = 16 * UNITS_PER_M;
  ctx.setLineDash([0.04, 0.55]);
  ctx.strokeStyle = "rgba(90,80,70,0.18)";
  ctx.stroke();
  ctx.restore();
}

/**
 * Cuts the ground's canvas away over the ramp, last of all: its alpha drops under the ground meshes' alphaTest, while
 * the colours stay for the ramp's floor, which wears the same canvas without alphaTest.
 */
export function cutBasement(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  trace(ctx, BASEMENT_RAMP.cut, true);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fill();
  ctx.restore();
}

let floorCache: THREE.BufferGeometry | null = null;

/**
 * The ramp's floor, section by section from the fork down to the portal, with the flat ground's UVs so it wears the
 * ground's canvas (the road's paint) in the same place. Shared, so not disposed.
 */
export function basementFloor(): THREE.BufferGeometry {
  if (floorCache) return floorCache;
  const { inner, wall, depth } = BASEMENT_RAMP;
  const pos: number[] = [];
  const uv: number[] = [];
  inner.forEach((p, k) => {
    for (const [x, z] of [p, wall[k]]) {
      pos.push(x, -depth[k], z);
      uv.push((x + EXTENT.x) / (2 * EXTENT.x), (EXTENT.z - z) / (2 * EXTENT.z));
    }
  });
  // wind the triangles so the floor faces up
  const [s0, s1, n0] = [inner[0], inner[1], wall[0]];
  const up = (s1[1] - s0[1]) * (n0[0] - s0[0]) - (s1[0] - s0[0]) * (n0[1] - s0[1]) > 0;
  const index: number[] = [];
  for (let k = 0; k < inner.length - 1; k++) {
    const [a, b, c, d] = [2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3];
    if (up) index.push(a, c, b, b, c, d);
    else index.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  floorCache = g;
  return g;
}

type V3 = [number, number, number];

/** A vertex-coloured mesh built from triangles and quads, each turned to face a given direction. */
function builder() {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const tri = (a: V3, b: V3, d: V3, color: string, facing: V3) => {
    v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    w.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    v.cross(w).normalize();
    const flip = v.x * facing[0] + v.y * facing[1] + v.z * facing[2] < 0;
    if (flip) v.negate();
    c.set(color);
    for (const p of flip ? [a, d, b] : [a, b, d]) {
      pos.push(...p);
      nor.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
  };
  const quad = (a: V3, b: V3, cc: V3, d: V3, color: string, facing: V3) => {
    tri(a, b, cc, color, facing);
    tri(a, cc, d, color, facing);
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  return { tri, quad, geometry };
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const WHITE = "#eceae3";
const WALL_WHITE = "#e6e2d9";
const ROOF = "#7e8b68";
const VINES = ["#4f8139", "#5e9443", "#46733a"];
const SHUTTER = "#8a8e91";
const TUNNEL = { floor: "#3b3a3e", side: "#2d2d30", ceiling: "#27272a" };

/**
 * The white house, the walls along the ramp and the dark way in: `solid` (vertex colours) and `lit` (the back of the
 * way in and a strip light along its ceiling, which glow at dusk and night).
 */
function buildBasement() {
  const U = UNITS_PER_M;
  const solid = builder();
  const lit = builder();
  const { r, deg } = BASEMENT_HOUSE;
  const H = BASEMENT_HOUSE_H_M;
  const below = -(RAMP_DEPTH_M + 0.25);
  const open = -RAMP_DEPTH_M + PORTAL_OPEN_M;
  const wallR = r.cover - BASEMENT_WALL_M.thick;

  /** A point `rad` metres out on the A-row's arc at `a` degrees, `y` metres up. */
  const at = (rad: number, a: number, y: number): V3 => {
    const [x, z] = aRowArc(rad, a);
    return [x, y * U, z];
  };
  const outward = (a: number): V3 => {
    const [p, q] = [aRowArc(400, a), aRowArc(401, a)];
    return [q[0] - p[0], 0, q[1] - p[1]];
  };
  /** Toward the west along the arc (the angle grows westward). */
  const westward = (a: number): V3 => {
    const [p, q] = [aRowArc(420, a), aRowArc(420, a + 0.1)];
    return [q[0] - p[0], 0, q[1] - p[1]];
  };
  const neg = ([a, b, c]: V3): V3 => [-a, -b, -c];
  const UP: V3 = [0, 1, 0];
  const DOWN: V3 = [0, -1, 0];
  /** Angles from `a` to `b` about every 2 m at radius `rad`, both ends included. */
  const angles = (a: number, b: number, rad: number) => {
    const count = Math.max(1, Math.ceil((Math.abs(b - a) * Math.PI * rad) / 180 / 2));
    return Array.from({ length: count + 1 }, (_, i) => a + ((b - a) * i) / count);
  };
  /** A wall face along the arc at radius `rad` from angle `a` to `b`, `y0` to `y1` metres, facing `facing(angle)`. */
  const arcFace = (rad: number, a: number, b: number, y0: number, y1: number, color: string, facing: (m: number) => V3) => {
    const as = angles(a, b, rad);
    for (let i = 1; i < as.length; i++) {
      const [p, q] = [as[i - 1], as[i]];
      solid.quad(at(rad, p, y0), at(rad, q, y0), at(rad, q, y1), at(rad, p, y1), color, facing((p + q) / 2));
    }
  };
  /** A wall face across the arc at angle `a`, from radius `r0` to `r1`, `y0` to `y1` metres. */
  const radialFace = (a: number, r0: number, r1: number, y0: number, y1: number, color: string, facing: V3, mesh = solid) => {
    mesh.quad(at(r0, a, y0), at(r1, a, y0), at(r1, a, y1), at(r0, a, y1), color, facing);
  };
  /** A flat band on the arc between radii `r0` and `r1`, angles `a` to `b`, at `y` metres. */
  const arcBand = (r0: number, r1: number, a: number, b: number, y: number, color: string, facing: V3, mesh = solid) => {
    const as = angles(a, b, r1);
    for (let i = 1; i < as.length; i++) {
      const [p, q] = [as[i - 1], as[i]];
      mesh.quad(at(r0, p, y), at(r0, q, y), at(r1, q, y), at(r1, p, y), color, facing);
    }
  };

  // ── the house: walls from below the ramp's floor to the roof (the ground hides what is under the lawn) ──
  arcFace(r.south, deg.east, deg.west, below, H, WHITE, (m) => neg(outward(m)));
  arcFace(r.north, deg.east, deg.portal, below, H, WHITE, outward);
  arcFace(r.cover, deg.portal, deg.west, below, H, WHITE, outward);
  radialFace(deg.west, r.south, r.cover, below, H, WHITE, westward(deg.west));
  radialFace(deg.east, r.south, r.north, below, H, WHITE, neg(westward(deg.east)));
  // the portal: the lintel over the way in, and the end of the white wall beside it
  radialFace(deg.portal, r.north, r.cover, open, H, WHITE, neg(westward(deg.portal)));
  radialFace(deg.portal, wallR, r.cover, below, open, WALL_WHITE, neg(westward(deg.portal)));
  // the roof, overgrown (imagery: grey-green with planting; Ben's photos: greenery hanging over its edge)
  arcBand(r.south, r.north, deg.east, deg.portal, H, ROOF, UP);
  arcBand(r.south, r.cover, deg.portal, deg.west, H, ROOF, UP);

  // greenery hanging over the south face and the east end, ragged at the bottom, and a lip of it on the roof's edge
  const rand = rng(41);
  const lip = 0.07;
  {
    const as = angles(deg.east, deg.west, r.south);
    for (let i = 1; i < as.length; i++) {
      const [p, q] = [as[i - 1], as[i]];
      const drop = 0.45 + rand() * 0.9;
      const color = VINES[Math.floor(rand() * VINES.length)];
      const face = neg(outward((p + q) / 2));
      solid.quad(at(r.south - lip, p, H - drop), at(r.south - lip, q, H - drop), at(r.south - lip, q, H + 0.12), at(r.south - lip, p, H + 0.12), color, face);
    }
    arcBand(r.south - lip, r.south + 0.6, deg.east, deg.west, H + 0.12, VINES[0], UP);
  }
  {
    const eastFace = neg(westward(deg.east));
    const off = (0.07 / r.north) * (180 / Math.PI);
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const [r0, r1] = [r.south + ((r.north - r.south) * i) / steps, r.south + ((r.north - r.south) * (i + 1)) / steps];
      const drop = 0.4 + rand() * 0.8;
      radialFace(deg.east - off, r0, r1, H - drop, H + 0.12, VINES[Math.floor(rand() * VINES.length)], eastFace);
    }
    // two grey roller shutters on the east end (Ben's photo)
    const shutterOff = (0.04 / r.north) * (180 / Math.PI);
    const mid = (r.south + r.north) / 2;
    for (const [r0, r1] of [
      [mid - 3.7, mid - 0.5],
      [mid + 0.5, mid + 3.7],
    ]) {
      radialFace(deg.east - shutterOff, r0, r1, 0, 3, SHUTTER, eastFace);
    }
  }
  // low clumps of planting on the roof
  {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const flat = ico.index ? ico.toNonIndexed() : ico;
    const p = flat.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 18; i++) {
      const a = deg.east + 0.3 + rand() * (deg.west - deg.east - 0.6);
      const outer = a > deg.portal ? r.cover : r.north;
      const rad = r.south + 1.6 + rand() * (outer - r.south - 3.2);
      const [cx, cy, cz] = at(rad, a, H);
      const [sx, sy, sz] = [(1 + rand() * 1.4) * U, (0.35 + rand() * 0.45) * U, (1 + rand() * 1.4) * U];
      const color = VINES[Math.floor(rand() * VINES.length)];
      const pt = (j: number): V3 => [cx + p.getX(j) * sx, cy + Math.max(p.getY(j), -0.2) * sy, cz + p.getZ(j) * sz];
      for (let j = 0; j < p.count; j += 3) {
        const [v0, v1, v2] = [pt(j), pt(j + 1), pt(j + 2)];
        const centre: V3 = [(v0[0] + v1[0] + v2[0]) / 3 - cx, (v0[1] + v1[1] + v2[1]) / 3 - cy, (v0[2] + v1[2] + v2[2]) / 3 - cz];
        solid.tri(v0, v1, v2, color, centre);
      }
    }
    flat.dispose();
    ico.dispose();
  }

  // ── the way in under the house: dark, from the portal to just inside its west wall ──
  const back = deg.west - (0.15 / r.cover) * (180 / Math.PI);
  arcBand(r.north, wallR, deg.portal, back, -RAMP_DEPTH_M, TUNNEL.floor, UP);
  arcBand(r.north, wallR, deg.portal, back, open, TUNNEL.ceiling, DOWN);
  arcFace(r.north, deg.portal, back, -RAMP_DEPTH_M, open, TUNNEL.side, outward);
  arcFace(wallR, deg.portal, back, -RAMP_DEPTH_M, open, TUNNEL.side, (m) => neg(outward(m)));
  radialFace(back, r.north, wallR, -RAMP_DEPTH_M, open, TUNNEL.side, neg(westward(back)), lit);
  arcBand((r.north + wallR) / 2 - 0.5, (r.north + wallR) / 2 + 0.5, deg.portal + 0.05, back, open - 0.03, TUNNEL.ceiling, DOWN, lit);

  // ── the white walls along the ramp ──
  const { wall, wallOut, inner, innerOut, depth, climb, inner0, east } = BASEMENT_RAMP;
  const { thick, parapet } = BASEMENT_WALL_M;
  const T = thick * U;
  const smooth = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  };
  /** A wall along `line` (world) from section `k0` to `k1`, `out` its normals away from the ramp. */
  const rampWall = (line: World[], out: World[], k0: number, k1: number, top: (k: number) => number) => {
    const P = (k: number, o: number, y: number): V3 => [line[k][0] + out[k][0] * o, y, line[k][1] + out[k][1] * o];
    const bottom = (k: number) => -depth[k] - 0.25 * U;
    for (let k = k0; k < k1; k++) {
      const face: V3 = [-out[k][0], 0, -out[k][1]];
      solid.quad(P(k, 0, bottom(k)), P(k + 1, 0, bottom(k + 1)), P(k + 1, 0, top(k + 1)), P(k, 0, top(k)), WALL_WHITE, face);
      solid.quad(P(k, T, bottom(k)), P(k + 1, T, bottom(k + 1)), P(k + 1, T, top(k + 1)), P(k, T, top(k)), WALL_WHITE, neg(face));
      solid.quad(P(k, 0, top(k)), P(k + 1, 0, top(k + 1)), P(k + 1, T, top(k + 1)), P(k, T, top(k)), WALL_WHITE, UP);
    }
    // its end toward the road
    const along: V3 = [line[k0][0] - line[k0 + 1][0], 0, line[k0][1] - line[k0 + 1][1]];
    solid.quad(P(k0, 0, bottom(k0)), P(k0, T, bottom(k0)), P(k0, T, top(k0)), P(k0, 0, top(k0)), WALL_WHITE, along);
  };
  // north of the ramp: it holds up the paved way, and stands a parapet above it, no higher than the house at the portal
  rampWall(wall, wallOut, 0, wall.length - 1, (k) => Math.min(climb[k] + parapet * U, H * U));
  // inside the bend, up to the house: a parapet above the brick walk, rising as the floor goes down
  rampWall(inner, innerOut, inner0, east, (k) => (parapet * smooth(depth[k] / U / 0.6) + 0.03) * U);

  return { solid: solid.geometry(), lit: lit.geometry() };
}

/** The white house at the terrace's east end, the ramp's white walls and the dark way in. `glow` lights the way in at dusk and night. */
export function Basement({ glow }: { glow: number }) {
  const { solid, lit } = useMemo(buildBasement, []);
  useEffect(
    () => () => {
      solid.dispose();
      lit.dispose();
    },
    [solid, lit],
  );
  return (
    <>
      <mesh geometry={solid} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh geometry={lit}>
        <meshStandardMaterial color="#3a3936" roughness={0.8} emissive="#ffd59a" emissiveIntensity={glow * 0.3} />
      </mesh>
    </>
  );
}
