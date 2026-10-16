import * as THREE from "three";

import { LITE_LIGHT_SCALE, VX } from "../common";

// DRAFT: the shared kit of the Central zone (style C, "toy low-poly").
// Everything is modelled in metres: x north, y up, z east (the zone group is
// scaled by UNITS_PER_M). Static pieces are baked into a few merged meshes with
// vertex colours; bulbs are instanced.
//
// Two shader tweaks carry the power look:
// - paint: `uFade` (1 = powered off) greys and darkens the colours, so the park
//   looks abandoned while it is off;
// - lights (bulbs and neon): each vertex or instance has `aTS` = (threshold,
//   seed). It switches on once the zone's power passes its threshold, which
//   plays the power-up as a sequence. Off, it is a dead grey tube or bulb.

export const TAU = Math.PI * 2;

/** Toy paints: the Vortexa colours, a touch softer so they read as paint, not light. */
export const PAINT = {
  yellow: "#f6e83a",
  pink: "#ff4fbf",
  cyan: "#2fd6e6",
  lilac: "#c9a2f2",
  orange: "#fc9e3d",
  navy: "#0b4a80",
  cream: "#fff1dc",
  white: "#f6f2ff",
  red: "#ef3b4f",
  mint: "#7be0c3",
  wood: "#c98a55",
  steel: "#6c7387",
  ink: "#2a2342",
  stone: "#e6d9c7",
  stoneDark: "#bfae98",
  tile: "#d7c8f0",
  leaf: "#5aa63f",
  leafDark: "#3f8a33",
  trunk: "#7a5236",
  rubber: "#26232e",
} as const;

export const BULB_COLORS: string[] = [VX.yellow, VX.cyan, VX.pink, VX.lilac, VX.orange];
export const STALL_COLORS: string[] = [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.lilac, PAINT.orange, PAINT.mint];

// ---------- matrices ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export type V3 = [number, number, number];

/** A shared matrix: translate, rotate (x, y, z in that Euler order: XYZ), scale. Use it right away. */
export function mat(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0, out = _m) {
  _q.setFromEuler(_e.set(rx, ry, rz, "YXZ"));
  return out.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** A shared matrix that stretches a unit piece along y from a to b, `w` x `d` thick. */
export function segMat(a: V3, b: V3, w: number, d = w, out = _m) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length() || 1e-6;
  _q.setFromUnitVectors(UP, _d.normalize());
  return out.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(w, len, d));
}

// ---------- base geometries (non-indexed) ----------

function flat(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute("uv");
  n.computeVertexNormals();
  return n;
}

function triangle(a: V3, b: V3, c: V3) {
  const g = new THREE.BufferGeometry();
  // both faces, so a pennant shows from either side
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return g;
}

