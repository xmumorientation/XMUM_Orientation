"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FunfairStyleProps } from "./FunfairLab";

// DRAFT: funfair ride style A, "Neon Cyber" (see FunfairLab.tsx).
// Dark gunmetal frames outlined with neon tubes in the Vortexa colours
// (vortexa.css: cyan, pink, lilac, yellow, orange). Powered off it reads as
// an abandoned neon park: dead tubes, dark bulbs, a red standby light.
// 1 unit = 1 m. Static parts of all four pieces are merged into a few meshes;
// the moving parts (wheel, gondolas, carousel, horses) have their own.

type V3 = [number, number, number];
type RGB = readonly [number, number, number];

// "On" neon colours, linear and above 1 so the bench's bloom picks them up.
const C = {
  cyan: [0.0, 1.3, 1.36],
  pink: [2.5, 0.1, 0.9],
  lilac: [1.2, 0.72, 1.6],
  yellow: [1.15, 1.32, 0.02],
  orange: [1.9, 0.6, 0.06],
  warm: [1.7, 1.35, 0.7],
  red: [1.6, 0.04, 0.04],
} as const satisfies Record<string, RGB>;
const BLACK: RGB = [0.008, 0.008, 0.012];
const WHITE: RGB = [1, 1, 1];
const lin = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The website's holo gradient (cyan, lilac, pink, orange), t in 0..1. */
const holo = (t: number): RGB => {
  const stops = [C.cyan, C.lilac, C.pink, C.orange];
  const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mix(stops[i], stops[i + 1], x - i);
};

// Layout (world metres, the bench person stands at the origin).
const TENT = { pos: [-42, 0, -26] as V3, rotY: 0, rx: 34, rz: 27 };
const WHEEL = { pos: [24, 0, -30] as V3, rotY: Math.PI / 4, hub: 21.8, r: 18 };
const CAROUSEL = { pos: [34, 0, 14] as V3, r: 8 };
const GATE = { pos: [-8, 0, 34] as V3, rotY: 0.6 };
const POWER = { pos: [10, 0, 28] as V3, rotY: 0.6 };

const m4 = (p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));

const UP = new THREE.Vector3(0, 1, 0);

/** Collects geometry parts (in a frame given by `base`) and merges them into one. */
class Kit {
  parts: THREE.BufferGeometry[] = [];
  base = new THREE.Matrix4();
  constructor(readonly colored: boolean) {}
  add(g: THREE.BufferGeometry, local?: THREE.Matrix4, rgb?: RGB) {
    const out = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    out.applyMatrix4(local ? this.base.clone().multiply(local) : this.base);
    for (const k of Object.keys(out.attributes)) {
      if (k === "position" || k === "normal") continue;
      if (k === "color" && this.colored && !rgb) continue;
      out.deleteAttribute(k);
    }
    if (this.colored && !out.getAttribute("color")) {
      const n = out.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      const col = rgb ?? WHITE;
      for (let i = 0; i < n; i++) c.set(col, i * 3);
      out.setAttribute("color", new THREE.BufferAttribute(c, 3));
    }
    out.clearGroups();
    this.parts.push(out);
  }
  /** A round bar from a to b. */
  seg(a: V3, b: V3, r: number, rgb?: RGB, radial = 6) {
    const va = new THREE.Vector3(...a);
    const d = new THREE.Vector3(...b).sub(va);
    const len = d.length();
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const mid = va.addScaledVector(d, 0.5);
    this.add(g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), rgb);
  }
  /** A bent tube through the points, with small joints so corners stay closed. */
  poly(pts: V3[], r: number, rgb?: RGB | ((t: number) => RGB), closed = false) {
    const list = closed ? [...pts, pts[0]] : pts;
    const n = list.length - 1;
    for (let i = 0; i < n; i++) {
      const col = typeof rgb === "function" ? rgb((i + 0.5) / n) : rgb;
      this.seg(list[i], list[i + 1], r, col);
      if (i > 0 || closed) this.add(new THREE.IcosahedronGeometry(r * 1.02, 0), m4(list[i]), col);
    }
  }
  box(size: V3, p: V3, r: V3 = [0, 0, 0], rgb?: RGB) {
    this.add(new THREE.BoxGeometry(...size), m4(p, r), rgb);
  }
  build() {
    const g = mergeGeometries(this.parts) ?? new THREE.BufferGeometry();
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return g;
  }
}

