"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FunfairStyleProps } from "./FunfairLab";

// DRAFT: funfair ride style B, "Retro carnival" (see FunfairLab.tsx).
// Cream, red and teal painted wood and metal, striped canvas, rows of warm
// round bulbs and an ornate carousel top, with Vortexa yellow, pink and cyan
// as the accent colours. 1 unit = 1 m.
//
// Draw calls: every piece is one merged vertex-coloured mesh per moving part,
// plus one instanced mesh for its bulbs and one for its neon tubes (about 25
// in all, before shadows). Off = paint fades to dark grey, bulbs and tubes are
// dark glass; on = bulbs switch on one after another, then the rides move.

// ---------------------------------------------------------------- palette

const P = {
  cream: "#f1e3c4",
  red: "#bc071d",
  teal: "#127a78",
  gold: "#d9a93f",
  navy: "#063a65",
  wood: "#a8733f",
  dark: "#1a1420",
  grey: "#6d7079",
  yellow: "#f2ff0b",
  pink: "#fe06ab",
  cyan: "#0dfcfd",
  lilac: "#e0b4fc",
  orange: "#fc9e3d",
  warm: "#ffc978",
};
const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);
const WARM = col(P.warm);
const ACCENTS = [col(P.yellow), col(P.pink), col(P.cyan)];
/** Mostly warm fairground bulbs, every fourth one a Vortexa accent. */
const bulbCol = (i: number) => (i % 4 === 3 ? ACCENTS[(i >> 2) % 3] : WARM);

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
type V3 = [number, number, number];

// ---------------------------------------------------------------- builders

/** Collects painted parts (one colour each) and merges them into one vertex-coloured geometry. */
class Painter {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
    const gg = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(gg.attributes)) if (k !== "position" && k !== "normal" && k !== "color") gg.deleteAttribute(k);
    gg.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(1, 1, 1)));
    if (color !== null || !gg.getAttribute("color")) {
      const c = col(color ?? "#ffffff");
      const n = gg.getAttribute("position").count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.toArray(a, i * 3);
      gg.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    if (!gg.getAttribute("normal")) gg.computeVertexNormals();
    this.parts.push(gg);
    return this;
  }
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: V3, rot?: V3) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }
  cyl(rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, pos: V3, rot?: V3) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot);
  }
  ball(r: number, color: THREE.ColorRepresentation, pos: V3) {
    return this.add(new THREE.SphereGeometry(r, 10, 6), color, pos);
  }
  /** A round bar from a to b. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 6) {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-4) return this;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len)));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(g, color);
  }
  build() {
    return this.parts.length ? mergeGeometries(this.parts)! : null;
  }
}

/** Raw triangles with a flat colour per face (striped canvas, scallops, pennants). */
class Tris {
  pos: number[] = [];
  cols: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.ColorRepresentation) {
    const k = col(color);
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.cols.push(k.r, k.g, k.b);
    }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.ColorRepresentation) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  /** A striped cone or band around the Y axis, from radius r0 at y0 to r1 at y1. */
  cone(n: number, r0: number, y0: number, r1: number, y1: number, colors: THREE.ColorRepresentation[], phase = 0) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + phase;
      const b = ((k + 1) / n) * TAU + phase;
      this.quad(
        V(r0 * Math.cos(a), y0, r0 * Math.sin(a)),
        V(r0 * Math.cos(b), y0, r0 * Math.sin(b)),
        V(r1 * Math.cos(b), y1, r1 * Math.sin(b)),
        V(r1 * Math.cos(a), y1, r1 * Math.sin(a)),
        colors[k % colors.length],
      );
    }
  }
  /** Hanging scallops round a circle. */
  valance(n: number, r: number, y: number, depth: number, colors: THREE.ColorRepresentation[]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const b = ((k + 1) / n) * TAU;
      const m = (a + b) / 2;
      this.tri(V(r * Math.cos(a), y, r * Math.sin(a)), V(r * Math.cos(b), y, r * Math.sin(b)), V(r * Math.cos(m), y - depth, r * Math.sin(m)), colors[k % colors.length]);
    }
  }
  /** A triangular pennant on a pole at p, pointing along +x (rotate the result to aim it). */
  pennant(p: THREE.Vector3, len: number, h: number, color: THREE.ColorRepresentation) {
    this.tri(p, V(p.x, p.y - h, p.z), V(p.x + len, p.y - h / 2 - h * 0.15, p.z), color);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.cols, 3));
    g.computeVertexNormals();
    return g;
  }
}

type Inst = { m: THREE.Matrix4; c: THREE.Color };

/** Painted parts plus bulbs and neon tubes for one piece (or one moving part of it). */
class Kit {
  paint = new Painter();
  bulbs: Inst[] = [];
  tubes: Inst[] = [];
  bulb(p: THREE.Vector3, c: THREE.Color, r = 0.16) {
    this.bulbs.push({ m: new THREE.Matrix4().compose(p, new THREE.Quaternion(), V(r, r, r)), c });
  }
  tube(a: THREE.Vector3, b: THREE.Vector3, r: number, c: THREE.Color) {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
    this.tubes.push({ m: new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(r, len + r * 1.2, r)), c });
  }
  line(pts: THREE.Vector3[], r: number, c: THREE.Color | ((i: number) => THREE.Color), closed = false) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) this.tube(pts[i], pts[(i + 1) % pts.length], r, typeof c === "function" ? c(i) : c);
  }
  /** Bulbs every `step` metres along a polyline. */
  beads(pts: THREE.Vector3[], step: number, r = 0.16, c: (i: number) => THREE.Color = bulbCol, closed = false) {
    const path = closed ? [...pts, pts[0]] : pts;
    let carry = 0;
    let n = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const len = a.distanceTo(b);
      let s = carry;
      while (s <= len) {
        this.bulb(a.clone().lerp(b, s / len), c(n++), r);
        s += step;
      }
      carry = s - len;
    }
  }
}

