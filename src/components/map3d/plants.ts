import {
  A_FRONT_PLANTS,
  B1_PALMS,
  BRIDGE,
  BUSH_ROWS,
  EXTENT,
  FOOTPATH_W,
  FOOTPATHS,
  FUNFAIR_LAND,
  GROUND,
  LAKE,
  TREE_ROWS,
  TREE_SPOTS,
  UNITS_PER_M,
  inKeepOut,
  inPolygon,
  toWorld,
  type Img,
  type World,
} from "./geo";
import { ORIGIN, RING_R, TERRACE_D, TERRACES } from "./lakefront/layout";
import { edgeDist } from "./terrain";

// DRAFT: where every tree, palm, bush and lamp stands. Computed once and
// shared by the 3D meshes and the ground texture (soft shade under trees).

/** `trumpet`: a pink trumpet tree (Tabebuia rosea) in bloom, along the walkways. */
export type Plant = { x: number; z: number; s: number; rot: number; kind: "broad" | "palm" | "oil" | "trumpet" };

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

let rowCache: Plant[] | null = null;
/** The trees from the art's rows and spots, the A-row's palms and B1's palms. */
function rowTrees(): Plant[] {
  if (rowCache) return rowCache;
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
  rowCache = out.filter((t) => !inKeepOut(t.x, t.z, 0.7));
  // palms between the A-row's forecourts, about 15 m tall: taller than B1's, so they read next to the blocks
  for (const [x, z] of A_FRONT_PLANTS.palms) {
    if (!inKeepOut(x, z, 0.3)) rowCache.push({ x, z, s: 0.5 + r() * 0.15, rot: r() * Math.PI * 2, kind: "palm" });
  }
  // then the palms on the strip along B1's north road, which the keep-out covers with the road: about 10 m tall, as
  // in the imagery (the art's palms are over three times that)
  for (const [x, z] of B1_PALMS) rowCache.push({ x, z, s: 0.3 + r() * 0.05, rot: r() * Math.PI * 2, kind: "palm" });
  return rowCache;
}

let campusCache: Plant[] | null = null;
/** Every tree on the campus: the rows and spots, and the shade trees along the walkways. */
export function campusTrees(): Plant[] {
  if (!campusCache) campusCache = [...rowTrees(), ...walkPlanting().trees];
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
  // small round shrubs along the south side of the A-row's walk
  for (const [x, z] of A_FRONT_PLANTS.shrubs) {
    if (!inKeepOut(x, z, 0.05)) bushCache.push({ x, z, s: 0.35 + r() * 0.1, color: HEDGE[Math.floor(r() * HEDGE.length)] });
  }
  bushCache.push(...walkPlanting().blooms);
  return bushCache;
}

/** `s`: size, 1 for the street lamps. */
export type Lamp = { x: number; z: number; s: number };
let lampCache: Lamp[] | null = null;
/** Street lamps just inside the outer road, low lamps along the A-row's walk, and park lamps along the walkways. */
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
      out.push({ x: x + nx * s, z: z + nz * s, s: 1 });
    });
  };
  // along the inner edge of the outer road ring
  const ring = GROUND.road.map(
    (p, i) => [p[0] + (GROUND.base[i][0] - p[0]) * 0.82, p[1] + (GROUND.base[i][1] - p[1]) * 0.82] as const,
  );
  for (let i = 0; i < ring.length; i++) {
    for (const [x, z] of along([ring[i], ring[(i + 1) % ring.length]], 9)) out.push({ x, z, s: 1 });
  }
  lampCache = out.filter((l) => !inKeepOut(l.x, l.z, 0.3));
  for (const [x, z] of A_FRONT_PLANTS.lamps) if (!inKeepOut(x, z, 0.05)) lampCache.push({ x, z, s: 0.35 });
  lampCache.push(...walkPlanting().lamps);
  return lampCache;
}

// ── Along the walkways (Ben, 2026-11-02: greener walks, and light at night) ──
// Every walkway (FOOTPATHS, most of them in the lake park) gets park lamps in a zigzag, a low clipped hedge along
// each side with bougainvillea in it, and shade trees behind the hedge: rain trees with pink trumpet trees among them,
// and coconut palms by the water.
// The side facing the lake keeps no hedge, so the walks look out over the water. Nothing on the funfair's land, the
// lake stage's terraces, the paths themselves or anything else the keep-out covers.

/** From a walkway's middle (world units): its lamps, its hedges, its trees (nearest and furthest). */
const WALK = {
  lamp: FOOTPATH_W / 2 + 0.1,
  hedge: FOOTPATH_W / 2 + 0.27,
  tree: [FOOTPATH_W / 2 + 0.9, FOOTPATH_W / 2 + 1.3] as const,
};
/** Spacing along a walkway (world units): lamps (about 22 m), trees on each side, hedge points. */
const WALK_GAP = { lamp: 3.3, tree: 3.1, hedge: 0.25 };
/** A side within this far of the lake faces it: no hedge, palms instead of rain trees. */
const LAKE_VIEW = 2.2;
/** The lake stage's terraces and a margin round them. */
const STAGE_R = (RING_R + TERRACES * TERRACE_D + 3) * UNITS_PER_M;

