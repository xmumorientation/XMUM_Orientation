"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// DRAFT: the Tan Kah Kee statue in front of A3, at real size in metres
// (buildings.tsx scales it into the map; statue-lab/StatueLab.tsx shows it alone).
// The figure is modelled at life size (1.75 m) and cast up to a
// 3.0 m heroic bronze. Coat, waistcoat and trousers are lofted superellipse
// sections; arms, legs and the cane are swept tubes; lapels, waistcoat, tie and
// pocket flaps are thin "ribbons" draped on those surfaces. Every bronze part
// is merged into one mesh (vertex colours carry the wear), the pedestal is one
// granite mesh, the steps one stone mesh and the gold inscription one plane.
// Up +Y, the statue and the inscription face +Z; statue's left is +X.

type V3 = [number, number, number];
type P2 = [number, number];

// ── pedestal, metres ─────────────────────────────────────────────────────
const STEP1 = { w: 3.3, h: 0.15 };
const STEP2 = { w: 2.8, h: 0.15 };
const BASE1 = { w: 2.05, h: 0.2 };
const BASE2 = { w: 1.86, h: 0.15 };
const SHAFT = { w: 1.65, h: 2.2 };
const CAP1 = { w: 1.73, h: 0.06 };
const CAP2 = { w: 1.86, h: 0.16 };
const PLATE = { w: 1.0, d: 0.9, h: 0.07 };
const Y_BASE1 = STEP1.h + STEP2.h;
const Y_SHAFT = Y_BASE1 + BASE1.h + BASE2.h;
const Y_CAP = Y_SHAFT + SHAFT.h;
const Y_PLATE = Y_CAP + CAP1.h + CAP2.h;
const Y_FEET = Y_PLATE + PLATE.h;
const FIG = 3.0 / 1.75; // life-size model -> 3.0 m bronze

// ── small maths ──────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const gauss = (dx: number, dy: number, rx: number, ry: number) =>
  Math.exp(-((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)));
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Cubic Hermite through [x, y] keys (x ascending), clamped at the ends. */
function curve1(keys: P2[]) {
  const n = keys.length;
  const slope = (k: number) => {
    const a = keys[Math.max(0, k - 1)];
    const b = keys[Math.min(n - 1, k + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const [x0, y0] = keys[i];
    const [x1, y1] = keys[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * y0 +
      (t3 - 2 * t2 + t) * slope(i) * h +
      (-2 * t3 + 3 * t2) * y1 +
      (t3 - t2) * slope(i + 1) * h
    );
  };
}

// ── geometry builders ────────────────────────────────────────────────────
/** Quad grid over rows x cols of points, optionally wrapping the columns. */
function grid(P: V3[][], wrap = false): THREE.BufferGeometry {
  const rows = P.length;
  const cols = P[0].length;
  const pos = new Float32Array(rows * cols * 3);
  let k = 0;
  for (const row of P)
    for (const p of row) {
      pos[k++] = p[0];
      pos[k++] = p[1];
      pos[k++] = p[2];
    }
  const idx: number[] = [];
  const cm = wrap ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cm; j++) {
      const j2 = (j + 1) % cols;
      const a = i * cols + j;
      const b = i * cols + j2;
      const c = (i + 1) * cols + j;
      const d = (i + 1) * cols + j2;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Strip a three.js primitive down to position + normal, indexed. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  return g;
}

/**
 * Tube swept along a Catmull-Rom path. rad(t) gives the radii along the
 * frame's N (seeded from `hint`) and B axes; bump(t, phi) scales the radius.
 * capA / capB: number of dome rings closing each end (0 = open).
 */
function sweep(
  pts: V3[],
  opts: {
    n: number;
    radial: number;
    rad: (t: number) => [number, number];
    hint?: V3;
    bump?: (t: number, phi: number) => number;
    capA?: number;
    capB?: number;
    domeA?: number;
    domeB?: number;
    yAt?: (t: number, phi: number) => number;
  },
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    false,
    "centripetal",
  );
  const { n, radial } = opts;
  const C: V3[] = [];
  const T: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    C.push([p.x, p.y, p.z]);
    T.push([t.x, t.y, t.z]);
  }
  const hint = opts.hint ?? [0, 0, 1];
  const N: V3[] = [];
  let prev = norm(sub(hint, mul(T[0], dot(hint, T[0]))));
  for (let i = 0; i <= n; i++) {
    prev = norm(sub(prev, mul(T[i], dot(prev, T[i]))));
    N.push(prev);
  }
  const ring = (i: number, scale: number, shift: number): V3[] => {
    const t = i / n;
    const [rn, rb] = opts.rad(t);
    const B = cross(T[i], N[i]);
    const out: V3[] = [];
    for (let j = 0; j < radial; j++) {
      const ph = (j / radial) * Math.PI * 2;
      const k = (opts.bump ? opts.bump(t, ph) : 1) * scale;
      let p = add(C[i], add(mul(N[i], Math.cos(ph) * rn * k), mul(B, Math.sin(ph) * rb * k)));
      p = add(p, mul(T[i], shift));
      if (opts.yAt) p = [p[0], p[1] + opts.yAt(t, ph), p[2]];
      out.push(p);
    }
    return out;
  };
  const rows: V3[][] = [];
  const capA = opts.capA ?? 0;
  const capB = opts.capB ?? 0;
  const r0 = Math.max(...opts.rad(0));
  const r1 = Math.max(...opts.rad(1));
  for (let k = capA; k >= 1; k--) {
    const a = (k / capA) * (Math.PI / 2);
    rows.push(ring(0, Math.cos(a) + (k === capA ? 1e-4 : 0), -Math.sin(a) * r0 * (opts.domeA ?? 1)));
  }
  for (let i = 0; i <= n; i++) rows.push(ring(i, 1, 0));
  for (let k = 1; k <= capB; k++) {
    const a = (k / capB) * (Math.PI / 2);
    rows.push(ring(n, Math.cos(a) + (k === capB ? 1e-4 : 0), Math.sin(a) * r1 * (opts.domeB ?? 1)));
  }
  return grid(rows, true);
}