const circle = (n: number, r: number, y: number, z0 = false) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    return z0 ? V(r * Math.cos(a), r * Math.sin(a), y) : V(r * Math.cos(a), y, r * Math.sin(a));
  });

/** A sagging string from a to b. */
const sagLine = (a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 16) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
  });

// Neon letters as strokes on a 4 x 6 grid.
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
};

/** Neon text centred on x = 0, baseline at y, on the plane z. */
function neonText(kit: Kit, text: string, h: number, y: number, z: number, r: number, c: (i: number) => THREE.Color) {
  const s = h / 6;
  const adv = (ch: string) => (ch === " " ? 2.6 : 5.4) * s;
  const width = [...text].reduce((w, ch) => w + adv(ch), 0) - 1.4 * s;
  let x = -width / 2;
  [...text].forEach((ch, i) => {
    for (const stroke of GLYPHS[ch] ?? []) kit.line(stroke.map(([gx, gy]) => V(x + gx * s, y + gy * s, z)), r, c(i));
    x += adv(ch);
  });
}

// ---------------------------------------------------------------- materials

type Uniforms = Record<"lvl" | "time" | "chase" | "off" | "bulbK" | "neonK", { value: number }>;
type Mats = ReturnType<typeof makeMats>;

function makeGlow(u: Uniforms, k: "bulbK" | "neonK", chase: boolean) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.uLvl = u.lvl;
    s.uniforms.uTime = u.time;
    s.uniforms.uChase = u.chase;
    s.uniforms.uOnK = u[k];
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vIdx;\nvarying float vRnd;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIdx = float(gl_InstanceID);\nvRnd = fract(sin(vIdx * 12.9898) * 43758.5453);");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uLvl;\nuniform float uTime;\nuniform float uChase;\nuniform float uOnK;\nvarying float vIdx;\nvarying float vRnd;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float onI = clamp((uLvl - vRnd * 0.6) / 0.4, 0.0, 1.0);
        float ph = mod(floor(vIdx + 0.5) - floor(uTime * 4.0), 3.0);
        float chase = ${chase ? "mix(1.0, ph < 0.5 ? 1.45 : 0.82, uChase)" : "1.0"};
        vec3 offC = vec3(0.05, 0.05, 0.058) + diffuseColor.rgb * 0.035;
        diffuseColor.rgb = mix(offC, diffuseColor.rgb * uOnK * chase, onI);`,
      );
  };
  m.customProgramCacheKey = () => `ffB-glow-${k}-${chase}`;
  return m;
}

function makePoolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeMats() {
  const u: Uniforms = { lvl: { value: 0 }, time: { value: 0 }, chase: { value: 0 }, off: { value: 1 }, bulbK: { value: 1.5 }, neonK: { value: 1.3 } };
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
  // powered off: the paint fades to dark grey metal
  paint.onBeforeCompile = (s) => {
    s.uniforms.uOff = u.off;
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uOff;").replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float fLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045 + fLum * 0.3), uOff);`,
    );
  };
  paint.customProgramCacheKey = () => "ffB-paint";
  const pool = new THREE.MeshBasicMaterial({ map: makePoolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  return {
    u,
    paint,
    bulb: makeGlow(u, "bulbK", true),
    neon: makeGlow(u, "neonK", false),
    lamp: new THREE.MeshBasicMaterial({ toneMapped: false, color: "#400" }),
    pool,
    bulbGeo: new THREE.SphereGeometry(1, 6, 4),
    tubeGeo: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
    poolGeo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  };
}

type Anim = { lvl: number; motion: number; wheel: number; carousel: number; t: number };

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c);
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Renders a Kit: one painted mesh, one bulb mesh, one neon mesh. */
function KitMeshes({ kit, mats, shadow = true }: { kit: Kit; mats: Mats; shadow?: boolean }) {
  const o = useMemo(
    () => ({
      paint: kit.paint.build(),
      bulbs: kit.bulbs.length ? instanced(mats.bulbGeo, mats.bulb, kit.bulbs) : null,
      tubes: kit.tubes.length ? instanced(mats.tubeGeo, mats.neon, kit.tubes) : null,
    }),
    [kit, mats],
  );
  return (
    <>
      {o.paint && <mesh geometry={o.paint} material={mats.paint} castShadow={shadow} receiveShadow />}
      {o.bulbs && <primitive object={o.bulbs} />}
      {o.tubes && <primitive object={o.tubes} />}
    </>
  );
}

// ---------------------------------------------------------------- Ferris wheel

const W_R = 17.5; // rim radius
const W_H = 22; // hub height
const W_Z = 1.6; // half the gap between the two rims
const W_N = 16; // gondolas