/** Whether a walkway's planting may stand here: on the campus, off the funfair's land and the lake stage. */
function walkOpen(x: number, z: number, margin: number): boolean {
  if (!insideCampus(x, z, -1) || inKeepOut(x, z, margin)) return false;
  if (Math.hypot(x - ORIGIN[0], z - ORIGIN[1]) < STAGE_R) return false;
  return !inPolygon(FUNFAIR_LAND, x, z) && edgeDist(FUNFAIR_LAND, x, z) > 0.5;
}

/** Points every `gap` units along a world polyline, each with the unit normal to its left. */
function alongWalk(pts: readonly World[], gap: number): { p: World; n: World }[] {
  const out: { p: World; n: World }[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const n: World = [-(bz - az) / len, (bx - ax) / len];
    for (let d = carry; d < len; d += gap) out.push({ p: [ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len], n });
    carry = (gap - ((len - carry) % gap)) % gap;
  }
  return out;
}

export type HedgeRun = World[];
type WalkPlanting = { trees: Plant[]; lamps: Lamp[]; blooms: Bush[]; hedges: HedgeRun[] };
let walkCache: WalkPlanting | null = null;

export function walkPlanting(): WalkPlanting {
  if (walkCache) return walkCache;
  const r = rng(53);
  const trees: Plant[] = [];
  const lamps: Lamp[] = [];
  const blooms: Bush[] = [];
  const hedges: HedgeRun[] = [];
  // keep clear of the trees already planted
  const taken: World[] = rowTrees().map((t) => [t.x, t.z]);
  const clear = (x: number, z: number, d: number) => taken.every(([tx, tz]) => Math.hypot(tx - x, tz - z) >= d);
  const lakeSide = (x: number, z: number, nx: number, nz: number, side: number, off: number) => {
    const near = edgeDist(LAKE, x + nx * side * off, z + nz * side * off);
    return near < LAKE_VIEW && near < edgeDist(LAKE, x - nx * side * off, z - nz * side * off);
  };
  FOOTPATHS.forEach((path) => {
    // lamps in a zigzag; a lamp needs room from those on the walks it meets
    alongWalk(path, WALK_GAP.lamp).forEach(({ p: [x, z], n: [nx, nz] }, i) => {
      const side = i % 2 ? 1 : -1;
      const lx = x + nx * side * WALK.lamp;
      const lz = z + nz * side * WALK.lamp;
      if (!walkOpen(lx, lz, -0.05) || lamps.some((l) => Math.hypot(l.x - lx, l.z - lz) < 1.8)) return;
      lamps.push({ x: lx, z: lz, s: 0.3 });
    });
    // shade trees on both sides, staggered
    for (const side of [-1, 1]) {
      alongWalk(path, WALK_GAP.tree).forEach(({ p: [x, z], n: [nx, nz] }, i) => {
        if ((i + (side > 0 ? 0 : 1)) % 2 === 0 && r() < 0.35) return;
        const off = WALK.tree[0] + r() * (WALK.tree[1] - WALK.tree[0]);
        const tx = x + nx * side * off + (r() - 0.5) * 0.4;
        const tz = z + nz * side * off + (r() - 0.5) * 0.4;
        if (!walkOpen(tx, tz, 0.55) || !clear(tx, tz, 1.7)) return;
        const palm = lakeSide(x, z, nx, nz, side, off) || edgeDist(LAKE, tx, tz) < 1.6;
        const kind = palm ? "palm" : r() < 0.25 ? "trumpet" : "broad";
        trees.push({ x: tx, z: tz, s: palm ? 0.42 + r() * 0.1 : 0.5 + r() * 0.16, rot: r() * Math.PI * 2, kind });
        taken.push([tx, tz]);
      });
    }
    // hedges along both sides, broken at junctions, by the lake and wherever the keep-out says
    for (const side of [-1, 1]) {
      let run: World[] = [];
      const end = () => {
        if (run.length >= 4) hedges.push(run);
        run = [];
      };
      alongWalk(path, WALK_GAP.hedge).forEach(({ p: [x, z], n: [nx, nz] }, i) => {
        const hx = x + nx * side * WALK.hedge;
        const hz = z + nz * side * WALK.hedge;
        // a gap every few metres, so the hedge reads as planted runs rather than a wall
        const gap = i % 22 >= 20;
        if (gap || lakeSide(x, z, nx, nz, side, WALK.hedge) || !walkOpen(hx, hz, -0.12) || !clear(hx, hz, 0.45)) {
          end();
          return;
        }
        run.push([hx, hz]);
        if (i % 6 === 3) {
          blooms.push({ x: hx, z: hz, s: 0.26 + r() * 0.1, color: BLOOMS[Math.floor(r() * BLOOMS.length)] });
        }
      });
      end();
    }
  });
  // a lamp at each end of the footbridge, on the bank beside it (Ben's photo), on opposite sides
  const [[ax, az], [bx, bz]] = BRIDGE;
  const len = Math.hypot(bx - ax, bz - az);
  const [nx, nz] = [-(bz - az) / len, (bx - ax) / len];
  for (const [t, side] of [
    [0.04, 1],
    [0.96, -1],
  ]) {
    lamps.push({ x: ax + (bx - ax) * t + nx * side * 0.5, z: az + (bz - az) * t + nz * side * 0.5, s: 0.3 });
  }
  walkCache = { trees, lamps, blooms, hedges };
  return walkCache;
}
