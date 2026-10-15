"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FunfairStyleProps } from "./FunfairLab";

// DRAFT: funfair ride style C, "toy diorama low-poly". Chunky flat-shaded
// shapes like the campus map's trees and roofs, bright Vortexa colours, big
// silhouettes, simple glowing bulbs. 1 unit = 1 m.
//
// power 0: dark grey metal, dim bulbs, no motion, red standby light.
// power 1: neon and bulbs lit, rides turning. The shown power eases towards
// the prop over about 2 s, so a switch plays as a short power-up.

const V = {
  yellow: "#f2ff0b",
  cyan: "#0dfcfd",
  pink: "#fe06ab",
  lilac: "#e0b4fc",
  orange: "#fc9e3d",
  navy: "#063a65",
  white: "#f6f2ff",
};
const BULB_COLORS = [V.yellow, V.cyan, V.pink, V.lilac, V.orange];
const METAL_OFF = "#3b3f48";
const TAU = Math.PI * 2;

// Layout. u runs to the right of the bench's default camera, w towards it.
const at = (u: number, w: number): [number, number, number] => [(u + w) / Math.SQRT2, 0, (w - u) / Math.SQRT2];
const WHEEL_POS = at(-34, 0);
const CAROUSEL_POS = at(-14, -28);
const TENT_POS = at(26, -22);
const GATE_POS = at(2, 22);
const BOX_POS = at(-12, 10);
const FACE_CAM = Math.PI / 4; // local +z faces the default camera
const TENT_ROT = -Math.PI / 4; // long axis (local x) points at the camera
const TENT_RX = 34;
const TENT_RZ = 27;

type State = { p: number; t: number };
type StRef = { current: State };

// ---------- materials ----------

type Anim = { m: THREE.MeshStandardMaterial; on: THREE.Color; off: THREE.Color; glow: boolean };

function makeKit() {
  const list: Anim[] = [];
  const paint = (on: string, off = METAL_OFF, o: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: on, roughness: 0.72, metalness: 0, flatShading: true, ...o });
    list.push({ m, on: new THREE.Color(on), off: new THREE.Color(off), glow: false });
    return m;
  };
  // Neon tube in one colour: grey metal when off, glowing when on.
  const neon = (hex: string) => {
    const m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0, roughness: 0.4, flatShading: true, toneMapped: false });
    const off = new THREE.Color(METAL_OFF).lerp(new THREE.Color(hex), 0.18);
    list.push({ m, on: new THREE.Color(hex).multiplyScalar(0.55), off, glow: true });
    return m;
  };
  // Bulbs and neon strokes, coloured per instance: the emissive takes the
  // instance colour too (patched below).
  const bulb = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.35, flatShading: true, toneMapped: false });
  bulb.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive * vColor.rgb;");
  };
  bulb.customProgramCacheKey = () => "funfairC-bulb";
  list.push({ m: bulb, on: new THREE.Color("#9a9a9a"), off: new THREE.Color("#6f6f78"), glow: true });

  const standby = new THREE.MeshStandardMaterial({ color: "#550000", emissive: "#ff1a1a", emissiveIntensity: 1, toneMapped: false, flatShading: true });
  const pool = new THREE.MeshBasicMaterial({
    map: poolTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const m = {
    white: paint(V.white),
    lilac: paint("#c9a2f2"),
    yellow: paint("#f6e83a"),
    pink: paint("#ff4fbf"),
    navy: paint("#0b4a80", "#30343c"),
    ink: paint("#1b1633", "#2b2e35"),
    gold: paint("#ffc53d"),
    orange: paint(V.orange),
    cream: paint("#fff1dc", "#55585f"),
    concrete: paint("#a39bb3", "#5f5c68"),
    tint: paint("#ffffff", "#55565e", { side: THREE.DoubleSide }),
    striped: paint("#ffffff", "#66626d", { vertexColors: true, side: THREE.DoubleSide }),
    neonPink: neon(V.pink),
    neonCyan: neon(V.cyan),
    neonYellow: neon(V.yellow),
    bulb,
    standby,
    pool,
  };

  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl16: new THREE.CylinderGeometry(1, 1, 1, 18),
    ico: new THREE.IcosahedronGeometry(1, 0),
    ball: new THREE.IcosahedronGeometry(1, 1),
    disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
    // a pennant hanging from its top edge
    pennant: triangle([-0.6, 0, 0], [0.6, 0, 0], [0, -1.1, 0]),
    // a flag flying from a pole, pole at x = 0
    flag: triangle([0, 0, 0], [0, 1.4, 0], [2.6, 0.7, 0]),
  };
  return { list, m, geo };
}
type Kit = ReturnType<typeof makeKit>;