/**
 * Deformed sphere: f(u) maps a unit direction to a point. Poles on +-X, the
 * longitude (phi) runs front -> top -> back -> bottom, denser near the front.
 */
function blob(rows: number, cols: number, f: (u: V3) => V3, denseFront = 0): THREE.BufferGeometry {
  const P: V3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const al = Math.PI * t + (denseFront ? 0.25 * Math.sin(2 * Math.PI * t) : 0);
    const row: V3[] = [];
    for (let j = 0; j < cols; j++) {
      const s = j / cols;
      const ph = -0.2 * denseFront + 2 * Math.PI * s - 0.6 * denseFront * Math.sin(2 * Math.PI * s);
      row.push(f([Math.cos(al), Math.sin(al) * Math.sin(ph), Math.sin(al) * Math.cos(ph)]));
    }
    P.push(row);
  }
  return grid(P, true);
}

function ellipsoid(c: V3, r: V3, rot: THREE.Euler, segs: [number, number] = [14, 20], ex = 2) {
  const e = 2 / ex;
  const g = blob(segs[0], segs[1], (u) => [spow(u[0], e) * r[0], spow(u[1], e) * r[1], spow(u[2], e) * r[2]]);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Resample a polyline to k points evenly by arc length. */
function resample(line: P2[], k: number): P2[] {
  const d = [0];
  for (let i = 1; i < line.length; i++)
    d.push(d[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = d[d.length - 1];
  const out: P2[] = [];
  let s = 0;
  for (let i = 0; i < k; i++) {
    const target = (i / (k - 1)) * L;
    while (s < line.length - 2 && d[s + 1] < target) s++;
    const t = (target - d[s]) / (d[s + 1] - d[s] || 1);
    out.push([lerp(line[s][0], line[s + 1][0], t), lerp(line[s][1], line[s + 1][1], t)]);
  }
  return out;
}

// ── body surfaces (lofted superellipse sections) ─────────────────────────
type Sec = { a: number; f: number; b: number; n: number; cz: number };
type Surf = ReturnType<typeof makeSurf>;

function makeSurf(sec: (y: number) => Sec) {
  const pt = (th: number, y: number): V3 => {
    const s = sec(y);
    const e = 2 / s.n;
    const c = Math.cos(th);
    return [s.a * spow(Math.sin(th), e), y, s.cz + (c >= 0 ? s.f : s.b) * spow(c, e)];
  };
  const normal = (th: number, y: number): V3 => {
    const e = 2e-3;
    return norm(cross(sub(pt(th + e, y), pt(th - e, y)), sub(pt(th, y + e), pt(th, y - e))));
  };
  const thetaOf = (x: number, y: number) => {
    const s = sec(y);
    return Math.asin(Math.max(-1, Math.min(1, spow(x / s.a, s.n / 2))));
  };
  /** Point at front-projected (x, y), pushed `off` along the surface normal. */
  const at = (x: number, y: number, off: number): V3 => {
    const th = thetaOf(x, y);
    return add(pt(th, y), mul(normal(th, y), off));
  };
  return { sec, pt, normal, thetaOf, at };
}

/**
 * A thin draped plate between two edge lines I (t = 0) and O (t = 1) on a
 * surface: top face, both edge walls and both end walls.
 */
function ribbon(
  surf: Surf,
  I: P2[],
  O: P2[],
  o: { nt: number; off: number; thick: number; lift?: (s: number, t: number) => number; k?: number },
): THREE.BufferGeometry {
  const k = o.k ?? 24;
  const Ii = resample(I, k);
  const Oo = resample(O, k);
  const top: V3[][] = [];
  const bot: V3[][] = [];
  for (let i = 0; i < k; i++) {
    const s = i / (k - 1);
    const rt: V3[] = [];
    const rb: V3[] = [];
    for (let j = 0; j <= o.nt; j++) {
      const t = j / o.nt;
      const x = lerp(Ii[i][0], Oo[i][0], t);
      const y = lerp(Ii[i][1], Oo[i][1], t);
      const lift = o.lift ? o.lift(s, t) : 0;
      rt.push(surf.at(x, y, o.off + o.thick + lift));
      rb.push(surf.at(x, y, o.off - 0.002));
    }
    top.push(rt);
    bot.push(rb);
  }
  const parts = [grid(top)];
  parts.push(grid(top.map((r, i) => [r[0], bot[i][0]])));
  parts.push(grid(top.map((r, i) => [r[o.nt], bot[i][o.nt]])));
  parts.push(grid([top[0], bot[0]]));
  parts.push(grid([top[k - 1], bot[k - 1]]));
  return mergeGeometries(parts)!;
}

// coat, outer surface (life metres)
const COAT = makeSurf(
  (() => {
    const A = curve1([
      [0.74, 0.206], [0.84, 0.199], [0.95, 0.189], [1.06, 0.183], [1.16, 0.181], [1.26, 0.183],
      [1.34, 0.189], [1.4, 0.196], [1.435, 0.192], [1.465, 0.166], [1.49, 0.121], [1.51, 0.09], [1.56, 0.079],
    ]);
    const F = curve1([
      [0.74, 0.128], [0.84, 0.129], [0.95, 0.137], [1.06, 0.143], [1.16, 0.141], [1.26, 0.135],
      [1.34, 0.125], [1.4, 0.111], [1.435, 0.096], [1.465, 0.081], [1.49, 0.071], [1.51, 0.067], [1.56, 0.063],
    ]);
    const B = curve1([
      [0.74, 0.136], [0.84, 0.129], [0.95, 0.119], [1.06, 0.111], [1.16, 0.113], [1.26, 0.119],
      [1.34, 0.123], [1.4, 0.121], [1.435, 0.113], [1.465, 0.099], [1.49, 0.089], [1.51, 0.083], [1.56, 0.077],
    ]);
    const N = curve1([[0.74, 2.4], [1.2, 2.5], [1.38, 3.0], [1.44, 3.0], [1.5, 2.2], [1.56, 2.0]]);
    const CZ = curve1([[0.74, -0.005], [1.0, 0.0], [1.3, -0.006], [1.5, -0.02], [1.56, -0.024]]);
    return (y: number): Sec => ({ a: A(y), f: F(y), b: B(y), n: N(y), cz: CZ(y) });
  })(),
);

// waistcoat / shirt / trouser top under the open coat
const BODY = makeSurf(
  (() => {
    const A = curve1([
      [0.72, 0.172], [0.95, 0.172], [1.06, 0.168], [1.2, 0.166], [1.34, 0.17], [1.4, 0.166],
      [1.44, 0.13], [1.47, 0.086], [1.49, 0.067], [1.56, 0.062],
    ]);
    const F = curve1([
      [0.72, 0.113], [0.95, 0.123], [1.06, 0.13], [1.16, 0.128], [1.26, 0.122], [1.34, 0.111],
      [1.4, 0.097], [1.44, 0.081], [1.47, 0.067], [1.49, 0.061], [1.56, 0.058],
    ]);
    const B = curve1([[0.72, 0.1], [1.0, 0.09], [1.3, 0.1], [1.44, 0.08], [1.47, 0.065], [1.56, 0.058]]);
    const N = curve1([[0.72, 2.4], [1.4, 2.4], [1.47, 2.0]]);
    const CZ = curve1([[0.74, -0.005], [1.0, 0.0], [1.3, -0.006], [1.5, -0.02], [1.56, -0.024]]);
    return (y: number): Sec => ({ a: A(y), f: F(y), b: B(y), n: N(y), cz: CZ(y) });
  })(),
);

// coat front opening: half-width of the gap; above the top button it follows the lapel roll line
const Y_HEM = 0.74;
const Y_V = 1.12;
const Y_COLLAR = 1.555;
const gapW = (y: number) =>
  y <= Y_V ? 0.026 + 0.012 * smooth(Y_V, Y_HEM, y) : 0.026 + 0.058 * clamp01((y - Y_V) / 0.36);
const rollX = (y: number) => gapW(Math.max(Y_V, y));
const gapTh = (y: number) => {
  const s = COAT.sec(y);
  return Math.asin(Math.min(1, Math.pow(gapW(y) / s.a, s.n / 2)));
};

// ── parts ────────────────────────────────────────────────────────────────
type Part = { g: THREE.BufferGeometry; wear?: number; dark?: number; extra?: Float32Array };

function coatParts(): Part[] {
  const R = 60;
  const M = 80;
  const outer: V3[][] = [];
  const nrm: V3[][] = [];
  const gHem = gapTh(Y_HEM);
  for (let i = 0; i <= R; i++) {
    const v = i / R;
    const yb = lerp(Y_HEM, Y_COLLAR, v);
    const g = gapTh(yb);
    const row: V3[] = [];
    const nr: V3[] = [];
    for (let j = 0; j <= M; j++) {
      const th = g + (2 * Math.PI - 2 * g) * (j / M);
      const thF = Math.min(th, 2 * Math.PI - th);
      const hemLift = 0.05 * (1 - smooth(0, 0.55, thF - gHem));
      const yTop = Y_COLLAR - 0.04 * (1 - smooth(1.5, 2.6, thF));
      const y = lerp(Y_HEM + hemLift, yTop, v);
      let p = COAT.pt(th, y);
      const n = COAT.normal(th, y);
      // centre-back vent and seam, a faint waist fold at the back
      const back = Math.exp(-(((th - Math.PI) / 0.05) ** 2));
      p = add(p, mul(n, -0.004 * back * (1 - smooth(0.92, 1.0, y)) - 0.0015 * back));
      row.push(p);
      nr.push(n);
    }
    outer.push(row);
    nrm.push(nr);
  }
  const T = 0.012;
  const inset = (i: number, j: number) => sub(outer[i][j], mul(nrm[i][j], T));
  const parts: THREE.BufferGeometry[] = [grid(outer)];
  parts.push(grid(outer.map((r, i) => [r[0], inset(i, 0)])));
  parts.push(grid(outer.map((r, i) => [r[M], inset(i, M)])));
  parts.push(grid([outer[0], outer[0].map((_, j) => inset(0, j))]));
  parts.push(grid([outer[R], outer[R].map((_, j) => inset(R, j))]));

  // lapels and collar, both sides
  for (const sx of [-1, 1]) {
    const m = (l: P2[]): P2[] => l.map(([x, y]) => [x * sx, y]);
    const lapI: P2[] = [];
    for (let k = 0; k <= 12; k++) {
      const y = lerp(Y_V, 1.398, k / 12);
      lapI.push([rollX(y), y]);
    }
    const lapO: P2[] = [
      [rollX(Y_V) + 0.002, Y_V],
      [0.07, 1.2],
      [0.124, 1.3],
      [0.16, 1.366],
      [0.172, 1.388],
    ];
    parts.push(
      ribbon(COAT, m(lapI), m(lapO), {
        nt: 8,
        off: 0.001,
        thick: 0.006,
        k: 30,
        lift: (s, t) => 0.01 * (1 - t) ** 2 * smooth(0, 0.5, s),
      }),
    );
    const colI: P2[] = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(1.402, 1.505, k / 8);
      colI.push([rollX(y) + 0.002, y]);
    }
    const colO: P2[] = [
      [0.148, 1.41],
      [0.132, 1.44],
      [0.112, 1.48],
      [0.095, 1.51],
    ];
    parts.push(
      ribbon(COAT, m(colI), m(colO), {
        nt: 6,
        off: 0.004,
        thick: 0.006,
        k: 14,
        lift: (_s, t) => 0.008 * (1 - t) ** 2,
      }),
    );
    // hip pocket flap
    const fx0 = 0.078;
    const fx1 = 0.178;
    const flapTop: P2[] = [];
    const flapBot: P2[] = [];
    for (let k = 0; k <= 10; k++) {
      const x = lerp(fx0, fx1, k / 10);
      flapTop.push([x * sx, 0.958 - 0.006 * (k / 10)]);
      flapBot.push([x * sx, 0.912 - 0.004 * (k / 10)]);
    }
    parts.push(ribbon(COAT, flapTop, flapBot, { nt: 4, off: 0.0, thick: 0.005, k: 14 }));
  }
  // two coat buttons on the statue's left front edge
  for (const y of [1.085, 0.965]) parts.push(button(COAT, 0.047, y, 0.011, 0.002));
  return [{ g: mergeGeometries(parts)!, wear: 0.05 }];
}

function button(surf: Surf, x: number, y: number, r: number, off: number) {
  const th = surf.thetaOf(x, y);
  const n = surf.normal(th, y);
  const p = add(surf.pt(th, y), mul(n, off));
  const g = clean(new THREE.CylinderGeometry(r, r * 1.08, r * 0.55, 14, 1));
  g.applyMatrix4(
    new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n)),
    ),
  );
  g.translate(p[0], p[1], p[2]);
  return g;
}