function buildWheelStatic() {
  const k = new Kit();
  const p = k.paint;
  p.box(27, 1, 12, P.teal, [0, 0.5, 0]).box(27.4, 0.25, 12.4, P.cream, [0, 1.05, 0]);
  p.box(6, 0.5, 2, P.cream, [0, 0.25, 7]);
  // A-frame legs and braces
  for (const z of [-2.7, 2.7]) {
    const zz = z * 0.92;
    p.rod(V(-10.5, 1, z), V(0, W_H, zz), 0.42, P.cream, 8).rod(V(10.5, 1, z), V(0, W_H, zz), 0.42, P.cream, 8);
    p.rod(V(-7.5, 7, z * 0.97), V(7.5, 7, z * 0.97), 0.2, P.red).rod(V(-4.3, 13, z * 0.95), V(4.3, 13, z * 0.95), 0.2, P.red);
    p.rod(V(-7.5, 7, z * 0.97), V(4.3, 13, z * 0.95), 0.12, P.red).rod(V(7.5, 7, z * 0.97), V(-4.3, 13, z * 0.95), 0.12, P.red);
    p.box(1.6, 0.8, 1.6, P.red, [-10.5, 1.4, z]).box(1.6, 0.8, 1.6, P.red, [10.5, 1.4, z]);
    // bulbs up the front edge of each leg
    k.beads([V(-10.5, 1.6, z + Math.sign(z) * 0.45), V(0, W_H - 1, zz + Math.sign(z) * 0.45)], 0.9);
    k.beads([V(10.5, 1.6, z + Math.sign(z) * 0.45), V(0, W_H - 1, zz + Math.sign(z) * 0.45)], 0.9);
  }
  p.rod(V(0, W_H, -3.3), V(0, W_H, 3.3), 0.55, P.gold, 10);
  // two food stalls and a ticket booth (LY3 has the restaurant icon)
  for (const sx of [-1, 1]) {
    const x = sx * 10;
    const z = 9.5;
    p.box(4, 1.1, 2, P.cream, [x, 0.55, z]).box(4.1, 0.2, 2.1, P.red, [x, 1.15, z]);
    p.box(3.8, 2.6, 0.2, P.teal, [x, 1.3, z - 1]);
    for (const dx of [-1.9, 1.9]) p.rod(V(x + dx, 0, z + 0.9), V(x + dx, 2.9, z + 0.9), 0.07, P.gold);
    const t = new Tris();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = x - 2.2 + (4.4 * i) / n;
      const x1 = x - 2.2 + (4.4 * (i + 1)) / n;
      t.quad(V(x0, 3.2, z - 1.2), V(x1, 3.2, z - 1.2), V(x1, 2.6, z + 1.4), V(x0, 2.6, z + 1.4), i % 2 ? P.cream : P.red);
      t.tri(V(x0, 2.6, z + 1.4), V(x1, 2.6, z + 1.4), V((x0 + x1) / 2, 2.25, z + 1.4), i % 2 ? P.yellow : P.pink);
    }
    p.add(t.geo(), null);
    k.beads([V(x - 2.1, 2.5, z + 1.45), V(x + 2.1, 2.5, z + 1.45)], 0.42, 0.11);
  }
  p.box(1.8, 2.3, 1.6, P.red, [0, 2.15, 5]).box(2.2, 0.3, 2, P.cream, [0, 3.45, 5]).cyl(0, 1.3, 0.8, 4, P.yellow, [0, 4, 5], [0, Math.PI / 4, 0]);
  return k;
}

function buildWheelRotor() {
  const k = new Kit();
  const p = k.paint;
  for (const z of [-W_Z, W_Z]) {
    p.add(new THREE.TorusGeometry(W_R, 0.36, 6, 96), P.cream, [0, 0, z]);
    p.add(new THREE.TorusGeometry(W_R * 0.55, 0.22, 5, 64), P.red, [0, 0, z]);
    for (let i = 0; i < W_N; i++) {
      const a = (i / W_N) * TAU;
      const b = ((i + 1) / W_N) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.rod(V(ca * 1.6, sa * 1.6, z), V(ca * W_R, sa * W_R, z), 0.12, P.cream);
      p.rod(V(ca * W_R, sa * W_R, z), V(Math.cos(b) * W_R * 0.55, Math.sin(b) * W_R * 0.55, z), 0.08, P.cream);
      // spoke bulbs on both faces
      const zf = z + Math.sign(z) * 0.18;
      k.beads([V(ca * 2.6, sa * 2.6, zf), V(ca * (W_R - 1.2), sa * (W_R - 1.2), zf)], 2.2, 0.17, (n) => (n === 6 ? ACCENTS[i % 3] : WARM));
    }
    const zf = z + Math.sign(z) * 0.3;
    k.beads(circle(96, W_R + 0.42, zf, true), (TAU * (W_R + 0.42)) / 96, 0.17, bulbCol, true);
    k.line(circle(64, W_R * 0.55, z + Math.sign(z) * 0.28, true), 0.09, col(P.pink), true);
    k.line(circle(96, W_R - 0.55, z + Math.sign(z) * 0.22, true), 0.08, col(P.cyan), true);
    // hub sunburst
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.tube(V(Math.cos(a) * 2.1, Math.sin(a) * 2.1, z + Math.sign(z) * 0.5), V(Math.cos(a) * 4.2, Math.sin(a) * 4.2, z + Math.sign(z) * 0.3), 0.08, col(i % 2 ? P.yellow : P.orange));
    }
  }
  for (let i = 0; i < W_N; i++) {
    const a = (i / W_N) * TAU;
    p.rod(V(Math.cos(a) * W_R, Math.sin(a) * W_R, -W_Z), V(Math.cos(a) * W_R, Math.sin(a) * W_R, W_Z), 0.1, P.gold);
  }
  p.cyl(1.9, 1.9, 4.2, 16, P.gold, [0, 0, 0], [Math.PI / 2, 0, 0]);
  p.cyl(1.2, 2.0, 0.5, 16, P.red, [0, 0, 2.35], [Math.PI / 2, 0, 0]).cyl(2.0, 1.2, 0.5, 16, P.red, [0, 0, -2.35], [Math.PI / 2, 0, 0]);
  p.cyl(0.8, 0.8, 5.4, 12, P.yellow, [0, 0, 0], [Math.PI / 2, 0, 0]);
  return k;
}