function updateKit(kit: Kit, p: number, night: boolean) {
  const k = night ? 3.4 : 1.6;
  for (const a of kit.list) {
    a.m.color.lerpColors(a.off, a.on, p);
    if (a.glow) a.m.emissiveIntensity = p * k;
  }
  // standby: dim red when off, bright green when on
  const s = kit.m.standby;
  s.emissive.setRGB(1 - p, p, 0.15 * p);
  s.emissiveIntensity = 1.2 + p * (night ? 2.5 : 1.5);
  kit.m.pool.opacity = p * (night ? 0.5 : 0.12);
}

function poolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.45, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- geometry helpers ----------

function triangle(a: number[], b: number[], c: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

// A striped, flat-shaded surface of revolution on an oval: rings of
// [radius 0..1, height], scaled by sx/sz, one colour per stripe.
function stripes(rings: [number, number][], segs: number, sx: number, sz: number, paint: (s: number, k: number) => string) {
  const pos: number[] = [];
  const cols: number[] = [];
  const c = new THREE.Color();
  const P = (r: number, y: number, s: number) => {
    const a = (s / segs) * TAU;
    return [Math.cos(a) * r * sx, y, Math.sin(a) * r * sz];
  };
  const tri = (...v: number[][]) => {
    for (const p of v) {
      pos.push(...p);
      cols.push(c.r, c.g, c.b);
    }
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const [r0, y0] = rings[k];
    const [r1, y1] = rings[k + 1];
    for (let s = 0; s < segs; s++) {
      c.set(paint(s, k));
      const a0 = P(r0, y0, s), a1 = P(r0, y0, s + 1), b0 = P(r1, y1, s), b1 = P(r1, y1, s + 1);
      tri(a0, b0, a1);
      if (r1 > 0) tri(a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function trs(m: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}
// A unit box or cylinder (along y) stretched from a to b.
function seg(m: THREE.Matrix4, a: number[], b: number[], t: number, t2 = t, extra = 0) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  return m.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(t, len + extra, t2));
}

type Put = (m: THREE.Matrix4, c: THREE.Color, i: number) => void;
function inst(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, put: Put, shadow = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.set("#ffffff");
    put(m, c, i);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
  }
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}
type Bulb = [number, number, number, string];
function bulbs(kit: Kit, list: Bulb[], r: number) {
  return inst(kit.geo.ico, kit.m.bulb, list.length, (m, c, i) => {
    const [x, y, z, h] = list[i];
    trs(m, x, y, z, 0.3 * i, 0.7 * i, 0, r);
    c.set(h);
  });
}

// ---------- Vortexa Eye (Ferris wheel) ----------

const W_R = 18;
const W_H = 21.5;
const W_N = 16;

function FerrisWheel({ kit, st }: { kit: Kit; st: StRef }) {
  const spin = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const { m, geo } = kit;
    const legs = inst(geo.box, m.white, 6, (mm, _c, i) => {
      const s = i < 3 ? -1 : 1;
      const top = [0, W_H, s * 2.1];
      const l = [-10, 0, s * 4];
      const r = [10, 0, s * 4];
      const k = i % 3;
      if (k === 0) seg(mm, l, top, 0.9);
      else if (k === 1) seg(mm, r, top, 0.9);
      else {
        const f = 0.62;
        const lerp = (a: number[], b: number[]) => a.map((v, j) => v + (b[j] - v) * (1 - f));
        seg(mm, lerp(l, top), lerp(r, top), 0.6);
      }
    }, true);
    const spokes = inst(geo.box, m.white, W_N * 2, (mm, _c, i) => {
      const a = ((i % W_N) / W_N) * TAU;
      const z = i < W_N ? -1.4 : 1.4;
      seg(mm, [Math.cos(a) * 1.6, Math.sin(a) * 1.6, z], [Math.cos(a) * W_R, Math.sin(a) * W_R, z], 0.34);
    }, true);
    const ties = inst(geo.cyl, m.white, W_N, (mm, _c, i) => {
      const a = (i / W_N) * TAU;
      trs(mm, Math.cos(a) * W_R, Math.sin(a) * W_R, 0, Math.PI / 2, 0, 0, 0.22, 3.4, 0.22);
    }, true);
    const list: Bulb[] = [];
    for (const z of [-1.95, 1.95]) {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        list.push([Math.cos(a) * W_R, Math.sin(a) * W_R, z, i % 2 ? V.yellow : V.white]);
      }
      for (let i = 0; i < 24; i++) {
        const a = ((i + 0.5) / 24) * TAU;
        list.push([Math.cos(a) * 8, Math.sin(a) * 8, z, V.cyan]);
      }
      for (let i = 0; i < W_N; i++) {
        const a = (i / W_N) * TAU;
        for (let j = 1; j <= 6; j++) {
          const r = 1.6 + (j / 7) * (W_R - 1.6);
          list.push([Math.cos(a) * r, Math.sin(a) * r, z * 0.95, i % 2 ? V.pink : V.lilac]);
        }
      }
    }
    const lights = bulbs(kit, list, 0.26);
    const cabinGeo = mergeGeometries([
      new THREE.BoxGeometry(0.16, 0.8, 0.16).translate(0, -0.4, 0),
      new THREE.BoxGeometry(2.1, 1.7, 1.7).translate(0, -1.75, 0),
      new THREE.CylinderGeometry(0.1, 1.6, 0.9, 4).rotateY(Math.PI / 4).translate(0, -0.45, 0),
      new THREE.BoxGeometry(2.3, 0.25, 1.9).translate(0, -2.65, 0),
    ])!;
    const cabins = inst(cabinGeo, m.tint, W_N, (mm, c, i) => {
      trs(mm, 0, -999, 0);
      c.set([V.pink, V.cyan, V.yellow, V.lilac, V.orange, V.cyan, V.pink, V.yellow][i % 8]);
    }, true);
    cabins.frustumCulled = false;
    const rim = new THREE.TorusGeometry(W_R, 0.45, 6, 48);
    const ring = new THREE.TorusGeometry(8, 0.3, 5, 28);
    return { legs, spokes, ties, lights, cabins, rim, ring };
  }, [kit]);

  const mat = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const { t } = st.current;
    const ang = -t * 0.12;
    if (spin.current) spin.current.rotation.z = ang;
    for (let i = 0; i < W_N; i++) {
      const a = ang + (i / W_N) * TAU;
      trs(mat, Math.cos(a) * W_R, W_H + Math.sin(a) * W_R, 0, 0, 0, 0.06 * Math.sin(t * 1.4 + i));
      parts.cabins.setMatrixAt(i, mat);
    }
    parts.cabins.instanceMatrix.needsUpdate = true;
  });

  const { m, geo } = kit;
  return (
    <group position={WHEEL_POS} rotation-y={FACE_CAM}>
      {/* boarding deck */}
      <mesh geometry={geo.box} material={m.lilac} position={[0, 0.5, 0]} scale={[26, 1, 11]} castShadow receiveShadow />
      <mesh geometry={geo.box} material={m.yellow} position={[0, 0.35, 6.2]} scale={[8, 0.7, 1.6]} castShadow receiveShadow />
      <primitive object={parts.legs} />
      <mesh geometry={geo.cyl} material={m.white} position={[0, W_H, 0]} rotation-x={Math.PI / 2} scale={[0.55, 5.4, 0.55]} castShadow />
      <group ref={spin} position={[0, W_H, 0]}>
        <mesh geometry={geo.cyl} material={m.yellow} rotation-x={Math.PI / 2} scale={[1.9, 3.6, 1.9]} castShadow />
        <mesh geometry={parts.rim} material={m.neonPink} position-z={-1.4} castShadow />
        <mesh geometry={parts.rim} material={m.neonPink} position-z={1.4} castShadow />
        <mesh geometry={parts.ring} material={m.neonCyan} position-z={-1.4} />
        <mesh geometry={parts.ring} material={m.neonCyan} position-z={1.4} />
        <primitive object={parts.spokes} />
        <primitive object={parts.ties} />
        <primitive object={parts.lights} />
      </group>
      <primitive object={parts.cabins} />
    </group>
  );
}