function bodyParts(): Part[] {
  const parts: THREE.BufferGeometry[] = [];
  // front sector of the waistcoat / shirt / trouser top
  const R = 56;
  const M = 40;
  const P: V3[][] = [];
  for (let i = 0; i <= R; i++) {
    const y = lerp(0.72, 1.56, i / R);
    const row: V3[] = [];
    for (let j = 0; j <= M; j++) row.push(BODY.pt(lerp(-1.5, 1.5, j / M), y));
    P.push(row);
  }
  parts.push(grid(P));

  // waistcoat: two halves with a pointed hem and a V neck
  const vNeck = (y: number) => Math.max(0, (y - 1.29) * 0.5);
  for (const sx of [-1, 1]) {
    const I: P2[] = [];
    const O: P2[] = [];
    for (let k = 0; k <= 16; k++) {
      const y = lerp(0.935, 1.42, k / 16);
      I.push([sx * vNeck(y), y]);
      O.push([sx * 0.09, lerp(0.968, 1.42, k / 16)]);
    }
    parts.push(ribbon(BODY, I, O, { nt: 6, off: 0.0, thick: 0.004, k: 26 }));
  }
  for (let k = 0; k < 5; k++) parts.push(button(BODY, 0, 1.25 - k * 0.058, 0.0075, 0.005));

  // tie: knot + blade down into the waistcoat
  const tieI: P2[] = [];
  const tieO: P2[] = [];
  for (let k = 0; k <= 8; k++) {
    const y = lerp(1.468, 1.285, k / 8);
    const w = lerp(0.016, 0.024, k / 8);
    tieI.push([-w, y]);
    tieO.push([w, y]);
  }
  parts.push(
    ribbon(BODY, tieI, tieO, { nt: 6, off: 0.001, thick: 0.004, k: 16, lift: (_s, t) => 0.003 * Math.sin(Math.PI * t) }),
  );
  const knotC = BODY.at(0, 1.483, 0.012);
  parts.push(ellipsoid(knotC, [0.017, 0.016, 0.011], new THREE.Euler(0.1, 0, 0), [8, 12], 2.6));

  // shirt collar: band round the neck + two points
  const band = sweep(
    Array.from({ length: 9 }, (_, k) => {
      const a = lerp(0.35, 2 * Math.PI - 0.35, k / 8);
      return [Math.sin(a) * 0.066, 1.505 + 0.012 * (1 - Math.cos(a)) * 0.5, -0.016 + Math.cos(a) * 0.066] as V3;
    }),
    { n: 24, radial: 8, rad: () => [0.004, 0.022], hint: [0, 1, 0], capA: 1, capB: 1 },
  );
  parts.push(band);
  for (const sx of [-1, 1]) {
    const I: P2[] = [
      [sx * 0.012, 1.512],
      [sx * 0.014, 1.47],
    ];
    const O: P2[] = [
      [sx * 0.058, 1.515],
      [sx * 0.042, 1.448],
    ];
    parts.push(ribbon(BODY, I, O, { nt: 4, off: 0.003, thick: 0.004, k: 6 }));
  }
  return [{ g: mergeGeometries(parts)!, wear: 0.0 }];
}