function buildGondola() {
  const p = new Painter();
  p.rod(V(0, 0.15, 0), V(0, -0.75, 0), 0.07, P.gold);
  const t = new Tris();
  t.cone(8, 0.05, -0.6, 1.45, -1.3, [P.red, P.cream], Math.PI / 8);
  t.cone(8, 1.45, -1.3, 1.45, -1.5, [P.yellow]);
  p.add(t.geo(), null);
  for (const [x, z] of [[-0.95, -0.7], [0.95, -0.7], [-0.95, 0.7], [0.95, 0.7]]) p.rod(V(x, -1.4, z), V(x, -2.1, z), 0.05, P.gold, 4);
  p.box(2.2, 1.0, 1.7, P.teal, [0, -2.6, 0]).box(2.28, 0.18, 1.78, P.cream, [0, -2.1, 0]).box(2.0, 0.22, 1.5, P.red, [0, -3.2, 0]);
  return p.build()!;
}

function placeGondolas(mesh: THREE.InstancedMesh, angle: number, sway: number, t: number) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = V(1, 1, 1);
  for (let i = 0; i < W_N; i++) {
    const a = (i / W_N) * TAU + angle;
    e.set(0, 0, Math.sin(t * 1.3 + i) * 0.04 * sway);
    m.compose(V(Math.cos(a) * W_R, W_H + Math.sin(a) * W_R, 0), q.setFromEuler(e), s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function FerrisWheel({ mats, anim, pos }: { mats: Mats; anim: Anim; pos: V3 }) {
  const stat = useMemo(buildWheelStatic, []);
  const rotor = useMemo(buildWheelRotor, []);
  const gondolas = useMemo(() => {
    const m = new THREE.InstancedMesh(buildGondola(), mats.paint, W_N);
    m.frustumCulled = false;
    m.castShadow = true;
    placeGondolas(m, 0, 0, 0);
    return m;
  }, [mats]);
  const rotRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rotRef.current) rotRef.current.rotation.z = anim.wheel;
    placeGondolas(gondolas, anim.wheel, anim.motion, anim.t);
  });
  return (
    <group position={pos} rotation-y={Math.PI / 4}>
      <KitMeshes kit={stat} mats={mats} />
      <group ref={rotRef} position={[0, W_H, 0]}>
        <KitMeshes kit={rotor} mats={mats} />
      </group>
      <primitive object={gondolas} />
    </group>
  );
}

// ---------------------------------------------------------------- Carousel

const H_OUT = 10;
const H_IN = 6;

function buildCarouselStatic() {
  const k = new Kit();
  k.paint.cyl(9.1, 9.3, 0.3, 32, P.red, [0, 0.15, 0]).cyl(8.5, 8.7, 0.45, 32, P.cream, [0, 0.52, 0]);
  k.beads(circle(72, 8.75, 0.62), (TAU * 8.75) / 72, 0.12, bulbCol, true);
  return k;
}

function buildCarouselTop() {
  const k = new Kit();
  const p = k.paint;
  p.cyl(7.9, 7.9, 0.3, 32, P.wood, [0, 0.9, 0]);
  const t = new Tris();
  t.cone(32, 7.95, 0.75, 7.95, 1.05, [P.teal]);
  t.cone(12, 1.3, 1.05, 1.3, 6.0, [P.teal, P.gold]); // mirrored centre column
  t.cone(32, 8.05, 6.0, 8.05, 7.3, [P.cream]); // rounding board
  t.cone(32, 8.1, 6.0, 8.1, 6.25, [P.red]);
  t.cone(32, 8.1, 7.05, 8.1, 7.3, [P.gold]);
  t.valance(48, 8.08, 6.0, 0.55, [P.yellow, P.cyan]);
  t.cone(24, 8.45, 7.3, 1.7, 10.0, [P.red, P.cream]); // striped roof
  t.cone(16, 1.7, 10.0, 1.7, 11.0, [P.cream, P.gold]); // cupola
  t.cone(16, 2.0, 11.0, 0.05, 12.5, [P.pink, P.cream]);
  t.valance(16, 2.0, 11.0, 0.35, [P.yellow]);
  t.pennant(V(0, 13.9, 0), 1.6, 0.9, P.pink);
  p.add(t.geo(), null);
  p.cyl(7.95, 7.95, 0.12, 32, P.cream, [0, 6.0, 0]); // ceiling
  p.ball(0.28, P.gold, [0, 12.75, 0]).rod(V(0, 12.4, 0), V(0, 14, 0), 0.05, P.gold);
  // brass poles
  for (let i = 0; i < H_OUT + H_IN; i++) {
    const [r, a] = horseRing(i);
    p.rod(V(r * Math.cos(a), 1.05, -r * Math.sin(a)), V(r * Math.cos(a), 6.0, -r * Math.sin(a)), 0.06, P.gold);
  }
  // bulbs on the rounding board, roof seams and cupola
  k.beads(circle(64, 8.2, 6.42), (TAU * 8.2) / 64, 0.15, bulbCol, true);
  k.beads(circle(64, 8.2, 6.88), (TAU * 8.2) / 64, 0.15, (i) => bulbCol(i + 2), true);
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * TAU;
    const at = (r: number, y: number) => V(r * Math.cos(a), y + 0.18, r * Math.sin(a));
    k.beads([at(8.2, 7.4), at(2.0, 9.9)], 1.3, 0.14, (i) => (i === 0 ? ACCENTS[s % 3] : WARM));
  }
  k.beads(circle(16, 1.78, 10.5), (TAU * 1.78) / 16, 0.12, bulbCol, true);
  k.line(circle(64, 8.5, 7.32), 0.08, col(P.pink), true);
  k.line(circle(64, 7.98, 0.95), 0.07, col(P.cyan), true);
  k.line(circle(24, 1.75, 11.02), 0.06, col(P.yellow), true);
  return k;
}

