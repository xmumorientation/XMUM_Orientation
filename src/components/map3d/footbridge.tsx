"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { BASIN_D, BRIDGE, COLORS, UNITS_PER_M } from "./geo";
import { groundY } from "./terrain";

// The red footbridge across the lake's waist (OSM's line), as in Ben's photo (2026-11-02): a gentle arch paved in
// red brick like the walks it joins, with red lattice railings whose handrails sweep down at the ends, on two stone
// piers in the water. Its ends rest on the banks (terrain.ts), so the arch starts from the ground at each end. One
// mesh.

/** World units: deck width and thickness, the arch's rise, the railings' height and lattice bay, the piers (0..1). */
const SPAN = {
  width: 0.62,
  slab: 0.09,
  rise: 2 * UNITS_PER_M,
  rail: 0.19,
  bay: 0.3,
  piers: [0.4, 0.53],
};
const RED = "#c8232c";
const FASCIA = "#b01e27";
const STONE = "#d9d1c3";

/** A flat-coloured, non-indexed copy of `g` with no uv or normals (the merged mesh gets its own), ready to merge. */
export function paint(g: THREE.BufferGeometry, color: string) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of ["uv", "normal"]) if (out.getAttribute(name)) out.deleteAttribute(name);
  const c = new THREE.Color(color);
  const n = out.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

/** A square bar `t` thick from p to q. */
export function bar(p: THREE.Vector3, q: THREE.Vector3, t: number, color: string) {
  const d = new THREE.Vector3().subVectors(q, p);
  const g = new THREE.BoxGeometry(d.length(), t, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return paint(g, color);
}

function footbridgeGeometry() {
  const [[ax, az], [bx, bz]] = BRIDGE;
  const len = Math.hypot(bx - ax, bz - az);
  const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
  const [sx, sz] = [-dz, dx];
  const [ya, yb] = [groundY(ax, az), groundY(bx, bz)];
  /** The deck's top at `s` along the bridge: from bank to bank, arched. */
  const deckY = (s: number) => ya + ((yb - ya) * s) / len + SPAN.rise * Math.sin((Math.PI * s) / len) + 0.01;
  const at = (s: number, off: number, y: number) => new THREE.Vector3(ax + dx * s + sx * off, y, az + dz * s + sz * off);
  const parts: THREE.BufferGeometry[] = [];

  // the deck: paving on top, red fascia along the sides, its underside
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const quad = (p: THREE.Vector3[], color: string, facing: THREE.Vector3) => {
    const [a, b, cc, d] = p;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a));
    const order = n.dot(facing) < 0 ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d];
    c.set(color);
    for (const v of order) {
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
  };
  const w = SPAN.width / 2;
  const n = 48;
  const up = new THREE.Vector3(0, 1, 0);
  const left = new THREE.Vector3(sx, 0, sz);
  const right = left.clone().negate();
  for (let i = 0; i < n; i++) {
    const [s0, s1] = [(len * i) / n, (len * (i + 1)) / n];
    const [y0, y1] = [deckY(s0), deckY(s1)];
    const top = [at(s0, w, y0), at(s1, w, y1), at(s1, -w, y1), at(s0, -w, y0)];
    const bot = [at(s0, w, y0 - SPAN.slab), at(s1, w, y1 - SPAN.slab), at(s1, -w, y1 - SPAN.slab), at(s0, -w, y0 - SPAN.slab)];
    quad(top, COLORS.path, up);
    quad(bot, FASCIA, up.clone().negate());
    quad([top[0], top[1], bot[1], bot[0]], FASCIA, left);
    quad([top[3], top[2], bot[2], bot[3]], FASCIA, right);
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  deck.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  parts.push(deck);

  // the railings: posts, a handrail and a bottom rail, and a diagonal lattice between them; the handrail sweeps
  // down over the last few metres at each end
  const railH = (s: number) => {
    const k = Math.min(1, Math.min(s, len - s) / 0.8);
    return SPAN.rail * (0.35 + 0.65 * k * k * (3 - 2 * k));
  };
  const bays = Math.round(len / SPAN.bay);
  for (const off of [w - 0.02, -w + 0.02]) {
    for (let i = 0; i <= bays; i++) {
      const s0 = (len * i) / bays;
      const b0 = at(s0, off, deckY(s0));
      const t0 = at(s0, off, deckY(s0) + railH(s0));
      parts.push(bar(b0, t0, 0.035, RED));
      if (i === bays) break;
      const s1 = (len * (i + 1)) / bays;
      const b1 = at(s1, off, deckY(s1));
      const t1 = at(s1, off, deckY(s1) + railH(s1));
      parts.push(bar(t0, t1, 0.045, RED), bar(b0, b1, 0.03, RED), bar(b0, t1, 0.02, RED), bar(t0, b1, 0.02, RED));
    }
  }

  // two stone piers under the arch, standing on the lakebed
  for (const t of SPAN.piers) {
    const s = t * len;
    const top = deckY(s) - SPAN.slab;
    const pier = new THREE.BoxGeometry(0.16, top + BASIN_D, SPAN.width * 0.92);
    pier.rotateY(-Math.atan2(dz, dx)).translate(ax + dx * s, (top - BASIN_D) / 2, az + dz * s);
    parts.push(paint(pier, STONE));
  }

  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

/** The red footbridge across the lake. */
export function Bridge() {
  const geo = useMemo(footbridgeGeometry, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.7} />
    </mesh>
  );
}