function legParts(): Part[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x0 = 0.098 * sx;
    const x1 = 0.11 * sx;
    parts.push(
      sweep(
        [
          [x0 * 0.9, 0.9, -0.002],
          [x0, 0.78, 0.0],
          [lerp(x0, x1, 0.5), 0.48, 0.012],
          [x1, 0.16, 0.004],
          [x1, 0.045, 0.0],
        ],
        {
          n: 44,
          radial: 36,
          hint: [0, 0, 1],
          rad: (t) => {
            const r = lerp(0.094, 0.087, smooth(0, 0.55, t)) + 0.004 * smooth(0.9, 0.93, t);
            return [r * lerp(1.0, 1.05, smooth(0.8, 1, t)), r * 0.98];
          },
          // front crease, a few folds above the turn-ups
          bump: (t, ph) => {
            const fr = Math.cos(ph);
            let k = 1 + 0.035 * Math.exp(-((Math.atan2(Math.sin(ph), fr) / 0.2) ** 2));
            k += 0.03 * Math.exp(-(((t - 0.82) / 0.025) ** 2)) * Math.max(0, fr);
            k += 0.02 * Math.exp(-(((t - 0.74) / 0.02) ** 2)) * Math.max(0, fr) ** 2;
            k += 0.012 * smooth(0.9, 0.915, t) * (1 - smooth(0.975, 0.985, t));
            return k;
          },
          // hem rests on the instep in front, drops at the heel
          yAt: (t, ph) => smooth(0.85, 1, t) * 0.022 * Math.cos(ph),
          capB: 1,
        },
      ),
    );
    // shoe
    const shoe = blob(12, 24, (u) => {
      const s = (u[2] + 1) / 2; // 0 heel .. 1 toe
      const ends = Math.pow(Math.max(0, 1 - u[2] * u[2]), 0.32);
      const w = 0.054 * ends * (1 - 0.28 * smooth(0.6, 1, s) ** 2);
      const h = (0.034 + 0.044 * smooth(0.92, 0.38, s)) * ends;
      const y = u[1] >= 0 ? u[1] * h : u[1] * 0.006;
      return [u[0] * w, y + 0.006, lerp(-0.1, 0.19, s)];
    });
    shoe.rotateY(0.13 * sx);
    shoe.translate(0.118 * sx, 0, 0.03);
    parts.push(shoe);
  }
  return [{ g: mergeGeometries(parts)!, wear: 0.05 }];
}