const horseRing = (i: number): [number, number] => (i < H_OUT ? [6.2, (i / H_OUT) * TAU] : [4.0, ((i - H_OUT + 0.5) / H_IN) * TAU]);

function buildHorse() {
  const p = new Painter();
  p.box(1.5, 0.62, 0.48, P.cream, [0, 0, 0]);
  p.box(0.34, 0.95, 0.34, P.cream, [0.72, 0.45, 0], [0, 0, -0.5]);
  p.box(0.75, 0.3, 0.28, P.cream, [1.1, 0.82, 0], [0, 0, -0.55]);
  p.box(0.1, 0.8, 0.14, P.gold, [0.55, 0.55, 0], [0, 0, -0.5]); // mane
  p.box(0.12, 0.65, 0.12, P.gold, [-0.85, -0.1, 0], [0, 0, 0.7]); // tail
  for (const [x, z, r] of [[0.55, 0.15, 0.7], [0.55, -0.15, 0.45], [-0.55, 0.15, -0.55], [-0.55, -0.15, -0.35]]) {
    p.box(0.13, 0.8, 0.13, P.cream, [x + r * 0.25, -0.62, z], [0, 0, r]);
  }
  p.box(0.6, 0.42, 0.53, P.pink, [-0.05, 0.12, 0]); // blanket
  p.box(0.5, 0.12, 0.55, P.red, [-0.05, 0.36, 0]); // saddle
  return p.build()!;
}