// ---------- Carousel ----------

const HORSES = 20;

function Carousel({ kit, st }: { kit: Kit; st: StRef }) {
  const spin = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const { m, geo } = kit;
    const roof = stripes(
      [
        [1, 0],
        [0.62, 1.5],
        [0.25, 2.7],
        [0, 3.3],
      ],
      20,
      9.2,
      9.2,
      (s) => (s % 2 ? V.pink : "#fff6e6"),
    );
    const valance = stripes(
      [
        [1, 0],
        [1, 1.1],
      ],
      20,
      9.2,
      9.2,
      (s) => (s % 2 ? "#f6e83a" : V.pink),
    );
    const ringOf = (i: number) => (i < 12 ? { r: 6.4, a: (i / 12) * TAU } : { r: 3.7, a: ((i - 12 + 0.5) / 8) * TAU });
    const poles = inst(geo.cyl, m.gold, HORSES, (mm, _c, i) => {
      const { r, a } = ringOf(i);
      trs(mm, Math.sin(a) * r, 2.7, Math.cos(a) * r, 0, 0, 0, 0.12, 4.9, 0.12);
    }, true);
    const horseGeo = mergeGeometries([
      new THREE.BoxGeometry(1.8, 0.75, 0.55),
      new THREE.BoxGeometry(0.45, 1.0, 0.42).rotateZ(-0.45).translate(0.8, 0.5, 0),
      new THREE.BoxGeometry(0.8, 0.42, 0.4).rotateZ(-0.25).translate(1.15, 0.95, 0),
      new THREE.BoxGeometry(0.24, 0.95, 0.5).rotateZ(0.35).translate(0.65, -0.72, 0),
      new THREE.BoxGeometry(0.24, 0.95, 0.5).rotateZ(-0.35).translate(-0.65, -0.72, 0),
      new THREE.BoxGeometry(0.18, 0.7, 0.22).rotateZ(0.7).translate(-1.05, 0.0, 0),
      new THREE.BoxGeometry(0.7, 0.18, 0.62).translate(-0.05, 0.45, 0),
    ])!;
    const horses = inst(horseGeo, m.tint, HORSES, (mm, c, i) => {
      trs(mm, 0, -999, 0);
      c.set([V.white, V.pink, V.cyan, V.lilac, V.yellow, V.orange][i % 6]);
    }, true);
    horses.frustumCulled = false;
    const list: Bulb[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      list.push([Math.cos(a) * 9.35, 5.05, Math.sin(a) * 9.35, i % 2 ? V.yellow : V.white]);
    }
    for (let s = 0; s < 20; s += 2) {
      const a = (s / 20) * TAU;
      for (let j = 1; j <= 5; j++) {
        const f = j / 6;
        // follow the roof profile roughly
        const r = 9.2 * (1 - f) + 0.25;
        const y = 6.2 + 3.3 * (1 - (1 - f) ** 1.4) + 0.35;
        list.push([Math.cos(a) * r, y, Math.sin(a) * r, j % 2 ? V.cyan : V.pink]);
      }
    }
    const lights = bulbs(kit, list, 0.22);
    return { roof, valance, poles, horses, lights, ringOf };
  }, [kit]);

  const mat = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const { t } = st.current;
    if (spin.current) spin.current.rotation.y = t * 0.45;
    for (let i = 0; i < HORSES; i++) {
      const { r, a } = parts.ringOf(i);
      trs(mat, Math.sin(a) * r, 2.0 + 0.45 * Math.sin(t * 2.4 + i * 1.7), Math.cos(a) * r, 0, a, 0);
      parts.horses.setMatrixAt(i, mat);
    }
    parts.horses.instanceMatrix.needsUpdate = true;
  });

  const { m, geo } = kit;
  return (
    <group position={CAROUSEL_POS}>
      <mesh geometry={geo.cyl16} material={m.lilac} position={[0, 0.45, 0]} scale={[8.8, 0.9, 8.8]} castShadow receiveShadow />
      <mesh geometry={geo.cyl16} material={m.yellow} position={[0, 0.2, 0]} scale={[9.6, 0.4, 9.6]} receiveShadow />
      <group ref={spin} position={[0, 0.9, 0]}>
        <mesh geometry={geo.cyl16} material={m.cream} position={[0, 0.12, 0]} scale={[8.2, 0.25, 8.2]} receiveShadow />
        <mesh geometry={geo.cyl} material={m.pink} position={[0, 2.8, 0]} scale={[1.4, 5.4, 1.4]} castShadow />
        <primitive object={parts.poles} />
        <primitive object={parts.horses} />
        <mesh geometry={parts.valance} material={m.striped} position={[0, 4.4, 0]} castShadow />
        <mesh geometry={parts.roof} material={m.striped} position={[0, 5.5, 0]} castShadow />
        <mesh geometry={geo.ball} material={m.neonCyan} position={[0, 9.3, 0]} scale={0.75} />
        <group position={[0, -0.9, 0]}>
          <primitive object={parts.lights} />
        </group>
      </group>
    </group>
  );
}