// ── hat (homburg) held against the left chest, crown facing out ────────
const HAT_C: V3 = [0.108, 1.225, 0.152];
const HAT_A = norm([0.15, -0.15, 1]);
const HAT_U = norm(sub([1, 0, 0], mul(HAT_A, HAT_A[0])));
const HAT_V = cross(HAT_A, HAT_U);
const hatPt = (r: number, psi: number, h: number): V3 =>
  add(HAT_C, add(add(mul(HAT_U, r * Math.cos(psi)), mul(HAT_V, r * Math.sin(psi))), mul(HAT_A, h)));
const BRIM_R = 0.134;
const CROWN_R = 0.086;

function hatParts(): Part[] {
  const hb = (r: number) => 0.017 * Math.pow(smooth(0.092, BRIM_R + 0.003, r), 1.4);
  const prof: P2[] = [];
  for (let k = 0; k <= 8; k++) {
    const r = lerp(0.08, BRIM_R, k / 8);
    prof.push([r, hb(r) - 0.003]);
  }
  prof.push([BRIM_R + 0.003, hb(BRIM_R) + 0.001], [BRIM_R + 0.002, hb(BRIM_R) + 0.006], [BRIM_R - 0.002, hb(BRIM_R) + 0.005]);
  for (let k = 1; k <= 8; k++) {
    const r = lerp(BRIM_R - 0.002, CROWN_R + 0.002, k / 8);
    prof.push([r, hb(r) + 0.003]);
  }
  prof.push(
    [CROWN_R + 0.002, 0.006],
    [CROWN_R + 0.002, 0.032],
    [CROWN_R - 0.001, 0.034],
    [CROWN_R - 0.002, 0.06],
    [CROWN_R - 0.005, 0.088],
    [CROWN_R - 0.009, 0.104],
    [CROWN_R - 0.018, 0.114],
    [0.048, 0.119],
    [0.024, 0.121],
    [0.0, 0.121],
  );
  const g = new THREE.LatheGeometry(
    prof.map(([r, h]) => new THREE.Vector2(r, h)),
    48,
  );
  clean(g);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i) * 1.1;
    // front pinch and the centre crease along the top
    const top = smooth(0.06, 0.112, y);
    x *= 1 - 0.13 * smooth(0.02, 0.09, z) * smooth(0.04, 0.1, y);
    y -= 0.024 * Math.exp(-((x / 0.026) ** 2)) * top * (1 - 0.6 * smooth(0.05, 0.1, Math.abs(z)));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  // hat local: +Y = crown axis, +Z = hat front (pointing up the chest)
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...cross(HAT_A, HAT_V)),
    new THREE.Vector3(...HAT_A),
    new THREE.Vector3(...HAT_V),
  );
  g.applyMatrix4(m);
  g.translate(...HAT_C);
  return [{ g, wear: 0.12 }];
}

