import { COURTS, NODES, PLAZAS, WALKS, type Walk } from "./layout";
import type { Parts } from "./parts";

// DRAFT: the East zone's ground on the campus lawn (y = 0; no lawn plate): the
// walks, the round nodes over their joints, the raised ride plazas and the
// courts. Layers never share a height and stacked flat faces stay at least
// 0.08 m apart (no z-fighting on phones): paths 0.12, nodes 0.22, plaza and
// court rims 0.2, their tops 0.32. Walks are mitred strips, so a bend never
// overlaps itself; where two walks meet, a node or a plaza covers the joint.
// The paving matches West's and Central's (cream with lilac edges).

const PATH = "#f6e6cf";
const PATH_EDGE = "#c9aef0";
export const PATH_Y = 0.12;
export const NODE_Y = 0.22;
export const RIM_TOP = 0.2;
export const PLAZA_Y = 0.32;
export const COURT_Y = 0.32;

/** Distance from (x, z) to the segment a-b. */
export function segDist(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** Distance from (x, z) to a walk's centre line. */
export function walkDist(x: number, z: number, w: Walk) {
  const n = w.closed ? w.pts.length : w.pts.length - 1;
  let d = Infinity;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(x, z, w.pts[i], w.pts[(i + 1) % w.pts.length]));
  return d;
}

/** Height of the ground's top at (x, z), so things stand on it. */
export function groundY(x: number, z: number) {
  for (const pl of PLAZAS) {
    const d = Math.hypot(x - pl.c[0], z - pl.c[1]);
    if (d < pl.r) return PLAZA_Y;
    if (d < pl.r + 0.9) return RIM_TOP;
  }
  for (const c of COURTS) {
    if (x > c.x[0] && x < c.x[1] && z > c.z[0] && z < c.z[1]) return COURT_Y;
    if (x > c.x[0] - 0.7 && x < c.x[1] + 0.7 && z > c.z[0] - 0.7 && z < c.z[1] + 0.7) return RIM_TOP;
  }
  for (const [nx, nz, r] of NODES) if (Math.hypot(x - nx, z - nz) < r) return NODE_Y;
  for (const w of WALKS) if (walkDist(x, z, w) < w.hw) return PATH_Y;
  return 0;
}

/** A walk: a mitred strip along its points, with lilac edges. */
function walk(p: Parts, w: Walk) {
  const pts = w.pts;
  const n = pts.length;
  const closed = !!w.closed;
  const norm = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  };
  // the mitre at each point: direction and length factor
  const miter = pts.map((q, i) => {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const n0 = i === 0 && !closed ? norm(q, next) : norm(prev, q);
    const n1 = i === n - 1 && !closed ? norm(prev, q) : norm(q, next);
    const mx = n0[0] + n1[0];
    const mz = n0[1] + n1[1];
    const l = Math.hypot(mx, mz) || 1;
    const k = Math.min(2, 1 / Math.max(0.5, (mx / l) * n0[0] + (mz / l) * n0[1]));
    return [(mx / l) * k, (mz / l) * k] as [number, number];
  });
  const e = Math.min(0.9, w.hw * 0.3);
  const strip = (o0: number, o1: number, c: string) => {
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const a = pts[i];
      const b = pts[j];
      const ma = miter[i];
      const mb = miter[j];
      p.paving.quad(
        c,
        [a[0] + ma[0] * o0, PATH_Y, a[1] + ma[1] * o0],
        [a[0] + ma[0] * o1, PATH_Y, a[1] + ma[1] * o1],
        [b[0] + mb[0] * o1, PATH_Y, b[1] + mb[1] * o1],
        [b[0] + mb[0] * o0, PATH_Y, b[1] + mb[1] * o0],
      );
    }
  };
  strip(-w.hw, -w.hw + e, PATH_EDGE);
  strip(-w.hw + e, w.hw - e, PATH);
  strip(w.hw - e, w.hw, PATH_EDGE);
}

/** A raised round plaza: a rim step, then the top; `pattern` colours the top's rings and wedges. */
export function plaza(p: Parts, x: number, z: number, r: number, top: string, rim: string, pattern?: (s: number, k: number) => string) {
  const rings: [number, number][] = [
    [r + 0.9, 0],
    [r + 0.9, RIM_TOP],
    [r, RIM_TOP],
    [r, PLAZA_Y],
    [r * 0.82, PLAZA_Y],
    [r * 0.76, PLAZA_Y],
    [r * 0.3, PLAZA_Y],
    [0, PLAZA_Y],
  ];
  p.paving.revolve([x, 0, z], rings, 48, (s, k) => {
    if (k < 2) return rim;
    if (pattern) return pattern(s, k);
    return k === 4 ? rim : top;
  });
}

/** A rectangular court of chequered tiles on a rim slab. */
function court(p: Parts, c: (typeof COURTS)[number]) {
  const [x0, x1] = c.x;
  const [z0, z1] = c.z;
  p.paving.box(c.rim, [(x0 + x1) / 2, RIM_TOP / 2, (z0 + z1) / 2], [x1 - x0 + 1.4, RIM_TOP, z1 - z0 + 1.4]);
  const nx = Math.max(1, Math.round((x1 - x0) / c.tile));
  const nz = Math.max(1, Math.round((z1 - z0) / c.tile));
  const tx = (x1 - x0) / nx;
  const tz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) p.paving.box((i + j) % 2 ? c.a : c.b, [x0 + (i + 0.5) * tx, COURT_Y / 2, z0 + (j + 0.5) * tz], [tx, COURT_Y, tz]);
}

export function bakeGround(p: Parts) {
  for (const w of WALKS) walk(p, w);
  for (const [nx, nz, r] of NODES) {
    p.paving.revolve([nx, 0, nz], [[r, 0], [r, NODE_Y], [r - 0.8, NODE_Y], [0, NODE_Y]], 32, (_s, k) => (k === 2 ? PATH : PATH_EDGE));
  }
  const [hub, ship, haunted, hs] = PLAZAS;
  // the hub: a red and cream sunburst in front of the tent's door
  plaza(p, hub.c[0], hub.c[1], hub.r, hub.top, hub.rim, (s, k) => {
    if (k === 4) return hub.rim;
    if (k === 6) return s % 2 ? "#f6c7c2" : "#fff6e6";
    if (k === 5) return s % 4 < 2 ? "#ffe2b8" : "#fff0cf";
    return hub.top;
  });
  plaza(p, ship.c[0], ship.c[1], ship.r, ship.top, ship.rim, (s, k) => (k === 4 ? ship.rim : k === 6 && s % 2 ? "#cfe9e6" : ship.top));
  plaza(p, haunted.c[0], haunted.c[1], haunted.r, haunted.top, haunted.rim);
  plaza(p, hs.c[0], hs.c[1], hs.r, hs.top, hs.rim, (s, k) => (k === 4 ? hs.rim : k === 6 && s % 2 ? "#ffd0cd" : hs.top));
  for (const c of COURTS) court(p, c);
}
