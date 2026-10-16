import * as THREE from "three";

import { Bake, G, TAU, mat, segMat, type Bulbs, type V3 } from "../central/kit";
import { VX } from "../common";

// DRAFT: the West zone's kit, style A "Neon Cyber" (funfair-lab/styleA.tsx)
// brightened for day: silver-white steel with Vortexa neon tubes, so the rides
// don't read as dark holes from far away. Modelled in metres: x north, y up,
// z east (the zone group is scaled by UNITS_PER_M). Static pieces are baked
// with central/kit's Bake into a few merged meshes; bulbs are instanced.
//
// The power look:
// - frames: `uFade` (1 = off) takes most of the colour out of the paint;
// - lights: tubes and bulbs share one material. Each vertex or instance has
//   `aTS` = (threshold, seed) and switches on once the zone's power passes its
//   threshold, so the power-up plays as a sequence. The seed's sign tells them
//   apart: a tube (seed < 0) stays steady and, dead, is light grey glass; a
//   bulb (seed >= 0) chases and, dead, is dark glass. A dead light is shaded
//   by the scene like any surface (grey by day, dark at night); a lit one
//   glows (emissive, so bloom picks it up at night).

/** Frame and paint colours: light steel and soft accents. */
export const STEEL = {
  white: "#f2f4f9",
  silver: "#d3d8e2",
  steel: "#aab1bf",
  graphite: "#666d7d",
  pink: "#ff6cc6",
  rose: "#ffc2e4",
  lilac: "#d9bff7",
  cyan: "#6ae6f0",
  yellow: "#f6f07c",
  orange: "#ffad5c",
  pearl: "#f7f1ff",
  cream: "#fff3e2",
  wood: "#d5b089",
  deck: "#e6d2b4",
  red: "#ef3b4f",
  leaf: "#5aa63f",
  leafDark: "#3f8a33",
  palm: "#59ad4c",
  trunk: "#8a6446",
  water: "#4fb8dd",
} as const;

/** Neon and bulb colours: the Vortexa palette. West's own accent is pink. */
export const NEON = {
  pink: VX.pink,
  cyan: VX.cyan,
  lilac: VX.lilac,
  yellow: VX.yellow,
  orange: VX.orange,
  warm: "#ffd79a",
  white: "#fff5e6",
} as const;
export const LIGHTS: string[] = [VX.pink, VX.cyan, VX.yellow, VX.lilac, VX.orange];

/** A tube's seed (negative: steady, light grey when dead). */
export const tubeSeed = (k: number) => -1 - Math.abs(k);

// ---------- smooth base geometries (non-indexed, smooth normals: steel tubes catch the light) ----------

function smoothGeo(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute("uv");
  return n;
}

export const S = {
  /** Open tubes (no caps), radius 1, 1 long along y, centred. */
  tube4: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 4, 1, true)),
  tube6: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)),
  tube8: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)),
  tube16: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)),
  cyl12: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 12)),
  cyl20: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 20)),
  cyl32: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 32)),
  /** A frustum: top radius 0.62, bottom 1. */
  taper12: smoothGeo(new THREE.CylinderGeometry(0.62, 1, 1, 12)),
  cone12: smoothGeo(new THREE.ConeGeometry(1, 1, 12)),
  cone16: smoothGeo(new THREE.ConeGeometry(1, 1, 16)),
  ball: smoothGeo(new THREE.IcosahedronGeometry(1, 1)),
  /** Upper half sphere, radius 1, its rim at y = 0. */
  dome: smoothGeo(new THREE.SphereGeometry(1, 14, 5, 0, TAU, 0, Math.PI / 2)),
  /** A cheap dome for small things (canopies, roofs). */
  domeLo: smoothGeo(new THREE.SphereGeometry(1, 8, 3, 0, TAU, 0, Math.PI / 2)),
  cyl10: smoothGeo(new THREE.CylinderGeometry(1, 1, 1, 10)),
  /** A tub: top radius 1, bottom 0.7, 8 sides. */
  tub: smoothGeo(new THREE.CylinderGeometry(1, 0.7, 1, 8)),
  /** A bulb: an octahedron (8 triangles; they're small). */
  bulb: smoothGeo(new THREE.OctahedronGeometry(1, 0)),
};