// ── arms, hands, cane ────────────────────────────────────────────────────
function armParts(): Part[] {
  const parts: THREE.BufferGeometry[] = [];
  const sleeve = (t: number): [number, number] => {
    const r = lerp(0.066, 0.054, smooth(0.15, 0.85, t)) + 0.003 * smooth(0.93, 0.97, t);
    return [r * 1.05, r];
  };
  const folds = (t: number, ph: number) => 1 + 0.03 * Math.exp(-(((t - 0.55) / 0.04) ** 2)) * Math.max(0, Math.cos(ph));

  // statue's right arm (-X): hangs, hand in front of the thigh on the cane
  const rCuff: V3 = [-0.178, 0.925, 0.122];
  parts.push(
    sweep(
      [
        [-0.13, 1.43, -0.01],
        [-0.197, 1.392, -0.012],
        [-0.228, 1.25, -0.018],
        [-0.232, 1.11, -0.004],
        [-0.214, 1.0, 0.068],
        rCuff,
      ],
      { n: 40, radial: 22, rad: sleeve, hint: [1, 0, 0], bump: folds, capA: 4, capB: 1 },
    ),
  );

  // statue's left arm (+X): elbow out at the waist, forearm forward to the hat
  const palmBot = hatPt(0.118, -1.62, 0.05);
  const lElbow: V3 = [0.245, 1.075, -0.02];
  const lCuff = add(palmBot, mul(norm(sub(lElbow, palmBot)), 0.06));
  parts.push(
    sweep(
      [
        [0.13, 1.43, -0.01],
        [0.198, 1.392, -0.012],
        [0.232, 1.25, -0.022],
        lElbow,
        mix3(lElbow, lCuff, 0.55),
        lCuff,
      ],
      { n: 40, radial: 22, rad: sleeve, hint: [-1, 0, 0], bump: folds, capA: 4, capB: 1 },
    ),
  );

  // left hand on the hat: palm on the crown's lower side, fingers round it
  parts.push(
    sweep([add(lCuff, mul(norm(sub(lElbow, lCuff)), 0.03)), palmBot, hatPt(0.112, -1.42, 0.054)], {
      n: 8,
      radial: 14,
      rad: (t) => [lerp(0.021, 0.017, t), lerp(0.028, 0.04, t)],
      hint: HAT_A,
      capB: 3,
    }),
  );
  for (let f = 0; f < 4; f++) {
    const h = 0.03 + f * 0.02;
    const len = [0.9, 1.0, 0.95, 0.75][f];
    const a0 = -1.32;
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * 0.8 * len;
      pts.push(hatPt(CROWN_R + 0.011 - k * 0.0006, a, h + k * 0.002));
    }
    parts.push(
      sweep(pts, { n: 10, radial: 10, rad: (t) => [lerp(0.0095, 0.008, t), lerp(0.0095, 0.008, t)], capA: 2, capB: 3 }),
    );
  }
  // thumb along the brim
  parts.push(
    sweep([hatPt(0.12, -1.7, 0.03), hatPt(0.118, -1.85, 0.016), hatPt(0.114, -2.05, 0.012)], {
      n: 8,
      radial: 10,
      rad: () => [0.0105, 0.0105],
      capA: 2,
      capB: 3,
    }),
  );

  // right fist round the cane, below the crook
  const F: V3 = [-0.124, 0.872, 0.164];
  parts.push(
    sweep([add(rCuff, [0.008, 0.012, -0.012]), mix3(rCuff, F, 0.6)], {
      n: 6,
      radial: 14,
      rad: () => [0.027, 0.031],
      hint: [0, 0, 1],
      capB: 2,
    }),
  );
  const fist = blob(14, 22, (u) => {
    const e = 2 / 2.8;
    let x = spow(u[0], e) * 0.036;
    const y = spow(u[1], e) * 0.042;
    let z = spow(u[2], e) * 0.036;
    // knuckle bands on the front and the inner side
    const bands = 0.5 + 0.5 * Math.cos((y / 0.021) * Math.PI * 2 - Math.PI);
    const front = smooth(0.2, 0.8, u[2]) + smooth(0.2, 0.8, u[0]);
    z += 0.0025 * bands * smooth(0.2, 0.8, u[2]) * (1 - smooth(0.7, 1, Math.abs(u[1])));
    x += 0.002 * bands * smooth(0.2, 0.8, u[0]) * (front > 0 ? 1 : 0);
    return [x, y, z];
  });
  fist.rotateZ(0.18);
  fist.translate(...F);
  parts.push(fist);
  // thumb over the front of the fingers
  parts.push(
    sweep([add(F, [-0.03, 0.028, 0.012]), add(F, [-0.006, 0.03, 0.03]), add(F, [0.014, 0.02, 0.036])], {
      n: 8,
      radial: 10,
      rad: () => [0.0115, 0.0115],
      capA: 2,
      capB: 3,
    }),
  );

  // cane: crook above the fist, shaft to the plate in front of the right toe
  const top: V3 = [-0.126, 0.918, 0.165];
  const tip: V3 = [-0.098, 0.006, 0.25];
  parts.push(
    sweep(
      [
        tip,
        mix3(tip, top, 0.5),
        top,
        [-0.118, 0.942, 0.166],
        [-0.1, 0.951, 0.167],
        [-0.083, 0.94, 0.168],
        [-0.079, 0.92, 0.168],
      ],
      {
        n: 60,
        radial: 10,
        rad: (t) => {
          const r = t < 0.02 ? 0.0165 : 0.0145;
          return [r, r];
        },
        hint: [1, 0, 0],
        capA: 1,
        capB: 3,
      },
    ),
  );
  return [{ g: mergeGeometries(parts)!, wear: 0.08 }];
}

// ── head ─────────────────────────────────────────────────────────────────
const HEAD_C: V3 = [0, 1.633, 0.012];