function starShape(inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? inner : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** A five-point star in the xy plane, radius 1, `depth` thick (centred on z = 0). */
function starGeometry(depth: number) {
  return new THREE.ExtrudeGeometry(starShape(), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

/** The outline of a five-point star (radius 1, xy plane), for neon tubes and bulbs. */
export function starPoints(inner = 0.45): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? inner : 1;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

export const G = {
  box: flat(new THREE.BoxGeometry(1, 1, 1)),
  /** A flat 1 x 1 square on the ground (facing up). */
  quad: flat(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  disc48: flat(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
  cyl48: flat(new THREE.CylinderGeometry(1, 1, 1, 48)),
  star: flat(starGeometry(1)),
  /** A flat star tile on the ground (facing up), radius 1. */
  starTile: flat(new THREE.ShapeGeometry(starShape()).rotateX(-Math.PI / 2)),
  cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6)),
  cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cyl12: flat(new THREE.CylinderGeometry(1, 1, 1, 12)),
  cyl20: flat(new THREE.CylinderGeometry(1, 1, 1, 20)),
  cyl32: flat(new THREE.CylinderGeometry(1, 1, 1, 32)),
  /** A cup-like frustum: top radius 1, bottom 0.65. */
  cup: flat(new THREE.CylinderGeometry(1, 0.65, 1, 12)),
  cone6: flat(new THREE.ConeGeometry(1, 1, 6)),
  cone8: flat(new THREE.ConeGeometry(1, 1, 8)),
  cone12: flat(new THREE.ConeGeometry(1, 1, 12)),
  cone20: flat(new THREE.ConeGeometry(1, 1, 20)),
  ico: flat(new THREE.IcosahedronGeometry(1, 0)),
  ball: flat(new THREE.IcosahedronGeometry(1, 1)),
  torus: flat(new THREE.TorusGeometry(1, 0.12, 4, 24).rotateX(Math.PI / 2)),
  /** A pennant hanging from its top edge (x across, y down). */
  pennant: triangle([-0.5, 0, 0], [0.5, 0, 0], [0, -0.9, 0]),
  disc: flat(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)),
};

// ---------- baking ----------

const _c = new THREE.Color();
const _n3 = new THREE.Matrix3();
const _p = new THREE.Vector3();

/**
 * Collects transformed pieces into one non-indexed geometry with vertex
 * colours and an `aTS` attribute (light threshold, seed).
 */
export class Bake {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  ts: number[] = [];
  /** Thickness factor for bars and tubes (`seg`, west/kit's `tube` and `bar`): lights are drawn thicker in lite. */
  widen = 1;

  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation, t = 0, seed = 0) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    _n3.getNormalMatrix(m);
    _c.set(color);
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_p.x, _p.y, _p.z);
      _p.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize();
      this.nor.push(_p.x, _p.y, _p.z);
      this.col.push(_c.r, _c.g, _c.b);
      this.ts.push(t, seed);
    }
    return this;
  }

  /** Box centred at p, size s, turned ry about y. */
  box(c: THREE.ColorRepresentation, p: V3, s: V3, ry = 0, t = 0, seed = 0) {
    return this.add(G.box, mat(p[0], p[1], p[2], s[0], s[1], s[2], ry), c, t, seed);
  }

  /** Cylinder (base geometry g) centred at p, radius r (or [rx, rz]), height h. */
  cyl(c: THREE.ColorRepresentation, p: V3, r: number | [number, number], h: number, g = G.cyl12, ry = 0) {
    const [rx, rz] = typeof r === "number" ? [r, r] : r;
    return this.add(g, mat(p[0], p[1], p[2], rx, h, rz, ry), c);
  }

  /** Ball (icosahedron) centred at p. */
  ball(c: THREE.ColorRepresentation, p: V3, r: number | V3, g = G.ico, t = 0, seed = 0) {
    const [rx, ry, rz] = typeof r === "number" ? [r, r, r] : r;
    return this.add(g, mat(p[0], p[1], p[2], rx, ry, rz), c, t, seed);
  }

  /** A bar (box or cylinder) from a to b. */
  seg(c: THREE.ColorRepresentation, a: V3, b: V3, w: number, g = G.box, t = 0, seed = 0) {
    return this.add(g, segMat(a, b, w * this.widen), c, t, seed);
  }

  /** One flat triangle (both faces when `both`). */
  tri(c: THREE.ColorRepresentation, a: V3, b: V3, d: V3, both = false, t = 0, seed = 0) {
    _c.set(c);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const put = (p: V3, s: number) => {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx * s, ny * s, nz * s);
      this.col.push(_c.r, _c.g, _c.b);
      this.ts.push(t, seed);
    };
    put(a, 1);
    put(b, 1);
    put(d, 1);
    if (both) {
      put(a, -1);
      put(d, -1);
      put(b, -1);
    }
    return this;
  }

  /** A quad a-b-c-d (counter-clockwise seen from its front). */
  quad(c: THREE.ColorRepresentation, a: V3, b: V3, cc: V3, d: V3, both = false) {
    this.tri(c, a, b, cc, both);
    return this.tri(c, a, cc, d, both);
  }

  /**
   * A surface of revolution about the y axis through `o`: rings of [radius, y],
   * `segs` sides, one colour per side and ring band (stripes).
   */
  revolve(o: V3, rings: [number, number][], segs: number, color: (s: number, k: number) => THREE.ColorRepresentation, both = false, a0 = 0) {
    const P = (r: number, y: number, s: number): V3 => {
      const a = a0 + (s / segs) * TAU;
      return [o[0] + Math.cos(a) * r, o[1] + y, o[2] - Math.sin(a) * r];
    };
    for (let k = 0; k < rings.length - 1; k++) {
      const [r0, y0] = rings[k];
      const [r1, y1] = rings[k + 1];
      for (let s = 0; s < segs; s++) {
        const c = color(s, k);
        const a = P(r0, y0, s), b = P(r0, y0, s + 1), d = P(r1, y1, s), e = P(r1, y1, s + 1);
        if (r0 > 1e-4) this.tri(c, a, b, e, both);
        if (r1 > 1e-4) this.tri(c, a, e, d, both);
      }
    }
    return this;
  }

  get count() {
    return this.pos.length / 3;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aTS", new THREE.Float32BufferAttribute(this.ts, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** A Bake for lights (neon tubes and bars): thicker in lite, so they read from map distances on phones. */
export function lightBake(lite: boolean) {
  const b = new Bake();
  b.widen = lite ? LITE_LIGHT_SCALE : 1;
  return b;
}

/** One base geometry, white vertex colours (for instancing with per-instance colour). */
export function white(g: THREE.BufferGeometry, m = new THREE.Matrix4()) {
  return new Bake().add(g, m, "#ffffff").geometry();
}

// ---------- bulbs ----------

export type Bulb = { p: V3; r: number; c: string; t: number; seed: number };

export class Bulbs {
  list: Bulb[] = [];
  constructor(private stride = 1) {}
  private n = 0;
  /** Adds a bulb; with stride 2 (lite) every other one is dropped. */
  add(p: V3, r: number, c: string, t: number, seed = this.list.length) {
    if (this.n++ % this.stride === 0) this.list.push({ p, r, c, t, seed });
  }
  /** Bulbs along a hanging string from a to b (catenary-ish sag). */
  string(a: V3, b: V3, n: number, sag: number, r: number, colors: string[], t0: number, t1: number) {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f);
      this.add([a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f], r, colors[i % colors.length], t0 + (t1 - t0) * f);
    }
  }
  /** A ring of bulbs. */
  ring(cx: number, y: number, cz: number, rad: number, n: number, r: number, colors: string[], t0: number, t1: number, rz = rad) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.add([cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rz], r, colors[i % colors.length], t0 + ((t1 - t0) * i) / n);
    }
  }
  /** The instanced bulbs; `scale` sizes them all (bigger in lite, where there are fewer). */
  mesh(material: THREE.Material, scale = 1) {
    const n = this.list.length;
    const mesh = new THREE.InstancedMesh(white(G.ico), material, Math.max(n, 1));
    mesh.count = n;
    const ts = new Float32Array(Math.max(n, 1) * 2);
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    this.list.forEach((b, i) => {
      const r = b.r * scale;
      mesh.setMatrixAt(i, mat(b.p[0], b.p[1], b.p[2], r, r, r, i * 0.7, i * 0.3, 0, m));
      mesh.setColorAt(i, c.set(b.c));
      ts[i * 2] = b.t;
      ts[i * 2 + 1] = b.seed;
    });
    mesh.geometry.setAttribute("aTS", new THREE.InstancedBufferAttribute(ts, 2));
    mesh.computeBoundingSphere();
    return mesh;
  }
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