// ---------- baking helpers ----------

/** n points on a circle round c, radius r, in the plane of unit vectors u and v (starting at u, turning towards v). */
export function circlePts(c: V3, r: number, n: number, u: V3 = [1, 0, 0], v: V3 = [0, 0, -1], a0 = 0): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * TAU;
    const ca = Math.cos(a) * r;
    const sa = Math.sin(a) * r;
    return [c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa];
  });
}

/**
 * A neon tube (or steel bar, with `seed` >= 0 ignored by the frame material) through the points.
 * `t` is the light threshold: a number, or one per segment (current running along it).
 */
export function tube(
  b: Bake,
  pts: V3[],
  r: number,
  c: THREE.ColorRepresentation | ((i: number) => THREE.ColorRepresentation),
  t: number | ((i: number) => number) = 0,
  k = 0,
  closed = false,
  joints = false,
  g = S.tube6,
) {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const e = pts[(i + 1) % pts.length];
    const col = typeof c === "function" ? c(i) : c;
    const ti = typeof t === "function" ? t(i) : t;
    b.add(g, segMat(a, e, r), col, ti, tubeSeed(k + i));
    if (joints && (closed || i > 0)) b.add(G.ico, mat(a[0], a[1], a[2], r * 1.08), col, ti, tubeSeed(k + i));
  }
}

/** A steel bar from a to b (frame Bake). */
export function bar(b: Bake, c: THREE.ColorRepresentation, a: V3, e: V3, r: number, g = S.tube8) {
  b.add(g, segMat(a, e, r), c);
}

// ---------- materials ----------

export type Uniform<T> = { value: T };

function glowTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.42)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type LightUniforms = {
  p: Uniform<number>;
  on: Uniform<number>;
  time: Uniform<number>;
  flick: Uniform<number>;
  chase: Uniform<number>;
};

/**
 * Tubes and bulbs. With `offset`, the mesh is instanced and each instance has an `aIT` attribute that delays its
 * threshold (one instanced ride standing in two places).
 */
