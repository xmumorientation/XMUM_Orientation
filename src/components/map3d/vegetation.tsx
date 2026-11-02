"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { groundY } from "./terrain";
import { bushes, campusTrees, lamps, plantation, thinForLite, walkPlanting, type HedgeRun, type Plant } from "./plants";
import { makeGlow } from "./textures";

// DRAFT: tropical planting. Rain trees and coconut palms on campus, pink
// trumpet trees along the walkways, oil palms in the estate around it,
// bougainvillea along the paths, clipped hedges along the walkways, and
// street lamps. Each kind is one instanced
// mesh (the hedges are one plain mesh).

/** Non-indexed copy with a flat vertex colour and no uv, ready to merge. */
function colored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Nudge vertices by a hash of their position (shared corners move together). */
function jitter(g: THREE.BufferGeometry, amount: number) {
  const p = g.getAttribute("position");
  const h = (x: number) => {
    const s = Math.sin(x) * 43758.5453;
    return s - Math.floor(s) - 0.5;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = x * 12.9898 + y * 78.233 + z * 37.719;
    p.setXYZ(i, x + h(k) * amount, y + h(k + 1.7) * amount, z + h(k + 3.1) * amount);
  }
  g.computeVertexNormals();
  return g;
}

function frond(top: THREE.Vector3, angle: number, length: number, lift: number, droop: number, width: number) {
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  const seg = 6;
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    const c = top
      .clone()
      .addScaledVector(dir, s * length)
      .add(new THREE.Vector3(0, lift * s - droop * s * s, 0));
    const w = width * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.05)) + 0.02;
    const edge = new THREE.Vector3(0, -0.35 * w, 0);
    rows.push([c.clone().addScaledVector(side, w).add(edge), c, c.clone().addScaledVector(side, -w).add(edge)]);
  }
  const pos: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
    pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
  for (let i = 0; i < seg; i++) {
    quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
    quad(rows[i][1], rows[i][2], rows[i + 1][2], rows[i + 1][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function rainTreeGeometry() {
  const trunk = colored(new THREE.CylinderGeometry(0.14, 0.22, 1.4, 6).translate(0, 0.7, 0), "#6b4a2f");
  const blob = (r: number, x: number, y: number, z: number, sy: number, color: string) =>
    colored(jitter(new THREE.IcosahedronGeometry(r, 1).scale(1.3, sy, 1.3).translate(x, y, z), 0.12), color);
  return mergeGeometries([
    trunk,
    blob(1, 0, 1.95, 0, 0.62, "#3f8f3b"),
    blob(0.7, 0.65, 1.75, 0.35, 0.7, "#357f34"),
    blob(0.66, -0.6, 1.85, -0.4, 0.7, "#2f7530"),
  ])!;
}

/** A pink trumpet tree in bloom: a slimmer trunk and a rounded crown, mostly flowers with some leaves. */
function trumpetTreeGeometry() {
  const trunk = colored(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 6).translate(0, 0.75, 0), "#6e5241");
  const blob = (r: number, x: number, y: number, z: number, sy: number, color: string) =>
    colored(jitter(new THREE.IcosahedronGeometry(r, 1).scale(1.15, sy, 1.15).translate(x, y, z), 0.11), color);
  return mergeGeometries([
    trunk,
    blob(0.9, 0, 2.05, 0, 0.75, "#ec8fbf"),
    blob(0.62, 0.55, 1.85, 0.3, 0.8, "#f4b3d2"),
    blob(0.58, -0.5, 1.9, -0.35, 0.8, "#5f9a45"),
    blob(0.5, -0.1, 2.45, 0.45, 0.8, "#e07aae"),
  ])!;
}

function palmGeometry(kind: "palm" | "oil") {
  const parts: THREE.BufferGeometry[] = [];
  let top: THREE.Vector3;
  if (kind === "palm") {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.15, 2.6, 0),
      new THREE.Vector3(0.6, 4.8, 0),
    );
    parts.push(colored(new THREE.TubeGeometry(curve, 8, 0.13, 6, false), "#8a7458"));
    top = new THREE.Vector3(0.6, 4.8, 0);
    parts.push(colored(new THREE.IcosahedronGeometry(0.22, 0).translate(0.6, 4.65, 0), "#6b5a2a"));
  } else {
    parts.push(colored(new THREE.CylinderGeometry(0.26, 0.36, 1.5, 7).translate(0, 0.75, 0), "#5e4a34"));
    top = new THREE.Vector3(0, 1.45, 0);
  }
  const n = kind === "palm" ? 9 : 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
    const f =
      kind === "palm"
        ? frond(top, a, 2.5, 0.7, 1.9, 0.32)
        : frond(top, a, 2.2 + (i % 3) * 0.2, 1.4, 1.5 + (i % 2) * 0.3, 0.28);
    parts.push(colored(f, kind === "palm" ? (i % 2 ? "#4e9a3c" : "#3f8a35") : i % 2 ? "#2f6b2a" : "#3a7a30"));
  }
  return mergeGeometries(parts)!;
}