function headParts(): Part[] {
  const RX = 0.08;
  const RY = 0.118;
  const RZ = 0.102;
  const wearV: number[] = [];
  const g = blob(
    64,
    88,
    (u) => {
      const [ux, uy, uz] = u;
      const wf = 1 + 0.085 * Math.exp(-(((uy + 0.35) / 0.42) ** 2)) - 0.05 * smooth(0.3, 1, uy);
      let x = ux * RX * wf;
      const y = uy * RY;
      let z = uz * RZ * (uz > 0 ? 1 - 0.07 * uz ** 3 : 1 + 0.03 * (-uz) ** 2);
      const fm = smooth(0.15, 0.6, uz);
      let dz = 0;
      for (const sx of [-1, 1]) {
        dz -= 0.01 * gauss(x - sx * 0.031, y - 0.006, 0.017, 0.011); // eye socket
        dz += 0.0052 * gauss(x - sx * 0.031, y - 0.004, 0.011, 0.0062); // eyeball and lids
        dz += 0.0062 * gauss(x - sx * 0.033, y - 0.027, 0.028, 0.0085); // brow ridge
        dz += 0.009 * gauss(x - sx * 0.047, y + 0.024, 0.024, 0.022); // full cheek
        dz += 0.008 * gauss(x - sx * 0.0165, y + 0.03, 0.0085, 0.0075); // nostril wing
        dz -= 0.0032 * gauss(x - sx * 0.03, y + 0.047, 0.006, 0.013); // nasolabial fold
        dz += 0.002 * gauss(x - sx * 0.031, y + 0.013, 0.013, 0.005); // under-eye
      }
      const ny = clamp01((0.016 - y) / 0.042);
      const nprof = y > -0.026 ? lerp(0, 0.021, ny ** 1.3) : 0.021 * Math.exp(-(((y + 0.026) / 0.0075) ** 2));
      dz += nprof * Math.exp(-((x / lerp(0.0075, 0.0125, ny)) ** 2)); // nose
      dz += 0.005 * gauss(x, y + 0.026, 0.011, 0.009); // nose tip
      dz += 0.0045 * gauss(x, y + 0.045, 0.024, 0.008); // upper lip / short moustache
      dz -= 0.0045 * gauss(x, y + 0.054, 0.023, 0.0025); // mouth line
      dz += 0.0035 * gauss(x, y + 0.061, 0.018, 0.0055); // lower lip
      dz += 0.009 * gauss(x, y + 0.088, 0.03, 0.018); // chin
      dz *= fm;
      z += dz;
      // short hair combed straight back (reference photo): a distinct cap with a
      // crisp edge at a high, slightly receding hairline, fuller at the front of
      // the crown, with shallow comb grooves running front to back
      const temple = uz > 0 ? 0.12 * uz * Math.exp(-(((Math.abs(ux) - 0.5) / 0.18) ** 2)) : 0;
      const hl = (uz > 0 ? lerp(0.1, 0.68, uz ** 1.5) : lerp(0.1, -0.52, (-uz) ** 0.8)) + temple;
      const hair = smooth(hl - 0.02, hl + 0.025, uy);
      const lift = 0.004 * Math.exp(-(((uz - 0.55) / 0.45) ** 2)) * smooth(0.4, 0.9, uy);
      const comb = 0.001 * Math.sin(ux * 24) * smooth(0.3, 0.8, uy);
      const t = hair * (0.007 + lift + comb);
      const k = 1 + t / 0.1;
      x *= k;
      z = z * k;
      const yy = y * (1 + t / 0.12);
      wearV.push(Math.max(0, dz) * 22 - hair * 0.45);
      return [x + HEAD_C[0], yy + HEAD_C[1], z + HEAD_C[2]];
    },
    1,
  );
  // ears
  const ears: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const ear = blob(10, 18, (u) => {
      const x = u[0] * 0.011;
      const y = u[1] * 0.031;
      const z = u[2] * 0.019;
      const cup = u[0] * sx > 0 ? -0.006 * gauss(u[1], u[2], 0.55, 0.55) * sx : 0;
      return [x + cup, y, z];
    });
    ear.rotateY(sx * 0.42);
    ear.rotateZ(-sx * 0.08);
    ear.translate(sx * 0.081, HEAD_C[1] - 0.006, HEAD_C[2] - 0.012);
    ears.push(ear);
  }
  const neck = sweep(
    [
      [0, 1.45, -0.016],
      [0, 1.53, -0.008],
      [0, 1.6, 0.0],
    ],
    { n: 8, radial: 20, rad: () => [0.058, 0.056], hint: [0, 0, 1] },
  );
  return [
    { g, extra: Float32Array.from(wearV), wear: 0.06 },
    { g: mergeGeometries([...ears, neck])!, wear: 0.06 },
  ];
}

// ── assembling the bronze ────────────────────────────────────────────────
const BRONZE = new THREE.Color("#4a3a2b");
const WORN = new THREE.Color("#8c6b45");
const HAIR = new THREE.Color("#2e241b");

function paint(p: Part): THREE.BufferGeometry {
  const g = p.g;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    let w = (p.wear ?? 0) + 0.32 * Math.max(0, n.getY(i)) ** 2;
    const e = p.extra ? p.extra[i] : 0;
    w += Math.max(0, e);
    let c = BRONZE.clone().lerp(WORN, clamp01(w));
    if (e < 0) c = c.lerp(HAIR, clamp01(-e));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function buildBronze(): THREE.BufferGeometry {
  const fig = [...coatParts(), ...bodyParts(), ...legParts(), ...armParts(), ...hatParts(), ...headParts()].map(paint);
  const figure = mergeGeometries(fig)!;
  figure.scale(FIG, FIG, FIG);
  figure.translate(0, Y_FEET, 0);
  const plate = paint({ g: clean(new THREE.BoxGeometry(PLATE.w, PLATE.h, PLATE.d)), wear: 0.04 });
  plate.translate(0, Y_PLATE + PLATE.h / 2, 0);
  return mergeGeometries([figure, plate])!;
}

// ── pedestal ─────────────────────────────────────────────────────────────
/** Box with UVs scaled to metres / tile so the granite grain stays even. */
function slab(w: number, h: number, d: number, y: number, tile = 1.2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const size: P2[] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * size[f][0]) / tile + f * 0.37, (uv.getY(i) * size[f][1]) / tile + f * 0.21);
    }
  g.translate(0, y + h / 2, 0);
  return g;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 9; i++) {
    const v = rnd();
    const l = v < 0.55 ? 18 + rnd() * 20 : v < 0.93 ? 70 + rnd() * 40 : 140 + rnd() * 70;
    ctx.fillStyle = `rgba(${l},${l},${l + 3},${0.35 + rnd() * 0.5})`;
    const r = rnd() < 0.85 ? 1 : 2;
    ctx.fillRect(rnd() * w, rnd() * h, r, r);
  }
}