// ---------- Big Top ----------

const roofT = (t: number) => 7.4 + 15.5 * t ** 1.7;
const roofR = (t: number) => 1.04 * (1 - 0.96 * t);

function BigTop({ kit }: { kit: Kit }) {
  const parts = useMemo(() => {
    const { m, geo } = kit;
    const rings: [number, number][] = [
      [1, 0],
      [1, 7],
    ];
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) rings.push([roofR(t), roofT(t)]);
    rings.push([0, roofT(1) + 0.3]);
    const canvas = stripes(rings, 28, TENT_RX, TENT_RZ, (s, k) => (k === 0 ? (s % 2 ? V.lilac : "#fff1dc") : k === 1 ? "#ff4fbf" : s % 2 ? "#ff4fbf" : "#f6e83a"));
    const poleXs = [0, -15, 15];
    const poleTop = [roofT(1) + 3.6, 18.6, 18.6];
    const poles = inst(geo.cyl, m.white, 3, (mm, _c, i) => {
      const bot = i === 0 ? roofT(1) - 1 : 12.5;
      trs(mm, poleXs[i], (bot + poleTop[i]) / 2, 0, 0, 0, 0, 0.32, poleTop[i] - bot, 0.32);
    }, true);
    const flags = inst(geo.flag, m.tint, 3, (mm, c, i) => {
      trs(mm, poleXs[i], poleTop[i] - 1.4, 0, 0, 0.4, 0, i === 0 ? 1.5 : 1.1);
      c.set(i === 0 ? V.pink : V.cyan);
    }, true);
    const bunting = inst(geo.pennant, m.tint, 60, (mm, c, i) => {
      const a = (i / 60) * TAU;
      const nx = Math.cos(a) / TENT_RX;
      const nz = Math.sin(a) / TENT_RZ;
      trs(mm, Math.cos(a) * TENT_RX * 1.045, 7.35, Math.sin(a) * TENT_RZ * 1.045, 0, Math.atan2(nx, nz), 0, 1.1);
      c.set(BULB_COLORS[i % 5]);
    });
    const list: Bulb[] = [];
    for (let s = 0; s < 14; s++) {
      const a = (s / 14) * TAU;
      for (let j = 1; j <= 10; j++) {
        const t = j / 11;
        const r = roofR(t);
        list.push([Math.cos(a) * r * TENT_RX, roofT(t) + 0.55, Math.sin(a) * r * TENT_RZ, s % 2 ? V.yellow : V.white]);
      }
    }
    for (let i = 0; i < 72; i++) {
      const a = ((i + 0.5) / 72) * TAU;
      list.push([Math.cos(a) * TENT_RX * 1.06, 7.55, Math.sin(a) * TENT_RZ * 1.06, i % 2 ? V.pink : V.yellow]);
    }
    // entrance (local +x end): round the door and along the gable
    const ex = TENT_RX + 3.15;
    for (let j = 0; j < 9; j++) {
      list.push([ex, 0.6 + j * 0.75, -2.9, V.cyan]);
      list.push([ex, 0.6 + j * 0.75, 2.9, V.cyan]);
    }
    for (let j = 0; j <= 8; j++) list.push([ex, 7.1, -2.9 + (j / 8) * 5.8, V.cyan]);
    for (let j = 0; j <= 12; j++) {
      const a = (j / 12) * Math.PI;
      list.push([TENT_RX + 3.35, 10.1 + 2.45 * Math.sin(a), 5.5 * Math.cos(a), V.yellow]);
    }
    const lights = bulbs(kit, list, 0.26);
    return { canvas, poles, flags, bunting, lights };
  }, [kit]);

  const { m, geo } = kit;
  return (
    <group position={TENT_POS} rotation-y={TENT_ROT}>
      <mesh geometry={parts.canvas} material={m.striped} castShadow receiveShadow />
      <primitive object={parts.poles} />
      <primitive object={parts.flags} />
      <primitive object={parts.bunting} />
      {/* entrance porch */}
      <mesh geometry={geo.box} material={m.yellow} position={[TENT_RX - 0.5, 4.5, 0]} scale={[7, 9, 11]} castShadow receiveShadow />
      <mesh geometry={geo.cyl} material={m.pink} position={[TENT_RX - 0.5, 10.1, 0]} rotation={[0, 0, Math.PI / 2]} scale={[2.8, 7.4, 6.2]} castShadow />
      <mesh geometry={geo.box} material={m.ink} position={[TENT_RX + 3.0, 3.4, 0]} scale={[0.3, 6.6, 5.2]} />
      <primitive object={parts.lights} />
    </group>
  );
}