/** Instanced bulbs: position, colour, size, and a chase phase (-1 = steady). */
class Bulbs {
  pos: number[] = [];
  col: number[] = [];
  size: number[] = [];
  phase: number[] = [];
  base = new THREE.Matrix4();
  private v = new THREE.Vector3();
  add(p: V3, rgb: RGB, size = 0.28, phase = -1) {
    this.v.set(...p).applyMatrix4(this.base);
    this.pos.push(this.v.x, this.v.y, this.v.z);
    this.col.push(...rgb);
    this.size.push(size);
    this.phase.push(phase);
  }
  line(a: V3, b: V3, n: number, rgb: RGB | ((i: number) => RGB), size = 0.28, chase = false, phase0 = 0) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const col = typeof rgb === "function" ? rgb(i) : rgb;
      this.add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], col, size, chase ? phase0 + i * 0.55 : -1);
    }
  }
  mesh(mat: THREE.Material) {
    const n = this.size.length;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const s = this.size[i];
      m.makeScale(s, s, s).setPosition(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      im.setMatrixAt(i, m);
    }
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.col), 3);
    im.frustumCulled = false;
    const baseCol = new Float32Array(this.col);
    const phase = new Float32Array(this.phase);
    const chased = this.phase.some((x) => x >= 0);
    /** Chase lights: dim the bulbs in a running wave while powered. */
    const chase = (t: number, p: number) => {
      if (!chased || !im.instanceColor) return;
      const arr = im.instanceColor.array as Float32Array;
      for (let i = 0; i < n; i++) {
        if (phase[i] < 0) continue;
        const f = 1 - p * 0.75 * (0.5 + 0.5 * Math.sin(t * 5 - phase[i]));
        arr[i * 3] = baseCol[i * 3] * f;
        arr[i * 3 + 1] = baseCol[i * 3 + 1] * f;
        arr[i * 3 + 2] = baseCol[i * 3 + 2] * f;
      }
      im.instanceColor.needsUpdate = true;
    };
    return { im, chase };
  }
}

function glowTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pieceMatrix(pos: V3, rotY = 0) {
  return m4(pos, [0, rotY, 0]);
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

function buildFunfair() {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  let wheelBulbChase: (t: number, p: number) => void = () => {};
  let carouselBulbChase: (t: number, p: number) => void = () => {};

  // Materials (shared).
  const metal = keep(new THREE.MeshStandardMaterial({ color: "#2b2f3a", metalness: 0.7, roughness: 0.38 }));
  const neon = keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const bulb = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const canvas = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }));
  const paint = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  const pearl = keep(new THREE.MeshStandardMaterial({ color: "#e4def0", metalness: 0.55, roughness: 0.28 }));
  const standby = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const glowTex = keep(glowTexture());
  const glow = keep(
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );

  const sMetal = new Kit(false); // static gunmetal
  const sNeon = new Kit(true); // static neon tubes
  const sPaint = new Kit(true); // flags, hazard stripes
  const sBulbs = new Bulbs();

  // ---- Vortexa Eye (Ferris wheel) ------------------------------------------
  const W = pieceMatrix(WHEEL.pos, WHEEL.rotY);
  const H = WHEEL.hub;
  const R = WHEEL.r;
  sMetal.base = W;
  sNeon.base = W;
  sBulbs.base = W;
  sMetal.box([27, 0.6, 12], [0, 0.3, 0]);
  sMetal.box([6, 0.3, 4], [0, 0.75, 7.5]); // boarding step
  for (const s of [-1, 1]) {
    for (const x of [-1, 1]) {
      const foot: V3 = [x * 11, 0.6, s * 5.2];
      const top: V3 = [0, H, s * 2.7];
      sMetal.seg(foot, top, 0.42, undefined, 8);
      // neon strip along the outside of each leg
      sNeon.seg([foot[0] + x * 0.5, 0.8, foot[2] + s * 0.3], [top[0] + x * 0.5, H - 1.5, top[2] + s * 0.3], 0.09, s > 0 ? C.cyan : C.lilac);
    }
    const lerpLeg = (x: number, t: number): V3 => [x * 11 * (1 - t), 0.6 + (H - 0.6) * t, s * (5.2 - 2.5 * t)];
    sMetal.seg(lerpLeg(-1, 0.35), lerpLeg(1, 0.35), 0.22);
    sMetal.seg(lerpLeg(-1, 0.35), lerpLeg(1, 0.7), 0.16);
    sMetal.seg(lerpLeg(1, 0.35), lerpLeg(-1, 0.7), 0.16);
  }
  sMetal.add(new THREE.CylinderGeometry(0.75, 0.75, 6.2, 12), m4([0, H, 0], [Math.PI / 2, 0, 0]));
  // deck outline
  sNeon.poly([[-13.5, 0.62, -6], [13.5, 0.62, -6], [13.5, 0.62, 6], [-13.5, 0.62, 6]], 0.08, C.pink, true);
  sBulbs.line([-13.3, 0.75, 6.05], [13.3, 0.75, 6.05], 28, (i) => (i % 2 ? C.warm : C.pink), 0.22, true);

  const wheelAssembly = new THREE.Group();
  wheelAssembly.applyMatrix4(W);
  root.add(wheelAssembly);
  const wheel = new THREE.Group();
  wheel.position.set(0, H, 0);
  wheelAssembly.add(wheel);
  {
    const k = new Kit(false);
    const n = new Kit(true);
    const b = new Bulbs();
    const SPOKES = 24;
    for (const z of [-1.5, 1.5]) {
      k.add(new THREE.TorusGeometry(R, 0.3, 6, 96), m4([0, 0, z]));
      k.add(new THREE.TorusGeometry(11, 0.18, 5, 72), m4([0, 0, z]));
      const zf = z + Math.sign(z) * 0.36; // front face, where the neon sits
      n.add(new THREE.TorusGeometry(R + 0.05, 0.1, 5, 128), m4([0, 0, zf]), C.pink);
      n.add(new THREE.TorusGeometry(11, 0.08, 5, 96), m4([0, 0, zf]), C.cyan);
      n.add(new THREE.TorusGeometry(2.8, 0.14, 6, 40), m4([0, 0, zf + Math.sign(z) * 0.4]), C.yellow);
      // the "eye": a cyan iris with a dark pupil
      n.add(new THREE.CircleGeometry(1.9, 28), m4([0, 0, zf + Math.sign(z) * 0.42], [0, z > 0 ? 0 : Math.PI, 0]), C.cyan);
      n.add(new THREE.CircleGeometry(0.8, 20), m4([0, 0, zf + Math.sign(z) * 0.45], [0, z > 0 ? 0 : Math.PI, 0]), BLACK);
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        k.seg([c * 1.8, s * 1.8, z * 1.15], [c * R, s * R, z], 0.11);
        if (i % 2 === 0) {
          n.seg([c * 3.1, s * 3.1, zf], [c * (R - 0.4), s * (R - 0.4), zf], 0.07, C.lilac);
        } else {
          for (let j = 0; j < 6; j++) {
            const r = 4.5 + j * 2.4;
            b.add([c * r, s * r, zf], C.cyan, 0.22);
          }
        }
      }
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        b.add([Math.cos(a) * (R + 0.55), Math.sin(a) * (R + 0.55), z], i % 3 === 0 ? C.yellow : C.warm, 0.3, i * 0.9);
      }
    }
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      k.seg([Math.cos(a) * R, Math.sin(a) * R, -1.5], [Math.cos(a) * R, Math.sin(a) * R, 1.5], 0.12);
    }
    k.add(new THREE.CylinderGeometry(2.0, 2.0, 3.8, 16), m4([0, 0, 0], [Math.PI / 2, 0, 0]));
    const wm = new THREE.Mesh(k.build(), metal);
    wm.castShadow = true;
    const wn = new THREE.Mesh(n.build(), neon);
    wheel.add(wm, wn);
    disposables.push(wm.geometry, wn.geometry);
    const wb = b.mesh(bulb);
    wheel.add(wb.im);
    disposables.push(wb.im.geometry);
    wheelBulbChase = wb.chase;
  }
  // gondolas: hang from the rim, stay upright
  const GONDOLAS = 16;
  const gk = new Kit(false);
  gk.seg([0, 0, 0], [0, -0.95, 0], 0.07);
  gk.add(new THREE.ConeGeometry(1.25, 0.55, 8), m4([0, -1.18, 0]));
  gk.add(new THREE.CylinderGeometry(1.05, 0.95, 1.7, 8), m4([0, -2.3, 0]));
  gk.add(new THREE.CylinderGeometry(1.15, 1.15, 0.16, 8), m4([0, -3.18, 0]));
  const gondolas = new THREE.InstancedMesh(gk.build(), metal, GONDOLAS);
  gondolas.castShadow = true;
  const bands = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1.08, 0.09, 4, 16).rotateX(Math.PI / 2).translate(0, -1.62, 0),
    bulb,
    GONDOLAS,
  );
  const bandCols = [C.pink, C.cyan, C.lilac, C.yellow];
  for (let i = 0; i < GONDOLAS; i++) bands.setColorAt(i, new THREE.Color(...bandCols[i % 4]));
  gondolas.frustumCulled = bands.frustumCulled = false;
  wheelAssembly.add(gondolas, bands);
  disposables.push(gondolas.geometry, bands.geometry);

  // ---- Carousel ------------------------------------------------------------
  const CM = pieceMatrix(CAROUSEL.pos);
  const CR = CAROUSEL.r;
  sMetal.base = CM;
  sNeon.base = CM;
  sBulbs.base = CM;
  sMetal.add(new THREE.CylinderGeometry(CR + 0.4, CR + 0.6, 0.4, 32), m4([0, 0.2, 0]));
  sNeon.add(new THREE.TorusGeometry(CR + 0.62, 0.07, 4, 96), m4([0, 0.05, 0], [Math.PI / 2, 0, 0]), C.cyan);
  const carousel = new THREE.Group();
  carousel.applyMatrix4(CM);
  root.add(carousel);
  const spin = new THREE.Group();
  carousel.add(spin);
  const HORSES = 24;
  const horseSlots: { r: number; a: number }[] = [];
  for (let i = 0; i < HORSES; i++) {
    const outer = i % 2 === 0;
    horseSlots.push({ r: outer ? 6.5 : 4.5, a: (i / HORSES) * Math.PI * 2 });
  }
  const CAN_Y = 7.6; // canopy base
  const CAN_R = CR + 0.6;
  const CAN_H = 3.2;
  const SIDES = 16;
  {
    const k = new Kit(false);
    const n = new Kit(true);
    const b = new Bulbs();
    k.add(new THREE.CylinderGeometry(CR, CR, 0.4, 32), m4([0, 0.6, 0]));
    k.add(new THREE.CylinderGeometry(1.0, 1.2, CAN_Y, 12), m4([0, CAN_Y / 2 + 0.4, 0]));
    k.add(new THREE.ConeGeometry(CAN_R, CAN_H, SIDES), m4([0, CAN_Y + CAN_H / 2, 0]));
    k.add(new THREE.CylinderGeometry(CAN_R, CAN_R, 1.0, SIDES, 1, true), m4([0, CAN_Y - 0.5, 0]));
    k.add(new THREE.CylinderGeometry(0.12, 0.25, 1.6, 6), m4([0, CAN_Y + CAN_H + 0.6, 0]));
    // platform rim, valance rings, canopy ribs
    n.add(new THREE.TorusGeometry(CR + 0.03, 0.07, 4, 96), m4([0, 0.82, 0], [Math.PI / 2, 0, 0]), C.cyan);
    const ring = (r: number, y: number): V3[] =>
      Array.from({ length: SIDES }, (_, i) => {
        const a = (i / SIDES) * Math.PI * 2;
        return [Math.sin(a) * r, y, Math.cos(a) * r];
      });
    n.poly(ring(CAN_R + 0.06, CAN_Y - 1.0), 0.08, C.cyan, true);
    n.poly(ring(CAN_R + 0.06, CAN_Y + 0.02), 0.08, C.yellow, true);
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const col = i % 2 ? C.lilac : C.pink;
      n.seg([sx * (CAN_R + 0.08), CAN_Y + 0.05, sz * (CAN_R + 0.08)], [sx * 0.15, CAN_Y + CAN_H + 0.04, sz * 0.15], 0.07, col);
      for (let j = 1; j <= 5; j++) {
        const t = j / 6;
        b.add([sx * (CAN_R + 0.15) * (1 - t), CAN_Y + 0.12 + CAN_H * t, sz * (CAN_R + 0.15) * (1 - t)], C.warm, 0.2);
      }
      // scalloped bulbs under the valance
      for (let j = 0; j < 3; j++) {
        const a2 = a + ((j + 0.5) / 3) * ((Math.PI * 2) / SIDES);
        b.add([Math.sin(a2) * (CAN_R + 0.1), CAN_Y - 1.15, Math.cos(a2) * (CAN_R + 0.1)], j === 1 ? C.yellow : C.warm, 0.2, i * 3 + j);
      }
    }
    // spiral on the centre column
    const spiral: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 8;
      spiral.push([Math.sin(a) * 1.18, 1.0 + t * (CAN_Y - 1.6), Math.cos(a) * 1.18]);
    }
    n.poly(spiral, 0.06, C.lilac);
    n.add(new THREE.IcosahedronGeometry(0.55, 1), m4([0, CAN_Y + CAN_H + 1.5, 0]), C.yellow);
    const cm = new THREE.Mesh(k.build(), metal);
    cm.castShadow = true;
    const cn = new THREE.Mesh(n.build(), neon);
    const cb = b.mesh(bulb);
    spin.add(cm, cn, cb.im);
    disposables.push(cm.geometry, cn.geometry, cb.im.geometry);
    carouselBulbChase = cb.chase;
  }
  // horses (pearl) on glowing poles
  const hk = new Kit(false);
  hk.box([1.5, 0.5, 0.42], [0, 0, 0]);
  hk.box([0.32, 0.8, 0.3], [0.62, 0.4, 0], [0, 0, -0.5]);
  hk.box([0.62, 0.26, 0.26], [0.96, 0.74, 0], [0, 0, -0.35]);
  for (const z of [-0.12, 0.12]) {
    hk.box([0.12, 0.72, 0.12], [0.72, -0.45, z], [0, 0, 0.6]);
    hk.box([0.12, 0.72, 0.12], [-0.72, -0.45, z], [0, 0, -0.6]);
  }
  hk.box([0.1, 0.55, 0.1], [-0.88, -0.05, 0], [0, 0, 0.7]);
  const horses = new THREE.InstancedMesh(hk.build(), pearl, HORSES);
  horses.castShadow = true;
  const horseTints = ["#ffffff", "#e9d8ff", "#d6fbff", "#ffd9ef"];
  for (let i = 0; i < HORSES; i++) horses.setColorAt(i, new THREE.Color(horseTints[i % 4]));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, CAN_Y - 1.0 - 0.8, 5), bulb, HORSES);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < HORSES; i++) {
      const { r, a } = horseSlots[i];
      m.makeTranslation(r * Math.cos(a), (CAN_Y - 1.0 + 0.8) / 2, -r * Math.sin(a));
      poles.setMatrixAt(i, m);
      poles.setColorAt(i, new THREE.Color(...(i % 2 ? C.lilac : C.yellow)));
    }
  }
  horses.frustumCulled = poles.frustumCulled = false;
  spin.add(horses, poles);
  disposables.push(horses.geometry, poles.geometry);

  // ---- Big Top -------------------------------------------------------------
  const T = pieceMatrix(TENT.pos, TENT.rotY);
  const { rx, rz } = TENT;
  sMetal.base = T;
  sNeon.base = T;
  sPaint.base = T;
  sBulbs.base = T;
  const STRIPES = 24;
  const PROFILE: [number, number][] = [
    [1, 7],
    [0.9, 8.3],
    [0.78, 9.9],
    [0.64, 12],
    [0.5, 14.3],
    [0.37, 16.6],
    [0.25, 18.9],
    [0.14, 21],
    [0.06, 22.6],
    [0.0, 23.4],
  ];
  const roofAt = (rn: number) => {
    for (let i = 0; i < PROFILE.length - 1; i++) {
      const [r0, y0] = PROFILE[i];
      const [r1, y1] = PROFILE[i + 1];
      if (rn <= r0 && rn >= r1) return y0 + ((y1 - y0) * (r0 - rn)) / (r0 - r1 || 1);
    }
    return 23.4;
  };
  const canvasGeo = (() => {
    const roof = new THREE.LatheGeometry(
      PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
      STRIPES * 2,
    ).scale(rx, 1, rz);
    const wall = new THREE.CylinderGeometry(1, 1, 7, STRIPES * 2, 1, true).translate(0, 3.5, 0).scale(rx, 1, rz);
    const parts = [roof, wall].map((g) => {
      const ng = g.toNonIndexed();
      g.dispose();
      ng.deleteAttribute("uv");
      return ng;
    });
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    const pos = merged.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const A = lin("#d9e21a");
    const B = lin("#231634");
    for (let t = 0; t < pos.count; t += 3) {
      let cx = 0;
      let cz = 0;
      for (let j = 0; j < 3; j++) {
        cx += pos.getX(t + j);
        cz += pos.getZ(t + j);
      }
      let a = Math.atan2(cx / rx, cz / rz);
      if (a < 0) a += Math.PI * 2;
      const c = Math.floor(a / ((Math.PI * 2) / STRIPES)) % 2 ? B : A;
      for (let j = 0; j < 3; j++) col.set(c, (t + j) * 3);
    }
    merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    merged.applyMatrix4(T);
    return merged;
  })();
  const tentMesh = new THREE.Mesh(canvasGeo, canvas);
  tentMesh.castShadow = true;
  tentMesh.receiveShadow = true;
  root.add(tentMesh);
  disposables.push(canvasGeo);
  const onEllipse = (a: number, rn: number, y: number, out = 0): V3 => [Math.sin(a) * (rx * rn + out), y, Math.cos(a) * (rz * rn + out)];
  for (let i = 0; i < STRIPES; i++) {
    const a = (i / STRIPES) * Math.PI * 2;
    const seam = PROFILE.slice(0, -1).map(([r, y]) => onEllipse(a, r, y + 0.12, 0.12));
    seam.push([0, 23.5, 0]);
    sNeon.poly(seam, 0.11, i % 2 ? C.pink : C.yellow);
    // vertical seam on the wall
    sNeon.seg(onEllipse(a, 1, 0.3, 0.1), onEllipse(a, 1, 7, 0.1), 0.07, C.lilac);
    // bulbs climbing the seam (chase runs upwards)
    for (let j = 1; j < 10; j++) {
      const rn = 1 - j * 0.1;
      sBulbs.add(onEllipse(a, rn, roofAt(rn) + 0.35, 0.3), C.warm, 0.3, -j * 0.8 + i * 0.2);
    }
    // drooping bulb string to the next seam along the eave
    const a2 = ((i + 1) / STRIPES) * Math.PI * 2;
    for (let j = 1; j < 7; j++) {
      const t = j / 7;
      const aa = a + (a2 - a) * t;
      sBulbs.add(onEllipse(aa, 1, 7 - Math.sin(t * Math.PI) * 1.3, 0.35), j % 2 ? C.yellow : C.pink, 0.26);
    }
  }
  const eave = Array.from({ length: 64 }, (_, i) => onEllipse((i / 64) * Math.PI * 2, 1, 7.05, 0.18));
  sNeon.poly(eave, 0.12, C.cyan, true);
  const skirt = Array.from({ length: 64 }, (_, i) => onEllipse((i / 64) * Math.PI * 2, 1, 0.25, 0.2));
  sNeon.poly(skirt, 0.1, C.pink, true);
  // masts and flags
  sMetal.seg([0, 0, 0], [0, 28.5, 0], 0.45, undefined, 10);
  sNeon.add(new THREE.IcosahedronGeometry(0.6, 1), m4([0, 28.9, 0]), C.yellow);
  const pennant = (at: V3, dir: THREE.Vector3, w: number, h: number, rgb: RGB) => {
    const a = new THREE.Vector3(...at);
    const b = a.clone().addScaledVector(dir, w);
    const c = a.clone().addScaledVector(dir, w / 2).add(new THREE.Vector3(0, -h, 0));
    const g = new THREE.BufferGeometry().setFromPoints([a, b, c]);
    g.computeVertexNormals();
    sPaint.add(g, undefined, rgb);
  };
  const flagCols = ["#fe06ab", "#0dfcfd", "#f2ff0b", "#e0b4fc", "#fc9e3d"].map(lin);
  for (const [x, z, col] of [
    [0, 0, 0],
    [-13, 0, 2],
    [13, 0, 1],
  ] as const) {
    const top = x === 0 ? 28.4 : roofAt(Math.abs(x) / rx) + 5;
    if (x !== 0) sMetal.seg([x, roofAt(Math.abs(x) / rx) - 1, z], [x, top + 0.3, z], 0.3, undefined, 8);
    const flag = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, top, z),
      new THREE.Vector3(x, top - 1.8, z),
      new THREE.Vector3(x + 4.2, top - 0.9, z + 0.6),
    ]);
    flag.computeVertexNormals();
    sPaint.add(flag, undefined, flagCols[col]);
  }
  // pennant strings from the mast down to the eave
  for (let s = 0; s < 8; s++) {
    const a = ((s + 0.5) / 8) * Math.PI * 2;
    const from = new THREE.Vector3(0, 26, 0);
    const to = new THREE.Vector3(...onEllipse(a, 1, 7.6, 0.3));
    sMetal.seg(from.toArray() as V3, to.toArray() as V3, 0.04, undefined, 4);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    for (let d = 2.5; d < len - 1.5; d += 2.6) {
      const p = from.clone().addScaledVector(dir, d);
      pennant(p.toArray() as V3, dir, 1.0, 1.2, flagCols[(s + Math.round(d / 2.6)) % flagCols.length]);
    }
  }
  // entrance porch, facing the bench camera
  {
    const a = Math.PI / 4;
    const e = new THREE.Vector3(Math.sin(a) * rx, 0, Math.cos(a) * rz);
    const nrm = new THREE.Vector3(e.x / (rx * rx), 0, e.z / (rz * rz)).normalize();
    const P = T.clone().multiply(m4(e.clone().addScaledVector(nrm, 1.2).toArray() as V3, [0, Math.atan2(nrm.x, nrm.z), 0]));
    sMetal.base = P;
    sNeon.base = P;
    sBulbs.base = P;
    sPaint.base = P;
    sMetal.box([8.5, 7.5, 6], [0, 3.75, 0]);
    sMetal.add(new THREE.ConeGeometry(6.4, 2.6, 4), m4([0, 8.8, 0], [0, Math.PI / 4, 0], [1, 1, 0.75]));
    sNeon.box([4.4, 4.8, 0.05], [0, 2.4, 3.02], [0, 0, 0], BLACK);
    sNeon.poly([[-2.4, 0.1, 3.1], [-2.4, 5.0, 3.1], [0, 6.2, 3.1], [2.4, 5.0, 3.1], [2.4, 0.1, 3.1]], 0.12, C.yellow);
    sNeon.poly([[-3.9, 0.3, 3.1], [-3.9, 6.9, 3.1], [3.9, 6.9, 3.1], [3.9, 0.3, 3.1]], 0.08, C.pink);
    sBulbs.line([-3.6, 7.25, 3.15], [3.6, 7.25, 3.15], 12, C.warm, 0.24, true);
    for (const x of [-1, 1]) {
      sPaint.box([0.5, 7.5, 0.1], [x * 4.3, 3.75, 3.0], [0, 0, 0], lin("#f2ff0b"));
    }
  }

  // ---- VORTEXA gate ----------------------------------------------------------
  const G = pieceMatrix(GATE.pos, GATE.rotY);
  sMetal.base = G;
  sNeon.base = G;
  sBulbs.base = G;
  sPaint.base = G;
  for (const x of [-8, 8]) {
    sMetal.box([3.2, 0.6, 3.2], [x, 0.3, 0]);
    sMetal.add(new THREE.CylinderGeometry(1.0, 1.55, 11, 4), m4([x, 5.8, 0], [0, Math.PI / 4, 0]));
    sMetal.add(new THREE.ConeGeometry(1.0, 1.4, 4), m4([x, 12.0, 0], [0, Math.PI / 4, 0]));
    // neon on the front corners and chevrons on the face
    const side = Math.sign(x);
    for (const cx of [-1, 1]) {
      const inner = cx === -side;
      sNeon.seg([x + cx * 1.12, 0.6, 1.12], [x + cx * 0.73, 11.25, 0.73], 0.08, inner ? C.cyan : C.pink);
    }
    for (let k = 0; k < 3; k++) {
      const y = 2.0 + k * 1.3;
      const halfW = 1.45 - (y / 11) * 0.5;
      sNeon.poly([[x - halfW * 0.7, y + 0.6, halfW + 0.03], [x, y, halfW + 0.05], [x + halfW * 0.7, y + 0.6, halfW + 0.03]], 0.07, C.lilac);
    }
    sNeon.add(new THREE.IcosahedronGeometry(0.35, 1), m4([x, 12.9, 0]), C.yellow);
  }
  // sign board
  sMetal.box([19, 3.0, 1.1], [0, 8.6, 0]);
  sMetal.box([19.6, 0.3, 1.4], [0, 10.25, 0]);
  sMetal.box([19.6, 0.3, 1.4], [0, 6.95, 0]);
  // letters in neon tubes (unit letter 1 wide, 1.4 tall)
  const LETTERS: Record<string, V3[][]> = (() => {
    const p = (...xy: number[]): V3[] => {
      const out: V3[] = [];
      for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0]);
      return out;
    };
    const oval: V3[] = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      return [0.5 + Math.sin(a) * 0.5, 0.7 + Math.cos(a) * 0.7, 0];
    });
    return {
      V: [p(0, 1.4, 0.5, 0, 1, 1.4)],
      O: [[...oval, oval[0]]],
      R: [p(0, 0, 0, 1.4, 0.62, 1.4, 0.9, 1.27, 0.97, 1.05, 0.9, 0.84, 0.62, 0.72, 0, 0.72), p(0.45, 0.72, 1, 0)],
      T: [p(0, 1.4, 1, 1.4), p(0.5, 1.4, 0.5, 0)],
      E: [p(1, 1.4, 0, 1.4, 0, 0, 1, 0), p(0, 0.72, 0.78, 0.72)],
      X: [p(0, 1.4, 1, 0), p(0, 0, 1, 1.4)],
      A: [p(0, 0, 0.5, 1.4, 1, 0), p(0.2, 0.52, 0.8, 0.52)],
    };
  })();
  {
    const word = "VORTEXA";
    const LH = 1.9 / 1.4; // letter scale: 1.9 m tall
    const lw = 1.0 * LH;
    const gap = 0.55;
    const total = word.length * lw + (word.length - 1) * gap;
    word.split("").forEach((ch, i) => {
      const x0 = -total / 2 + i * (lw + gap);
      for (const stroke of LETTERS[ch]) {
        sNeon.poly(
          stroke.map(([x, y]) => [x0 + x * LH, 7.65 + y * LH, 0.62] as V3),
          0.13,
          C.yellow,
        );
      }
    });
    sNeon.seg([-total / 2, 7.35, 0.6], [total / 2, 7.35, 0.6], 0.06, C.orange);
    sNeon.seg([-total / 2, 9.85, 0.6], [total / 2, 9.85, 0.6], 0.06, C.lilac);
  }
  // holo arch over the sign
  {
    const arch: V3[] = Array.from({ length: 33 }, (_, i) => {
      const a = Math.PI * (1 - i / 32);
      return [Math.cos(a) * 8, 10.4 + Math.sin(a) * 2.1, 0];
    });
    sMetal.poly(arch, 0.22);
    sNeon.poly(
      arch.map(([x, y]) => [x, y + 0.3, 0.3] as V3),
      0.12,
      holo,
    );
    for (let i = 1; i < 32; i += 2) {
      const [x, y] = arch[i];
      sBulbs.add([x, y + 0.35, -0.35], holo(i / 32), 0.26, i * 0.9);
    }
    sBulbs.line([-9.4, 10.05, 0.72], [9.4, 10.05, 0.72], 30, C.warm, 0.2, true);
    sBulbs.line([-9.4, 7.15, 0.72], [9.4, 7.15, 0.72], 30, C.warm, 0.2, true, 3);
  }

  // ---- Power box -------------------------------------------------------------
  const PB = pieceMatrix(POWER.pos, POWER.rotY);
  sMetal.base = PB;
  sNeon.base = PB;
  sPaint.base = PB;
  sMetal.box([3.0, 0.25, 2.2], [0, 0.125, 0]);
  sMetal.box([2.2, 2.0, 1.4], [0, 1.25, 0]);
  sMetal.box([2.5, 0.16, 1.7], [0, 2.33, 0]);
  for (let i = 0; i < 4; i++) sMetal.box([0.06, 1.2, 0.9], [1.13, 1.2, -0.45 + i * 0.3 - 0.0], [0, 0, 0]);
  for (let i = 0; i < 8; i++) {
    sPaint.box([0.275, 0.22, 0.04], [-0.9625 + i * 0.275, 0.45, 0.72], [0, 0, 0], i % 2 ? lin("#15121e") : lin("#f2ff0b"));
  }
  sNeon.poly([[0.15, 2.0, 0.72], [-0.25, 1.35, 0.72], [0.15, 1.35, 0.72], [-0.2, 0.7, 0.72]], 0.05, C.yellow);
  sNeon.seg([-0.95, 0.65, 0.72], [-0.95, 2.1, 0.72], 0.04, C.cyan);
  const standbyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), standby);
  standbyMesh.applyMatrix4(PB.clone().multiply(m4([0.8, 2.0, 0.73])));
  // a soft halo so the standby light reads from the overview camera
  const standbyHalo = new THREE.Sprite(
    keep(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
  );
  standbyHalo.position.copy(standbyMesh.position);
  standbyHalo.scale.setScalar(2.2);
  root.add(standbyMesh, standbyHalo);
  disposables.push(standbyMesh.geometry);
  // cables on the ground from the box to each ride
  {
    sNeon.base = new THREE.Matrix4();
    const y = 0.1;
    const cables: V3[][] = [
      [[10, y, 28], [2, y, 31], [-5, y, 32]],
      [[10, y, 28], [22, y, 21], [27, y, 17]],
      [[10, y, 28], [15, y, 10], [17, y, -16]],
      [[10, y, 28], [0, y, 13], [-14, y, -3]],
    ];
    for (const c of cables) sNeon.poly(c, 0.09, C.cyan);
  }

  // ---- Static meshes -----------------------------------------------------------
  const staticMetal = new THREE.Mesh(sMetal.build(), metal);
  staticMetal.castShadow = true;
  staticMetal.receiveShadow = true;
  const staticNeon = new THREE.Mesh(sNeon.build(), neon);
  const staticPaint = new THREE.Mesh(sPaint.build(), paint);
  staticPaint.castShadow = true;
  const sb = sBulbs.mesh(bulb);
  root.add(staticMetal, staticNeon, staticPaint, sb.im);
  disposables.push(staticMetal.geometry, staticNeon.geometry, staticPaint.geometry, sb.im.geometry);

  // light pools on the ground
  const pools: { p: V3; s: number; c: RGB }[] = [
    { p: [WHEEL.pos[0], 0.05, WHEEL.pos[2]], s: 46, c: [0.9, 0.05, 0.45] },
    { p: [CAROUSEL.pos[0], 0.9, CAROUSEL.pos[2]], s: 30, c: [0.0, 0.6, 0.65] },
    { p: [-17, 0.05, -6], s: 26, c: [0.7, 0.75, 0.0] },
    { p: [GATE.pos[0], 0.05, GATE.pos[2] + 2], s: 30, c: [0.45, 0.3, 0.7] },
    { p: [POWER.pos[0], 0.05, POWER.pos[2]], s: 8, c: [0.0, 0.6, 0.65] },
  ];
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glow, pools.length);
  pools.forEach((pl, i) => {
    poolMesh.setMatrixAt(i, m4(pl.p, [0, 0, 0], [pl.s, 1, pl.s]));
    poolMesh.setColorAt(i, new THREE.Color(...pl.c));
  });
  poolMesh.frustumCulled = false;
  poolMesh.renderOrder = 1;
  root.add(poolMesh);
  disposables.push(poolMesh.geometry);

  // two real lights: pink under the wheel, yellow at the Big Top door
  const wheelLight = new THREE.PointLight(new THREE.Color(...C.pink).multiplyScalar(0.5), 0, 60, 1.6);
  wheelLight.position.set(WHEEL.pos[0], 6, WHEEL.pos[2]);
  const tentLight = new THREE.PointLight(new THREE.Color("#f2ff0b"), 0, 45, 1.6);
  tentLight.position.set(-15, 5, -3);
  root.add(wheelLight, tentLight);

  // ---- Animation ---------------------------------------------------------------
  let wheelAngle = 0;
  let spinAngle = 0;
  const dummy = new THREE.Object3D();
  const standbyRed = new THREE.Color(...C.red);
  const standbyOn = new THREE.Color(...C.cyan);
  const update = (p: number, night: boolean, t: number, dt: number) => {
    const onK = night ? 1 : 0.85;
    const offK = night ? 0.03 : 0.09; // dead tubes: barely there at night
    const k = offK + (onK - offK) * p;
    neon.color.setScalar(k);
    bulb.color.setScalar(k);
    canvas.color.setScalar(0.5 + 0.5 * p);
    glow.opacity = p * (night ? 0.9 : 0.3);
    poolMesh.visible = p > 0.01;
    wheelLight.intensity = night ? p * 900 : 0;
    tentLight.intensity = night ? p * 700 : 0;
    // standby light: dim red pulse while off, cyan once powered
    const pulse = 0.25 + 0.2 * Math.sin(t * 2.2);
    standby.color.copy(standbyRed).multiplyScalar(pulse).lerp(standbyOn, p);
    standbyHalo.material.color.copy(standby.color).multiplyScalar(night ? 0.9 : 0.5);

    wheelAngle += dt * 0.07 * p;
    wheel.rotation.z = wheelAngle;
    for (let i = 0; i < GONDOLAS; i++) {
      const a = wheelAngle + (i / GONDOLAS) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * R, H + Math.sin(a) * R, 0);
      dummy.rotation.set(0, 0, Math.sin(t * 0.8 + i) * 0.04 * p);
      dummy.updateMatrix();
      gondolas.setMatrixAt(i, dummy.matrix);
      bands.setMatrixAt(i, dummy.matrix);
    }
    gondolas.instanceMatrix.needsUpdate = true;
    bands.instanceMatrix.needsUpdate = true;

    spinAngle += dt * 0.45 * p;
    spin.rotation.y = spinAngle;
    for (let i = 0; i < HORSES; i++) {
      const { r, a } = horseSlots[i];
      dummy.position.set(r * Math.cos(a), 2.0 + Math.sin(t * 2.4 + i * 1.7) * 0.4 * p, -r * Math.sin(a));
      dummy.rotation.set(0, a + Math.PI / 2, Math.sin(t * 2.4 + i * 1.7 + 1.2) * 0.08 * p);
      dummy.updateMatrix();
      horses.setMatrixAt(i, dummy.matrix);
    }
    horses.instanceMatrix.needsUpdate = true;

    sb.chase(t, p);
    wheelBulbChase(t, p);
    carouselBulbChase(t, p);
  };

  return {
    root,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
export function FunfairRides({ power, night }: FunfairStyleProps) {
  const built = useMemo(buildFunfair, []);
  const p = useRef(power);
  useEffect(() => () => built.dispose(), [built]);
  useFrame(({ clock }, dt) => {
    // ease towards the target power (about 2 s), so a zone can power up live
    p.current += (power - p.current) * Math.min(1, dt * 2);
    if (Math.abs(power - p.current) < 0.002) p.current = power;
    built.update(p.current, night, clock.elapsedTime, Math.min(dt, 0.1));
  });
  return <primitive object={built.root} />;
}