function granitePieces() {
  const granite = mergeGeometries([
    slab(BASE1.w, BASE1.h, BASE1.w, Y_BASE1),
    slab(BASE2.w, BASE2.h, BASE2.w, Y_BASE1 + BASE1.h),
    slab(SHAFT.w, SHAFT.h, SHAFT.w, Y_SHAFT),
    slab(CAP1.w, CAP1.h, CAP1.w, Y_CAP),
    slab(CAP2.w, CAP2.h, CAP2.w, Y_CAP + CAP1.h),
  ])!;
  const stone = mergeGeometries([
    slab(STEP1.w, STEP1.h, STEP1.w, 0, 1.6),
    slab(STEP2.w, STEP2.h, STEP2.w, STEP1.h, 1.6),
  ])!;
  return { granite, stone };
}

function makeTextures() {
  if (typeof document === "undefined") return null;
  const mk = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")!] as const;
  };
  const [gc, gctx] = mk(512, 512);
  speckle(gctx, 512, 512, "#3a3b3f", 7);
  const grain = new THREE.CanvasTexture(gc);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.anisotropy = 4;

  const [sc, sctx] = mk(512, 512);
  speckle(sctx, 512, 512, "#7f7c77", 11);
  const sgrain = new THREE.CanvasTexture(sc);
  sgrain.colorSpace = THREE.SRGBColorSpace;
  sgrain.wrapS = sgrain.wrapT = THREE.RepeatWrapping;

  // inscription: the whole front face of the shaft, 1.65 x 2.2 m; bold
  // engraved gold (dark lower edge, light face) so it reads from a distance
  const W = 1024;
  const H = Math.round((W * SHAFT.h) / SHAFT.w);
  const [ic, ictx] = mk(W, H);
  speckle(ictx, W, H, "#3a3b3f", 3);
  const gold = ictx.createLinearGradient(0, H * 0.08, 0, H * 0.46);
  gold.addColorStop(0, "#f3d98f");
  gold.addColorStop(1, "#c79e4c");
  ictx.textBaseline = "middle";
  const spaced = (text: string, y: number, gap: number) => {
    const chars = [...text];
    let widths = chars.map((ch) => ictx.measureText(ch).width);
    let total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    if (total > W * 0.84) {
      const k = (W * 0.84) / total;
      ictx.font = ictx.font.replace(/(\d+(?:\.\d+)?)px/, (_, n: string) => `${Number(n) * k}px`);
      widths = chars.map((ch) => ictx.measureText(ch).width);
      gap *= k;
      total = W * 0.84;
    }
    let x = W / 2 - total / 2;
    chars.forEach((ch, i) => {
      ictx.fillText(ch, x, y);
      x += widths[i] + gap;
    });
  };
  const serif = '"Times New Roman", Times, Georgia, serif';
  const cjk = '"Songti TC", "STSong", "Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "PMingLiU", serif';
  const lines: [string, number, string, number][] = [
    ["陳嘉庚", H * 0.155, `700 150px ${cjk}`, 46],
    ["TAN KAH KEE", H * 0.285, `600 74px ${serif}`, 12],
    ["1874–1961", H * 0.355, `600 56px ${serif}`, 8],
    ["FOUNDER OF XIAMEN UNIVERSITY", H * 0.42, `600 42px ${serif}`, 4],
  ];
  for (const [text, y, font, gap] of lines) {
    ictx.font = font;
    ictx.fillStyle = "rgba(10,10,12,0.7)";
    spaced(text, y + 3, gap);
    ictx.font = font;
    ictx.fillStyle = gold;
    spaced(text, y, gap);
  }
  const ins = new THREE.CanvasTexture(ic);
  ins.colorSpace = THREE.SRGBColorSpace;
  ins.anisotropy = 8;
  return { grain, sgrain, ins };
}

export function TanKahKeeStatue() {
  const bronze = useMemo(buildBronze, []);
  const { granite, stone } = useMemo(granitePieces, []);
  const tex = useMemo(makeTextures, []);
  const mats = useMemo(
    () => ({
      bronze: new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.62,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
      granite: new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex?.grain ?? null, roughness: 0.28 }),
      stone: new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex?.sgrain ?? null, roughness: 0.85 }),
      ins: new THREE.MeshStandardMaterial({ map: tex?.ins ?? null, roughness: 0.32, metalness: 0.05 }),
    }),
    [tex],
  );
  const insGeo = useMemo(() => new THREE.PlaneGeometry(SHAFT.w, SHAFT.h), []);
  return (
    <group>
      <mesh geometry={bronze} material={mats.bronze} castShadow receiveShadow />
      <mesh geometry={granite} material={mats.granite} castShadow receiveShadow />
      <mesh geometry={stone} material={mats.stone} castShadow receiveShadow />
      <mesh
        geometry={insGeo}
        material={mats.ins}
        position={[0, Y_SHAFT + SHAFT.h / 2, SHAFT.w / 2 + 0.002]}
        receiveShadow
      />
    </group>
  );
}