function placeHorses(mesh: THREE.InstancedMesh, t: number, motion: number) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = V(1.1, 1.1, 1.1);
  for (let i = 0; i < H_OUT + H_IN; i++) {
    const [r, a] = horseRing(i);
    const y = 2.6 + Math.sin(t * 2.4 + i * 1.7) * 0.4 * motion + (i % 2 ? 0.25 : -0.25) * (1 - motion);
    q.setFromAxisAngle(UP, a + Math.PI / 2);
    m.compose(V(r * Math.cos(a), y, -r * Math.sin(a)), q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function Carousel({ mats, anim, pos }: { mats: Mats; anim: Anim; pos: V3 }) {
  const stat = useMemo(buildCarouselStatic, []);
  const top = useMemo(buildCarouselTop, []);
  const horses = useMemo(() => {
    const m = new THREE.InstancedMesh(buildHorse(), mats.paint, H_OUT + H_IN);
    m.frustumCulled = false;
    m.castShadow = true;
    placeHorses(m, 0, 0);
    return m;
  }, [mats]);
  const rotRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rotRef.current) rotRef.current.rotation.y = anim.carousel;
    placeHorses(horses, anim.t, anim.motion);
  });
  return (
    <group position={pos}>
      <KitMeshes kit={stat} mats={mats} />
      <group ref={rotRef}>
        <KitMeshes kit={top} mats={mats} />
        <primitive object={horses} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- Big Top

const BT_A = 34; // semi-axes of the Canteen D6 oval
const BT_B = 27;
const BT_WALL = 6.5;
const BT_POLE = 9;
const BT_PEAK = 24;

function btRoof(th: number, s: number) {
  const ex = BT_A * Math.cos(th);
  const ez = BT_B * Math.sin(th);
  const ix = BT_POLE * Math.cos(th);
  const iz = 1.2 * Math.sin(th);
  const u = ix / BT_POLE;
  const ridge = BT_PEAK - 1.8 * (1 - u * u);
  return V(ex + (ix - ex) * s, BT_WALL + (ridge - BT_WALL) * Math.pow(s, 1.7), ez + (iz - ez) * s);
}

function buildBigTop() {
  const k = new Kit();
  const p = k.paint;
  const t = new Tris();
  const N = 48;
  const RINGS = 9;
  const th = (i: number) => (i / N) * TAU;
  const edge = (a: number, y: number, sc = 1) => V(BT_A * sc * Math.cos(a), y, BT_B * sc * Math.sin(a));
  for (let i = 0; i < N; i++) {
    const a = th(i);
    const b = th(i + 1);
    const stripe = i % 2 ? P.cream : P.red;
    for (let j = 0; j < RINGS; j++) {
      const s0 = j / RINGS;
      const s1 = (j + 1) / RINGS;
      t.quad(btRoof(a, s0), btRoof(b, s0), btRoof(b, s1), btRoof(a, s1), stripe);
    }
    t.tri(btRoof(a, 1), btRoof(b, 1), V(0, BT_PEAK - 1.8, 0), P.red);
    t.quad(edge(a, 1.3), edge(b, 1.3), edge(b, BT_WALL), edge(a, BT_WALL), stripe);
    t.quad(edge(a, 0), edge(b, 0), edge(b, 1.3), edge(a, 1.3), P.teal);
  }
  // scalloped valance, with a bulb at every tip
  const NV = 96;
  for (let i = 0; i < NV; i++) {
    const a = (i / NV) * TAU;
    const b = ((i + 1) / NV) * TAU;
    const tip = edge((a + b) / 2, BT_WALL - 1.0, 1.012);
    t.tri(edge(a, BT_WALL + 0.1, 1.012), edge(b, BT_WALL + 0.1, 1.012), tip, i % 2 ? P.yellow : P.pink);
    k.bulb(tip.clone().add(V(0, -0.15, 0)), bulbCol(i), 0.15);
  }
  k.line(Array.from({ length: NV }, (_, i) => edge((i / NV) * TAU, BT_WALL + 0.14, 1.016)), 0.1, col(P.yellow), true);
  // king poles with caps and big flags
  for (const sx of [-1, 1]) {
    const x = sx * BT_POLE;
    p.rod(V(x, BT_PEAK - 2, 0), V(x, BT_PEAK + 3.6, 0), 0.22, P.cream, 8);
    p.cyl(0.25, 1.7, 1.6, 12, P.yellow, [x, BT_PEAK + 0.5, 0]);
    p.ball(0.35, P.gold, [x, BT_PEAK + 3.8, 0]);
    t.pennant(V(x, BT_PEAK + 3.4, 0), 3.6, 1.8, sx < 0 ? P.yellow : P.pink);
  }
  // perimeter flag poles, with bulb garlands up to the king poles
  const NF = 12;
  for (let i = 0; i < NF; i++) {
    const a = ((i + 0.5) / NF) * TAU;
    const base = edge(a, 0, 1.06);
    const top = base.clone().setY(10);
    p.rod(base, top, 0.12, P.cream).ball(0.2, P.gold, [top.x, 10.15, top.z]);
    const fc = [P.pink, P.cyan, P.yellow, P.orange, P.lilac][i % 5];
    const dir = V(-Math.sin(a), 0, Math.cos(a));
    t.tri(top, top.clone().add(V(0, -1.1, 0)), top.clone().add(V(0, -0.6, 0)).addScaledVector(dir, 2.2), fc);
    const king = V(Math.sign(Math.cos(a)) * BT_POLE, BT_PEAK + 3, 0);
    const string = sagLine(top.clone().add(V(0, -0.2, 0)), king, 2.2, 18);
    for (let j = 0; j < string.length - 1; j++) p.rod(string[j], string[j + 1], 0.035, P.dark, 3);
    k.beads(string.slice(1, -1), 1.6, 0.17, (n) => bulbCol(n + i));
  }
  // bulbs down every other roof seam
  for (let i = 0; i < N; i += 2) {
    const pts = Array.from({ length: 10 }, (_, j) => btRoof(th(i), 0.08 + j * 0.088).add(V(0, 0.22, 0)));
    pts.forEach((q, j) => k.bulb(q, j === 4 ? ACCENTS[(i / 2) % 3] : WARM, 0.17));
  }
  // entrance (front, +z)
  const z = BT_B;
  p.box(7.2, 6, 2.2, P.dark, [0, 3, z - 0.4]);
  for (const x of [-4.3, 4.3]) {
    p.box(1.0, 7.4, 1.0, P.cream, [x, 3.7, z + 2.6]).box(1.3, 0.4, 1.3, P.gold, [x, 7.5, z + 2.6]).box(1.2, 0.6, 1.2, P.red, [x, 0.3, z + 2.6]);
    k.beads([V(x, 0.9, z + 3.15), V(x, 7.1, z + 3.15)], 0.5, 0.13);
  }
  p.box(10.4, 2.0, 0.8, P.red, [0, 8.6, z + 2.6]).box(10.6, 0.25, 0.9, P.gold, [0, 7.55, z + 2.6]).box(10.6, 0.25, 0.9, P.gold, [0, 9.65, z + 2.6]);
  const aw = new Tris();
  for (let i = 0; i < 10; i++) {
    const x0 = -4.8 + i * 0.96;
    const x1 = x0 + 0.96;
    aw.quad(V(x0, 7.4, z + 2.2), V(x1, 7.4, z + 2.2), V(x1, 6.7, z - 0.2), V(x0, 6.7, z - 0.2), i % 2 ? P.cream : P.teal);
  }
  p.add(aw.geo(), null);
  neonText(k, "BIG TOP", 1.15, 8.0, z + 3.05, 0.075, () => col(P.yellow));
  k.beads([V(-5.1, 9.85, z + 3.05), V(5.1, 9.85, z + 3.05)], 0.5, 0.13);
  p.add(t.geo(), null);
  return k;
}

function BigTop({ mats, pos }: { mats: Mats; pos: V3 }) {
  const kit = useMemo(buildBigTop, []);
  return (
    <group position={pos} rotation-y={Math.PI / 4}>
      <KitMeshes kit={kit} mats={mats} />
    </group>
  );
}

// ---------------------------------------------------------------- VORTEXA gate

function buildGate() {
  const k = new Kit();
  const p = k.paint;
  for (const sx of [-1, 1]) {
    const x = sx * 9.3;
    p.box(2.6, 1, 2.6, P.red, [x, 0.5, 0]).box(1.8, 9, 1.8, P.cream, [x, 5.5, 0]);
    for (const y of [2.6, 4.6]) p.box(1.92, 0.35, 1.92, P.red, [x, y, 0]);
    p.box(2.3, 0.5, 2.3, P.gold, [x, 10.25, 0]).cyl(0, 1.5, 1.9, 4, P.teal, [x, 11.45, 0], [0, Math.PI / 4, 0]).ball(0.3, P.gold, [x, 12.6, 0]);
    t2pennant(k, V(x, 13.9, 0), sx < 0 ? P.pink : P.cyan);
    p.rod(V(x, 12.4, 0), V(x, 14, 0), 0.05, P.gold);
    for (const cx of [-0.95, 0.95]) k.beads([V(x + cx, 1.4, 0.98), V(x + cx, 9.8, 0.98)], 0.56, 0.14);
  }
  // sign board, crest and frame
  p.box(16.8, 3.4, 0.5, P.navy, [0, 8.6, 0]).box(17, 0.28, 0.66, P.gold, [0, 10.36, 0]).box(17, 0.28, 0.66, P.gold, [0, 6.84, 0]);
  p.add(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 32), P.red, [0, 10.5, -0.02], [Math.PI / 2, 0, 0]);
  p.add(new THREE.TorusGeometry(2.4, 0.13, 5, 32, Math.PI), P.gold, [0, 10.5, 0]);
  neonText(k, "VORTEXA", 2.2, 7.5, 0.34, 0.095, () => col(P.yellow));
  const o = 0.3;
  k.line([V(-8.4 + o, 7.0 + o, 0.3), V(8.4 - o, 7.0 + o, 0.3), V(8.4 - o, 10.2 - o, 0.3), V(-8.4 + o, 10.2 - o, 0.3)], 0.06, col(P.cyan), true);
  const rays = [P.pink, P.orange, P.lilac];
  for (let i = 0; i < 9; i++) {
    const a = ((i + 0.5) / 9) * Math.PI;
    k.tube(V(Math.cos(a) * 0.55, 10.55 + Math.sin(a) * 0.55, 0.22), V(Math.cos(a) * 2.0, 10.55 + Math.sin(a) * 2.0, 0.22), 0.07, col(rays[i % 3]));
  }
  k.beads(Array.from({ length: 17 }, (_, i) => V(Math.cos((i / 16) * Math.PI) * 2.4, 10.5 + Math.sin((i / 16) * Math.PI) * 2.4, 0.3)), 0.47, 0.13);
  k.beads([V(-8.2, 10.36, 0.38), V(8.2, 10.36, 0.38)], 0.5, 0.13);
  k.beads([V(-8.2, 6.84, 0.38), V(8.2, 6.84, 0.38)], 0.5, 0.13, (i) => bulbCol(i + 2));
  // a bulb garland under the board
  const g = sagLine(V(-8.4, 6.5, 0.2), V(8.4, 6.5, 0.2), 1.1, 16);
  for (let i = 0; i < g.length - 1; i++) p.rod(g[i], g[i + 1], 0.03, P.dark, 3);
  k.beads(g.slice(1, -1), 0.62, 0.15, (i) => ACCENTS[i % 3]);
  return k;
}