function PlantInstances({
  items,
  geometry,
  castShadow,
}: {
  items: Plant[];
  geometry: THREE.BufferGeometry;
  castShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    items.forEach((t, i) => {
      e.set(0, t.rot, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(t.x, groundY(t.x, t.z), t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      ref.current!.setMatrixAt(i, m);
      const v = 0.85 + ((i * 37) % 11) / 30;
      c.setRGB(v * 0.97, v, v * 0.92);
      ref.current!.setColorAt(i, c);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/** `lite`: fewer trees and no tree shadows (phones). */
export function Vegetation({ lite = false }: { lite?: boolean }) {
  const trees = useMemo(() => (lite ? thinForLite(campusTrees()) : campusTrees()), [lite]);
  const broad = useMemo(() => trees.filter((t) => t.kind === "broad"), [trees]);
  const palms = useMemo(() => trees.filter((t) => t.kind === "palm"), [trees]);
  const trumpets = useMemo(() => trees.filter((t) => t.kind === "trumpet"), [trees]);
  const oil = useMemo(() => (lite ? thinForLite(plantation()) : plantation()), [lite]);
  const shadows = !lite;
  const rainGeo = useMemo(rainTreeGeometry, []);
  const palmGeo = useMemo(() => palmGeometry("palm"), []);
  const trumpetGeo = useMemo(trumpetTreeGeometry, []);
  const oilGeo = useMemo(() => palmGeometry("oil"), []);
  return (
    <>
      <PlantInstances items={broad} geometry={rainGeo} castShadow={shadows} />
      <PlantInstances items={palms} geometry={palmGeo} castShadow={shadows} />
      <PlantInstances items={trumpets} geometry={trumpetGeo} castShadow={shadows} />
      <PlantInstances items={oil} geometry={oilGeo} castShadow={shadows} />
      <Bushes />
      <Hedges castShadow={shadows} />
    </>
  );
}

/** A clipped hedge's cross-section (world units): half widths at its foot and top, and its height (about 0.9 m). */
const HEDGE = { foot: 0.11, top: 0.075, h: 0.13 };

/**
 * The walkways' hedges (plants.ts walkPlanting) as one mesh: each run a low ribbon, wider at its foot, standing on
 * the ground (the lake's banks included), with closed ends.
 */
function hedgeGeometry(runs: HedgeRun[]) {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, facing: THREE.Vector3, tint: THREE.Color) => {
    v.subVectors(b, a);
    w.subVectors(cc, a);
    const flip = v.cross(w).dot(facing) < 0;
    for (const p of flip ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d]) {
      pos.push(p.x, p.y, p.z);
      col.push(tint.r, tint.g, tint.b);
    }
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (const run of runs) {
    // corners at each point: foot and top on the left, top and foot on the right
    const rings = run.map(([x, z], i) => {
      const [ax, az] = run[Math.max(0, i - 1)];
      const [bx, bz] = run[Math.min(run.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const y = groundY(x, z) - 0.02;
      const h = HEDGE.h * (0.9 + 0.2 * Math.abs(Math.sin(x * 7.1 + z * 3.7)));
      return [
        new THREE.Vector3(x + nx * HEDGE.foot, y, z + nz * HEDGE.foot),
        new THREE.Vector3(x + nx * HEDGE.top, y + h, z + nz * HEDGE.top),
        new THREE.Vector3(x - nx * HEDGE.top, y + h, z - nz * HEDGE.top),
        new THREE.Vector3(x - nx * HEDGE.foot, y, z - nz * HEDGE.foot),
        new THREE.Vector3(nx, 0, nz),
      ];
    });
    for (let i = 0; i < rings.length - 1; i++) {
      const [a0, a1, a2, a3, n] = rings[i];
      const [b0, b1, b2, b3] = rings[i + 1];
      const shade = 0.85 + 0.3 * Math.abs(Math.sin(i * 1.7 + run[0][0] * 5));
      c.set("#2f6e2c").multiplyScalar(shade);
      quad(a0, b0, b1, a1, n, c);
      quad(a3, b3, b2, a2, n.clone().negate(), c);
      quad(a1, b1, b2, a2, up, c.clone().offsetHSL(0, 0, 0.04));
    }
    // the ends
    for (const [k, out] of [
      [0, -1],
      [rings.length - 1, 1],
    ] as const) {
      const [a0, a1, a2, a3] = rings[k];
      const [p, q] = [run[Math.max(0, k - 1)], run[Math.min(run.length - 1, k + 1)]];
      const facing = new THREE.Vector3(q[0] - p[0], 0, q[1] - p[1]).multiplyScalar(out);
      quad(a0, a1, a2, a3, facing, c.set("#2f6e2c"));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function Hedges({ castShadow }: { castShadow: boolean }) {
  const geo = useMemo(() => hedgeGeometry(walkPlanting().hedges), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.9} />
    </mesh>
  );
}

function Bushes() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = bushes();
  const geo = useMemo(
    () => jitter(new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed().scale(1, 0.75, 1).translate(0, 0.3, 0), 0.1),
    [],
  );
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    items.forEach((b, i) => {
      m.makeScale(b.s, b.s, b.s).setPosition(b.x, groundY(b.x, b.z), b.z);
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, c.set(b.color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow receiveShadow>
      <meshStandardMaterial flatShading roughness={0.85} />
    </instancedMesh>
  );
}

/** Street lamps. `glow` 0 = off (day), higher = brighter (dusk, night). */
export function Lamps({ glow }: { glow: number }) {
  const items = lamps();
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const glowTex = useMemo(makeGlow, []);
  const geo = useMemo(
    () => ({
      pole: new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6).translate(0, 1.3, 0),
      head: new THREE.SphereGeometry(0.2, 10, 8).translate(0, 2.7, 0),
      pool: new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2).translate(0, 0.05, 0),
    }),
    [],
  );
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const e = 0.2;
    items.forEach((l, i) => {
      const y = groundY(l.x, l.z);
      m.makeScale(l.s, l.s, l.s).setPosition(l.x, y, l.z);
      poles.current!.setMatrixAt(i, m);
      heads.current!.setMatrixAt(i, m);
      // the light's pool lies on the ground, sloping with it on banks; small lamps light a little more than their size
      n.set(groundY(l.x - e, l.z) - groundY(l.x + e, l.z), 2 * e, groundY(l.x, l.z - e) - groundY(l.x, l.z + e)).normalize();
      const pool = Math.max(l.s, 0.5);
      m.compose(new THREE.Vector3(l.x, y, l.z), q.setFromUnitVectors(up, n), new THREE.Vector3(pool, pool, pool));
      pools.current!.setMatrixAt(i, m);
    });
    for (const r of [poles, heads, pools]) r.current!.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <>
      <instancedMesh ref={poles} args={[geo.pole, undefined, items.length]} castShadow>
        <meshStandardMaterial color="#2e2f36" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geo.head, undefined, items.length]}>
        <meshStandardMaterial color="#fff4dc" emissive="#ffc46b" emissiveIntensity={glow} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[geo.pool, undefined, items.length]} visible={glow > 0} renderOrder={2}>
        <meshBasicMaterial
          map={glowTex}
          transparent
          opacity={Math.min(0.75, glow * 0.16)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
