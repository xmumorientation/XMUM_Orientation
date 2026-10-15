import { BUSH_ROWS, EXTENT, GROUND, TREE_ROWS, TREE_SPOTS, inKeepOut, toWorld, type Img, type World } from "./geo";

// DRAFT: where every tree, palm, bush and lamp stands. Computed once and
// shared by the 3D meshes and the ground texture (soft shade under trees).

export type Plant = { x: number; z: number; s: number; rot: number; kind: "broad" | "palm" | "oil" };

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/** Points every `gap` units along a polyline given in image px. */
function along(pts: readonly Img[], gap: number): World[] {
  const w = pts.map(toWorld);
  const out: World[] = [];
  for (let i = 0; i < w.length - 1; i++) {
    const [ax, az] = w[i];
    const [bx, bz] = w[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / gap));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < w.length - 2) continue; // shared corner
      out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
  }
  return out;
}

let campusCache: Plant[] | null = null;
export function campusTrees(): Plant[] {
  if (campusCache) return campusCache;
  const r = rng(7);
  const out: Plant[] = [];
  const push = (x: number, z: number, kind: Plant["kind"]) =>
    out.push({
      x: x + (r() - 0.5) * 0.5,
      z: z + (r() - 0.5) * 0.5,
      s: kind === "palm" ? 0.9 + r() * 0.3 : 0.75 + r() * 0.45,
      rot: r() * Math.PI * 2,
      kind,
    });
  for (const row of TREE_ROWS) {
    along(row.pts, row.gap).forEach(([x, z], i) => {
      const kind = row.kind === "palm" ? "palm" : row.kind === "mix" && i % 3 === 1 ? "palm" : "broad";
      push(x, z, kind);
    });
  }
  for (const p of TREE_SPOTS) push(...toWorld(p), "broad");
  // nothing on the courts, the car park, the track or the grandstand
  campusCache = out.filter((t) => !inKeepOut(t.x, t.z, 0.7));
  return campusCache;
}

const ROAD = GROUND.road.map(toWorld);

/** Inside the outer road quad, grown by `margin` units. */
export function insideCampus(x: number, z: number, margin = 0): boolean {
  const cx = ROAD.reduce((s, p) => s + p[0], 0) / ROAD.length;
  const cz = ROAD.reduce((s, p) => s + p[1], 0) / ROAD.length;
  const poly = ROAD.map(([px, pz]) => {
    const d = Math.hypot(px - cx, pz - cz);
    return [px + ((px - cx) / d) * margin, pz + ((pz - cz) / d) * margin];
  });
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

let plantationCache: Plant[] | null = null;
/** Oil palms planted in offset rows around the campus, like the estates around XMUM. */
export function plantation(): Plant[] {
  if (plantationCache) return plantationCache;
  const r = rng(99);
  const out: Plant[] = [];
  const gap = 3.6;
  let row = 0;
  for (let z = -EXTENT.z + 2.2; z <= EXTENT.z - 2; z += gap * 0.87, row++) {
    for (let x = -EXTENT.x + 2.2 + (row % 2) * (gap / 2); x <= EXTENT.x - 2; x += gap) {
      if (insideCampus(x, z, 3.5)) continue;
      if (r() < 0.06) continue; // a few gaps, like a real estate
      out.push({
        x: x + (r() - 0.5) * 0.4,
        z: z + (r() - 0.5) * 0.4,
        s: 0.8 + r() * 0.35,
        rot: r() * 6.28,
        kind: "oil",
      });
    }
  }
  plantationCache = out;
  return out;
}

/** Lite mode: every other estate palm and two thirds of the campus trees. */
export function thinForLite(items: Plant[]): Plant[] {
  return items.filter((t, i) => (t.kind === "oil" ? i % 2 === 0 : i % 3 !== 2));
}

export type Bush = { x: number; z: number; s: number; color: string };
const BLOOMS = ["#d81b7a", "#ef4f9b", "#c2185b", "#f57fb0", "#ff8a3d", "#f4f1ea"];
const HEDGE = ["#2e7d32", "#388e3c"];

let bushCache: Bush[] | null = null;
export function bushes(): Bush[] {
  if (bushCache) return bushCache;
  const r = rng(31);
  const out: Bush[] = [];
  for (const row of BUSH_ROWS) {
    for (const [x, z] of along(row.pts, row.gap)) {
      const bloom = r() < 0.72;
      const palette = bloom ? BLOOMS : HEDGE;
      out.push({
        x: x + (r() - 0.5) * 0.35,
        z: z + (r() - 0.5) * 0.35,
        s: 0.75 + r() * 0.45,
        color: palette[Math.floor(r() * palette.length)],
      });
    }
  }
  bushCache = out.filter((b) => !inKeepOut(b.x, b.z, 0.4));
  return bushCache;
}

export type Lamp = { x: number; z: number };
let lampCache: Lamp[] | null = null;
/** Street lamps just inside the outer road (lamps along paths come back in phase 2). */
export function lamps(): Lamp[] {
  if (lampCache) return lampCache;
  const out: Lamp[] = [];
  const line = (pts: readonly Img[], gap: number, side: number) => {
    const pos = along(pts, gap);
    const w = pts.map(toWorld);
    pos.forEach(([x, z], i) => {
      // offset to one side of the path, alternating
      const [ax, az] = w[0];
      const [bx, bz] = w[w.length - 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const s = i % 2 ? side : -side;
      out.push({ x: x + nx * s, z: z + nz * s });
    });
  };
  // along the inner edge of the outer road ring
  const ring = GROUND.road.map(
    (p, i) => [p[0] + (GROUND.base[i][0] - p[0]) * 0.82, p[1] + (GROUND.base[i][1] - p[1]) * 0.82] as const,
  );
  for (let i = 0; i < ring.length; i++) {
    for (const [x, z] of along([ring[i], ring[(i + 1) % ring.length]], 9)) out.push({ x, z });
  }
  lampCache = out.filter((l) => !inKeepOut(l.x, l.z, 0.3));
  return lampCache;
}