function t2pennant(k: Kit, at: THREE.Vector3, c: string) {
  const t = new Tris();
  t.pennant(at, 1.8, 1.0, c);
  k.paint.add(t.geo(), null);
}

function Gate({ mats, pos }: { mats: Mats; pos: V3 }) {
  const kit = useMemo(buildGate, []);
  return (
    <group position={pos} rotation-y={Math.PI / 4}>
      <KitMeshes kit={kit} mats={mats} />
    </group>
  );
}

// ---------------------------------------------------------------- power box and cables

function buildPowerBox() {
  const k = new Kit();
  const p = k.paint;
  p.box(2.8, 0.2, 2.0, P.grey, [0, 0.1, 0]);
  p.box(1.7, 1.9, 1.0, P.teal, [0, 1.15, 0]).box(1.9, 0.14, 1.2, P.cream, [0, 2.17, 0]);
  p.box(1.72, 0.22, 1.02, P.yellow, [0, 1.75, 0]);
  p.box(0.75, 1.2, 0.04, P.cream, [-0.4, 0.95, 0.51]).box(0.75, 1.2, 0.04, P.cream, [0.4, 0.95, 0.51]);
  p.rod(V(0.6, 2.2, -0.3), V(0.6, 2.75, -0.3), 0.05, P.grey);
  p.cyl(0.24, 0.24, 0.08, 10, P.grey, [0.6, 2.78, -0.3]);
  // lightning bolt on the door
  k.line([V(0.12, 1.45, 0.55), V(-0.12, 1.0, 0.55), V(0.1, 1.0, 0.55), V(-0.14, 0.55, 0.55)], 0.03, col(P.yellow));
  return k;
}