// ---------- VORTEXA gate ----------

const GLYPHS: Record<string, number[][]> = {
  V: [
    [0, 4, 1, 0],
    [1, 0, 2, 4],
  ],
  O: [
    [0, 0, 2, 0],
    [2, 0, 2, 4],
    [2, 4, 0, 4],
    [0, 4, 0, 0],
  ],
  R: [
    [0, 0, 0, 4],
    [0, 4, 2, 4],
    [2, 4, 2, 2],
    [2, 2, 0, 2],
    [0.9, 2, 2, 0],
  ],
  T: [
    [0, 4, 2, 4],
    [1, 4, 1, 0],
  ],
  E: [
    [0, 0, 0, 4],
    [0, 4, 2, 4],
    [0, 2, 1.5, 2],
    [0, 0, 2, 0],
  ],
  X: [
    [0, 0, 2, 4],
    [0, 4, 2, 0],
  ],
  A: [
    [0, 0, 1, 4],
    [1, 4, 2, 0],
    [0.5, 2, 1.5, 2],
  ],
};

function Gate({ kit }: { kit: Kit }) {
  const parts = useMemo(() => {
    const { m, geo } = kit;
    const strokes: [number[], number[], string][] = [];
    const u = 0.7;
    const y0 = 7.25;
    "VORTEXA".split("").forEach((ch, li) => {
      const x0 = -7 + li * 2.1;
      for (const [ax, ay, bx, by] of GLYPHS[ch]) strokes.push([[x0 + ax * u, y0 + ay * u, 0.45], [x0 + bx * u, y0 + by * u, 0.45], V.yellow]);
    });
    const L = -8.6, R = 8.6, B = 6.75, T = 10.45;
    for (const [a, b] of [
      [[L, B], [R, B]],
      [[R, B], [R, T]],
      [[R, T], [L, T]],
      [[L, T], [L, B]],
    ]) strokes.push([[a[0], a[1], 0.45], [b[0], b[1], 0.45], V.pink]);
    const neon = inst(geo.box, m.bulb, strokes.length, (mm, c, i) => {
      const [a, b, h] = strokes[i];
      seg(mm, a, b, 0.28, 0.25, 0.28);
      c.set(h);
    });
    const caps = inst(geo.box, m.yellow, 6, (mm, _c, i) => {
      const x = i % 2 ? 10.1 : -10.1;
      const k = Math.floor(i / 2);
      if (k === 0) trs(mm, x, 11.05, 0, 0, 0, 0, 3.1, 0.9, 3.1);
      else trs(mm, x, k === 1 ? 1.2 : 4.6, 0, 0, 0, 0, 2.5, 0.45, 2.5);
    }, true);
    const balls = inst(geo.ball, m.bulb, 2, (mm, c, i) => {
      trs(mm, i ? 10.1 : -10.1, 12.0, 0, 0, 0, 0, 0.8);
      c.set(V.cyan);
    });
    const list: Bulb[] = [];
    for (const x of [-10.1, 10.1]) {
      for (const dx of [-0.75, 0.75]) for (let j = 0; j < 13; j++) list.push([x + dx, 0.9 + j * 0.75, 1.2, j % 2 ? V.cyan : V.white]);
    }
    for (let j = 0; j <= 24; j++) list.push([-8.6 + (j / 24) * 17.2, 6.25, 0.4, j % 2 ? V.pink : V.yellow]);
    const lights = bulbs(kit, list, 0.2);
    return { neon, caps, balls, lights };
  }, [kit]);

  const { m, geo } = kit;
  return (
    <group position={GATE_POS} rotation-y={FACE_CAM}>
      <mesh geometry={geo.box} material={m.navy} position={[-10.1, 5.3, 0]} scale={[2.2, 10.6, 2.2]} castShadow receiveShadow />
      <mesh geometry={geo.box} material={m.navy} position={[10.1, 5.3, 0]} scale={[2.2, 10.6, 2.2]} castShadow receiveShadow />
      <mesh geometry={geo.box} material={m.ink} position={[0, 8.6, 0]} scale={[18, 4.2, 0.6]} castShadow />
      <primitive object={parts.caps} />
      <primitive object={parts.balls} />
      <primitive object={parts.neon} />
      <primitive object={parts.lights} />
    </group>
  );
}