export function makeKit() {
  const u = {
    fade: { value: 1 } as Uniform<number>,
    p: { value: 0 } as Uniform<number>,
    on: { value: 1.5 } as Uniform<number>,
    time: { value: 0 } as Uniform<number>,
    flick: { value: 1 } as Uniform<number>,
    chase: { value: 1 } as Uniform<number>,
    noChase: { value: 0 } as Uniform<number>,
    /** Powered paint's own glow at night in lite (LITE_SELF_LIT). */
    self: { value: 0 } as Uniform<number>,
  };

  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0 });
  paint.onBeforeCompile = (s) => {
    s.uniforms.uFade = u.fade;
    s.uniforms.uSelf = u.self;
    s.fragmentShader = "uniform float uFade, uSelf;\n" + s.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float fadeL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fadeL) * vec3(0.78, 0.76, 0.84) + vec3(0.03), uFade * 0.82) * (1.0 - 0.28 * uFade);`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n      totalEmissiveRadiance += diffuseColor.rgb * uSelf;");
  };
  paint.customProgramCacheKey = () => "fz-central-paint";

  // Ground paving: never fades (the ground is the ground).
  const paving = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    // lit walkways at night in lite (emissiveIntensity set each frame)
    emissive: "#fff0d8",
    emissiveIntensity: 0,
  });

  const light = (chase: Uniform<number>, key: string) => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uP: u.p, uOn: u.on, uTime: u.time, uFlick: u.flick, uChase: chase });
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aTS;\nvarying vec2 vTS;")
        .replace("#include <color_vertex>", "#include <color_vertex>\nvTS = aTS;");
      s.fragmentShader = s.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uP, uOn, uTime, uFlick, uChase;\nvarying vec2 vTS;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float lit = smoothstep(vTS.x, vTS.x + 0.04, uP);
          float hz = fract(sin(vTS.y * 91.7 + floor(uTime * 15.0) * 1.37) * 43758.5);
          lit *= mix(1.0, step(0.4, hz), uFlick * step(0.001, lit) * step(uP, 0.995));
          float chase = 1.0 - uChase * 0.45 * step(0.66, fract(vTS.y / 3.0 - uTime * 1.6));
          vec3 deadC = mix(vec3(0.15, 0.15, 0.18), diffuseColor.rgb * 0.22, 0.35);
          diffuseColor.rgb = mix(deadC, diffuseColor.rgb * uOn * chase, lit);`,
        );
    };
    m.customProgramCacheKey = () => key;
    return m;
  };
  const bulb = light(u.chase, "fz-central-bulb");
  const neon = light(u.noChase, "fz-central-neon");

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
  const cable = new THREE.MeshBasicMaterial({ toneMapped: false });
  const spark = new THREE.MeshBasicMaterial({ color: "#fff6b0", toneMapped: false });

  return { u, paint, paving, bulb, neon, pool, halo, standby, cable, spark, glow };
}
export type Kit = ReturnType<typeof makeKit>;

export function disposeKit(k: Kit) {
  for (const m of [k.paint, k.paving, k.bulb, k.neon, k.pool, k.halo, k.standby, k.cable, k.spark]) m.dispose();
  k.glow.dispose();
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic pseudo-random numbers (same layout every load). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