function lightMaterial(u: LightUniforms, key: string, offset: boolean) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, toneMapped: false });
  if (offset) m.defines = { USE_IT: "" };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uP: u.p, uOn: u.on, uTime: u.time, uFlick: u.flick, uChase: u.chase });
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 aTS;\nvarying vec2 vTS;\n#ifdef USE_IT\nattribute float aIT;\n#endif",
      )
      .replace("#include <color_vertex>", "#include <color_vertex>\nvTS = aTS;\n#ifdef USE_IT\nvTS.x += aIT;\n#endif");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uP, uOn, uTime, uFlick, uChase;\nvarying vec2 vTS;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float lit = smoothstep(vTS.x, vTS.x + 0.04, uP);
        float hz = fract(sin(vTS.y * 91.7 + floor(uTime * 15.0) * 1.37) * 43758.5);
        lit *= mix(1.0, step(0.4, hz), uFlick * step(0.001, lit));
        float bulbK = step(0.0, vTS.y);
        float chase = 1.0 - uChase * bulbK * 0.45 * step(0.66, fract(vTS.y / 3.0 - uTime * 1.6));
        vec3 deadTube = mix(vec3(0.62, 0.63, 0.68), diffuseColor.rgb, 0.16);
        vec3 deadBulb = mix(vec3(0.06, 0.06, 0.075), diffuseColor.rgb, 0.07);
        totalEmissiveRadiance = diffuseColor.rgb * uOn * chase * lit;
        diffuseColor.rgb = mix(deadTube, deadBulb, bulbK) * (1.0 - lit);`,
      );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export function makeWestKit() {
  const u = {
    /** 1 = powered off (paint loses its colour). */
    fade: { value: 1 } as Uniform<number>,
    /** The shown power, 0..1: lights compare it with their thresholds. */
    p: { value: 0 } as Uniform<number>,
    /** Brightness of a lit light (higher at night). */
    on: { value: 1.35 } as Uniform<number>,
    time: { value: 0 } as Uniform<number>,
    /** 1 while powering up in full mode: lights flicker as they catch. */
    flick: { value: 0 } as Uniform<number>,
    /** Bulbs chase (a running dim wave). */
    chase: { value: 1 } as Uniform<number>,
  };

  // Steel and paint. A little metal, so the frames catch the sky; light colours, so they read by day.
  const frame = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.12 });
  frame.onBeforeCompile = (s) => {
    s.uniforms.uFade = u.fade;
    s.fragmentShader =
      "uniform float uFade;\n" +
      s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float fadeL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fadeL) * vec3(0.93, 0.93, 0.98) + 0.02, uFade * 0.7) * (1.0 - 0.08 * uFade);`,
      );
  };
  frame.customProgramCacheKey = () => "fz-west-frame";

  // Ground paving: never fades. Pulled towards the camera a touch so it never fights the lawn.
  const paving = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });

  const water = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.1 });

  const light = lightMaterial(u, "fz-west-light", false);
  const lightI = lightMaterial(u, "fz-west-light-it", true);

  const glow = glowTexture();
  const pool = new THREE.MeshBasicMaterial({
    map: glow,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const halo = new THREE.SpriteMaterial({
    map: glow,
    color: "#ff2020",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const standby = new THREE.MeshBasicMaterial({ color: "#ff2020", toneMapped: false });
  const spark = new THREE.MeshBasicMaterial({ color: "#fff6b0", toneMapped: false });
  // the lighthouse's beams: vertex colours fade them out along their length (additive: black is invisible)
  const beam = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  return { u, frame, paving, water, light, lightI, pool, halo, standby, spark, beam, glow };
}
export type WestKit = ReturnType<typeof makeWestKit>;

export function disposeWestKit(k: WestKit) {
  for (const m of [k.frame, k.paving, k.water, k.light, k.lightI, k.pool, k.halo, k.standby, k.spark, k.beam]) m.dispose();
  k.glow.dispose();
}

/** The instanced bulbs (central/kit's Bulbs list), as octahedra: the same look at map distances for 8 triangles each. */
export function bulbsMesh(list: Bulbs["list"], material: THREE.Material) {
  const n = list.length;
  const base = new Bake().add(S.bulb, new THREE.Matrix4(), "#ffffff").geometry();
  const mesh = new THREE.InstancedMesh(base, material, Math.max(n, 1));
  mesh.count = n;
  const ts = new Float32Array(Math.max(n, 1) * 2);
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  list.forEach((b, i) => {
    mesh.setMatrixAt(i, mat(b.p[0], b.p[1], b.p[2], b.r, b.r, b.r, i * 0.7, i * 0.3, 0, m));
    mesh.setColorAt(i, c.set(b.c));
    ts[i * 2] = b.t;
    ts[i * 2 + 1] = b.seed;
  });
  mesh.geometry.setAttribute("aTS", new THREE.InstancedBufferAttribute(ts, 2));
  mesh.computeBoundingSphere();
  return mesh;
}

/** Gives an instanced mesh its per-instance threshold delays (for `lightI`). */
export function setInstanceDelay(mesh: THREE.InstancedMesh, delays: number[]) {
  const a = new Float32Array(Math.max(1, mesh.count));
  delays.forEach((d, i) => (a[i] = d));
  mesh.geometry.setAttribute("aIT", new THREE.InstancedBufferAttribute(a, 1));
}