// ---------- power box, cables, light pools ----------

function PowerBox({ kit }: { kit: Kit }) {
  const parts = useMemo(() => {
    const { m, geo } = kit;
    const bolt: number[][][] = [
      [
        [0.25, 1.95, 0.6],
        [-0.2, 1.3, 0.6],
      ],
      [
        [-0.2, 1.3, 0.6],
        [0.2, 1.3, 0.6],
      ],
      [
        [0.2, 1.3, 0.6],
        [-0.25, 0.65, 0.6],
      ],
    ];
    const boltMesh = inst(geo.box, m.bulb, 3, (mm, c, i) => {
      seg(mm, bolt[i][0], bolt[i][1], 0.16, 0.1, 0.16);
      c.set(V.yellow);
    });
    // cables from the box to each ride, on the ground
    const targets: [number[], number][] = [
      [WHEEL_POS, 14],
      [CAROUSEL_POS, 10.5],
      [[GATE_POS[0] - 7.14, 0, GATE_POS[2] + 7.14], 1.6],
      [[TENT_POS[0] + Math.cos(TENT_ROT) * (TENT_RX + 4), 0, TENT_POS[2] - Math.sin(TENT_ROT) * (TENT_RX + 4)], 1],
    ];
    const cables = inst(geo.box, m.bulb, targets.length, (mm, c, i) => {
      const [to, r] = targets[i];
      const dx = to[0] - BOX_POS[0];
      const dz = to[2] - BOX_POS[2];
      const len = Math.hypot(dx, dz);
      const f = (len - r) / len;
      seg(mm, [BOX_POS[0], 0.08, BOX_POS[2]], [BOX_POS[0] + dx * f, 0.08, BOX_POS[2] + dz * f], 0.16);
      c.set(V.cyan);
    });
    const pools = inst(geo.disc, m.pool, 5, (mm, c, i) => {
      const spots: [number[], number, string][] = [
        [WHEEL_POS, 17, V.pink],
        [CAROUSEL_POS, 13, V.yellow],
        [[GATE_POS[0] + 4, 0, GATE_POS[2] + 4], 11, V.cyan],
        [targets[3][0], 11, V.yellow],
        [BOX_POS, 4, V.orange],
      ];
      const [p, r, h] = spots[i];
      trs(mm, p[0], 0.06 + i * 0.01, p[2], 0, 0, 0, r, 1, r);
      c.set(h);
    });
    return { boltMesh, cables, pools };
  }, [kit]);

  const { m, geo } = kit;
  return (
    <>
      <primitive object={parts.cables} />
      <primitive object={parts.pools} />
      <group position={BOX_POS} rotation-y={FACE_CAM}>
        <mesh geometry={geo.box} material={m.concrete} position={[0, 0.15, 0]} scale={[3, 0.3, 2.2]} receiveShadow castShadow />
        <mesh geometry={geo.box} material={m.orange} position={[0, 1.3, 0]} scale={[1.6, 2.0, 1.1]} castShadow />
        <mesh geometry={geo.box} material={m.ink} position={[0, 2.4, 0]} scale={[1.9, 0.2, 1.4]} castShadow />
        <mesh geometry={geo.ball} material={m.standby} position={[0.45, 2.75, 0.3]} scale={0.24} />
        <primitive object={parts.boltMesh} />
      </group>
    </>
  );
}