function PowerBox({ mats, pos }: { mats: Mats; pos: V3 }) {
  const kit = useMemo(buildPowerBox, []);
  return (
    <group position={pos} rotation-y={Math.PI / 4}>
      <KitMeshes kit={kit} mats={mats} />
      <mesh position={[0.6, 2.98, -0.3]} material={mats.lamp}>
        <sphereGeometry args={[0.2, 12, 8]} />
      </mesh>
    </group>
  );
}

function buildCables(from: V3, to: V3[]) {
  const k = new Kit();
  const a = V(from[0], 0.07, from[2]);
  for (const t of to) {
    const b = V(t[0], 0.07, t[2]);
    const mid = V(a.x, 0.07, b.z);
    const pts = [a, mid, b];
    const seg: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const n = Math.max(1, Math.round(pts[i].distanceTo(pts[i + 1]) / 2));
      for (let j = 0; j < n; j++) seg.push(pts[i].clone().lerp(pts[i + 1], j / n));
    }
    seg.push(b);
    k.line(seg, 0.045, col(P.yellow).multiplyScalar(0.3));
  }
  return k;
}

// ---------------------------------------------------------------- layout

// Diamond layout seen from the default view (north-east): gate in front, Big
// Top behind, wheel to the right, carousel to the left.
const S = Math.SQRT1_2;
const at = (depth: number, side: number): V3 => [(depth + side) * S, 0, (depth - side) * S];
const POS = {
  gate: at(30, 0),
  wheel: at(0, 35),
  carousel: at(0, -35),
  bigTop: at(-42, 0),
  power: at(14, -8),
};
const BT_DOOR = at(-42 + BT_B + 4, 0);
const POOLS: { p: V3; r: number; c: string }[] = [
  { p: POS.carousel, r: 15, c: P.warm },
  { p: POS.wheel, r: 22, c: P.pink },
  { p: at(33, 0), r: 11, c: P.orange },
  { p: BT_DOOR, r: 12, c: P.warm },
  { p: POS.bigTop, r: 44, c: P.lilac },
];

function Pools({ mats }: { mats: Mats }) {
  const mesh = useMemo(() => {
    const items = POOLS.map((o) => ({ m: new THREE.Matrix4().compose(V(o.p[0], 0.06, o.p[2]), new THREE.Quaternion(), V(o.r * 2, 1, o.r * 2)), c: col(o.c) }));
    const m = instanced(mats.poolGeo, mats.pool, items);
    m.renderOrder = 1;
    return m;
  }, [mats]);
  return <primitive object={mesh} />;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function FunfairRides({ power, night }: FunfairStyleProps) {
  const mats = useMemo(makeMats, []);
  const [anim] = useState<Anim>(() => ({ lvl: power, motion: power, wheel: 0.3, carousel: 0, t: 0 }));
  const cables = useMemo(() => buildCables(POS.power, [at(30, -6), POS.wheel, POS.carousel, BT_DOOR]), []);
  const lightA = useRef<THREE.PointLight>(null);
  const lightB = useRef<THREE.PointLight>(null);
  const lampCol = useMemo(() => new THREE.Color(), []);

  useFrame((st, dt) => {
    const d = Math.min(dt, 0.1);
    const goal = power > 0.5 ? 1 : 0;
    anim.lvl += Math.sign(goal - anim.lvl) * Math.min(Math.abs(goal - anim.lvl), d * 0.55);
    const motion = smooth(0.55, 1, anim.lvl);
    anim.motion = motion;
    anim.t += d * motion;
    anim.wheel += d * 0.07 * motion;
    anim.carousel += d * 0.45 * motion;
    const u = mats.u;
    u.lvl.value = anim.lvl;
    u.time.value = st.clock.elapsedTime;
    u.chase.value = motion;
    u.off.value = 0.88 * (1 - smooth(0, 0.6, anim.lvl));
    u.bulbK.value = night ? 3.2 : 1.6;
    u.neonK.value = night ? 2.8 : 1.4;
    // standby lamp: dim pulsing red when off, bright green when on
    const pulse = 0.45 + 0.2 * Math.sin(st.clock.elapsedTime * 2.2);
    lampCol.setRGB(pulse, pulse * 0.03, pulse * 0.03).lerp(new THREE.Color(0.35, 2.4, 0.6), anim.lvl);
    mats.lamp.color.copy(lampCol);
    mats.pool.opacity = anim.lvl * (night ? 0.38 : 0.1);
    const li = anim.lvl * (night ? 1 : 0.25);
    if (lightA.current) lightA.current.intensity = 260 * li;
    if (lightB.current) lightB.current.intensity = 220 * li;
  });

  return (
    <group>
      <FerrisWheel mats={mats} anim={anim} pos={POS.wheel} />
      <Carousel mats={mats} anim={anim} pos={POS.carousel} />
      <BigTop mats={mats} pos={POS.bigTop} />
      <Gate mats={mats} pos={POS.gate} />
      <PowerBox mats={mats} pos={POS.power} />
      <KitMeshes kit={cables} mats={mats} shadow={false} />
      <Pools mats={mats} />
      <pointLight ref={lightA} position={[POS.carousel[0], 4.5, POS.carousel[2]]} color={P.warm} distance={45} decay={2} intensity={0} />
      <pointLight ref={lightB} position={[BT_DOOR[0], 5, BT_DOOR[2]]} color="#ffe28a" distance={40} decay={2} intensity={0} />
    </group>
  );
}