// ---------- all four rides ----------

export function FunfairRides({ power, night }: FunfairStyleProps) {
  const kit = useMemo(makeKit, []);
  const st = useRef<State>({ p: power, t: 0 });
  const pinkLight = useRef<THREE.PointLight>(null);
  const yellowLight = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    const s = st.current;
    s.p += (power - s.p) * Math.min(1, d * 1.6);
    if (Math.abs(power - s.p) < 0.002) s.p = power;
    s.t += d * s.p;
    updateKit(kit, s.p, night);
    const li = s.p * (night ? 650 : 0);
    if (pinkLight.current) pinkLight.current.intensity = li;
    if (yellowLight.current) yellowLight.current.intensity = li;
  });

  const tentDoor: [number, number, number] = [TENT_POS[0] + Math.cos(TENT_ROT) * (TENT_RX + 14), 9, TENT_POS[2] - Math.sin(TENT_ROT) * (TENT_RX + 14)];
  return (
    <group>
      <FerrisWheel kit={kit} st={st} />
      <Carousel kit={kit} st={st} />
      <BigTop kit={kit} />
      <Gate kit={kit} />
      <PowerBox kit={kit} />
      <pointLight ref={pinkLight} color={V.pink} position={[WHEEL_POS[0], 8, WHEEL_POS[2]]} distance={45} decay={2} intensity={0} />
      <pointLight ref={yellowLight} color="#ffe26a" position={tentDoor} distance={40} decay={2} intensity={0} />
    </group>
  );
}
