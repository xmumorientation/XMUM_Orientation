import {
  B1_PLACE,
  B1_ROADS_M,
  BASIN_D,
  b1StairsFoot,
  CARPARK,
  FUNFAIR_LAND,
  inPolygon,
  LAKE,
  LAKE_WATER_Y,
  PLATEAU_H,
  plateauEdge,
  plateauY,
  UNITS_PER_M,
  type World,
} from "./geo";
import { MOAT_R, ORIGIN, RING_R, RING_Y, ROT_Y, SEATS_ARC, TERRACE_D, TERRACE_H, TERRACES } from "./lakefront/layout";

// The ground's height anywhere on the map: the raised ground under the A-row (geo.ts plateauY) and the low ground
// round the lake (Ben, 2026-11-02). The lake, its shore and the lake stage lie BASIN_D below the campus. The shore
// meets the water at its level and climbs gently back to the campus's level the further it is from the lake (Ben's
// photo: grass banks down to the water), stopping before the funfair's land, the A-row's slopes and B1's grounds. The
// stage's amphitheatre is cut into that slope: its terraces climb from the walkway, and past the top terrace the
// ground still climbs, gently, to the campus's level.

/** The widest the climb from the shore gets (world units); it is narrower where flat ground comes closer. */
const BASIN_W = 40 * UNITS_PER_M;
/** The climb stops this far (world units) before the flat ground. */
const FLAT_MARGIN = 1 * UNITS_PER_M;
/** Under the water the lakebed goes down from the shore to the floor over this far (world units). */
const BED_W = 4 * UNITS_PER_M;
/**
 * Near the lake the amphitheatre's ground climbs no faster than a bank this many metres wide (Ben: the ground between
 * the terraces' north end and the lake climbs gently from the water; the end of the terraces stands above it).
 */
const SHORE_W = 32;
/** Behind the top terrace the ground climbs on to the campus's level over this many metres. */
const BOWL_W = 20;
/** Past the terraces' ends the amphitheatre's ground blends into the plain basin over this many metres. */
const BOWL_FADE = 25;
/** Under the terraces the ground keeps this far (metres) below each terrace's front edge. */
const BOWL_GAP = 0.25;
/**
 * Where the ground falls short of the terraces' outer edge (their north end, near the lake), a grass bank leans
 * against it instead of leaving a wall: it drops this much (metres) per metre out from the edge.
 */
const BERM_K = 0.35;

/** The basin's depth, the amphitheatre's top terrace (its back edge) and its height above the stage's floor, metres. */
const DEPTH_M = BASIN_D / UNITS_PER_M;
const R_TOP = RING_R + TERRACES * TERRACE_D;
const Y_TOP = RING_Y + TERRACES * TERRACE_H;
/** The waterline: the lake's water level, where the shore meets it (world units, and metres above the floor). */
const SHORE_Y = -BASIN_D + LAKE_WATER_Y;
const SHORE_M = LAKE_WATER_Y / UNITS_PER_M;

const smooth = (t: number) => t * t * (3 - 2 * t);
/** A bank's rise from the water (0) to the top (1): it leaves the water at a gentle slope and flattens into the top. */
const bank = (t: number) => 0.5 * (1 - (1 - t) * (1 - t)) + 0.5 * smooth(t);

/** Distance from a world point to a ring's edge. */
export function edgeDist(pts: readonly World[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}


/** Distance (world units) to B1's grounds west of it: its west road and stairs, from the north road's bays south. */
function b1Dist(x: number, z: number): number {
  const { pos, rotY } = B1_PLACE;
  const dx = x - pos[0];
  const dz = z - pos[1];
  const lx = (dx * Math.cos(rotY) - dz * Math.sin(rotY)) / UNITS_PER_M;
  const lz = (dx * Math.sin(rotY) + dz * Math.cos(rotY)) / UNITS_PER_M;
  const south = (pos[0] - CARPARK.x[0]) / UNITS_PER_M;
  const out = Math.max(0, B1_ROADS_M.north.bays[0] - lz, lz - south);
  return Math.hypot(Math.max(0, b1StairsFoot(lz) - B1_ROADS_M.west.width - lx), out) * UNITS_PER_M;
}

/** How far (world units) the climb from the lake may still run before the flat ground; 0 on it. */
function flatDist(x: number, z: number): number {
  const funfair = inPolygon(FUNFAIR_LAND, x, z) ? 0 : edgeDist(FUNFAIR_LAND, x, z);
  const { d, w } = plateauEdge(x, z);
  return Math.max(0, Math.min(funfair, d - w, b1Dist(x, z)) - FLAT_MARGIN);
}

/**
 * A world point in the stage's frame (layout.ts: metres, x north, z east): its radius from the stage's centre; how
 * far it is past the terraces' ends (0 within the terraces' arc, out to any distance behind them: the distance to the
 * nearer end's line out from the centre); and the bank leaning against the terraces there (metres above the floor;
 * -Infinity under the terraces and the walkway).
 */
function venuePolar(x: number, z: number): { r: number; off: number; berm: number } {
  const c = Math.cos(ROT_Y);
  const s = Math.sin(ROT_Y);
  const dx = (x - ORIGIN[0]) / UNITS_PER_M;
  const dz = (z - ORIGIN[1]) / UNITS_PER_M;
  const vx = dx * c - dz * s;
  const vz = dx * s + dz * c;
  const r = Math.hypot(vx, vz);
  const end = SEATS_ARC[1];
  if (Math.abs(Math.atan2(vx, -vz)) <= end) {
    return { r, off: 0, berm: r > R_TOP ? Y_TOP - BERM_K * (r - R_TOP) : -Infinity };
  }
  const ex = Math.sin(end);
  const ez = -Math.cos(end);
  const proj = Math.abs(vx) * ex + vz * ez;
  const along = Math.max(0, proj);
  const off = Math.hypot(Math.abs(vx) - along * ex, vz - along * ez);
  if (r < RING_R) return { r, off, berm: -Infinity };
  // from the nearest point of the end wall, at the ramp under the terraces there
  const at = Math.max(RING_R, Math.min(R_TOP, proj));
  const d = Math.hypot(Math.abs(vx) - at * ex, vz - at * ez);
  return { r, off, berm: bowlRise(at) - BERM_K * d };
}

/**
 * The amphitheatre's ground above the stage's floor (metres), along the audience axis at radius r: level under the
 * moat, rising under the walkway, then a ramp just under the terraces' front edges that meets the top terrace at its
 * back edge, then on up to the campus's level.
 */
function bowlRise(r: number): number {
  if (r >= R_TOP) return Y_TOP + (DEPTH_M - Y_TOP) * smooth(Math.min(1, (r - R_TOP) / BOWL_W));
  if (r >= RING_R) {
    const gap = BOWL_GAP * Math.min(1, (R_TOP - r) / TERRACE_D);
    return RING_Y + ((r - RING_R) / TERRACE_D) * TERRACE_H - gap;
  }
  const k = (r - MOAT_R - 0.3) / (RING_R - MOAT_R - 0.3);
  return k <= 0 ? 0 : (RING_Y - BOWL_GAP) * k;
}

/**
 * The plain basin. On the lake, the bed goes down from the waterline at the shore to the floor. Round the stage, the
 * floor rises under the walkway to the waterline at its outer edge. From the shore and the walkway's edge the bank
 * climbs to the campus's level. `edge` is the distance to the lake's shore, `wet` whether the point is on the lake.
 */
function shoreY(x: number, z: number, edge: number, wet: boolean, r: number): number {
  const bed = wet ? SHORE_Y - LAKE_WATER_Y * smooth(Math.min(1, edge / BED_W)) : Infinity;
  if (r < RING_R) {
    const k = Math.max(0, Math.min(1, (r - MOAT_R - 0.4) / (RING_R - MOAT_R - 0.4)));
    return Math.min(bed, -BASIN_D + LAKE_WATER_Y * k);
  }
  if (wet) return bed;
  const s = Math.min(edge, (r - RING_R) * UNITS_PER_M);
  const w = Math.min(BASIN_W, s + flatDist(x, z));
  return s >= w ? 0 : SHORE_Y * (1 - bank(s / w));
}

/** Where the basin can reach: round the lake and the stage, grown by the widest climb. */
export const BASIN_BOX = (() => {
  const xs = LAKE.map((p) => p[0]);
  const zs = LAKE.map((p) => p[1]);
  const v = RING_R * UNITS_PER_M;
  const m = BASIN_W + UNITS_PER_M;
  return [
    Math.min(...xs, ORIGIN[0] - v) - m,
    Math.min(...zs, ORIGIN[1] - v) - m,
    Math.max(...xs, ORIGIN[0] + v) + m,
    Math.max(...zs, ORIGIN[1] + v) + m,
  ] as const;
})();

/**
 * The low ground's height (world units, 0 to -BASIN_D): the plain basin, raised where the amphitheatre's ground
 * stands higher, and blending back into the plain basin over BOWL_FADE metres past the terraces' ends. Near the lake
 * the amphitheatre's ground climbs no faster than a bank SHORE_W metres wide, so it never stands over the shore; where
 * that leaves the terraces' edge standing proud, a short bank (BERM_K) leans against it.
 */
export function basinY(x: number, z: number): number {
  const [x0, z0, x1, z1] = BASIN_BOX;
  if (x < x0 || x > x1 || z < z0 || z > z1) return 0;
  const wet = inPolygon(LAKE, x, z);
  const edge = edgeDist(LAKE, x, z);
  const { r, off, berm } = venuePolar(x, z);
  const base = shoreY(x, z, edge, wet, r);
  // the bank against the terraces, never climbing out of the water faster than it falls from them
  const lean = wet ? base : Math.max(base, -BASIN_D + Math.min(berm, SHORE_M + (BERM_K * edge) / UNITS_PER_M) * UNITS_PER_M);
  if (off >= BOWL_FADE) return lean;
  // under the terraces nothing shows, so the ground keeps up with them there, and meets their edge cleanly
  const under = off === 0 && r >= RING_R && r <= R_TOP;
  const cap = under ? Infinity : wet ? 0 : SHORE_M + (DEPTH_M - SHORE_M) * bank(Math.min(1, edge / UNITS_PER_M / SHORE_W));
  const bowl = -BASIN_D + Math.min(bowlRise(r), cap) * UNITS_PER_M;
  return Math.max(lean, bowl <= base ? base : base + (bowl - base) * (1 - smooth(off / BOWL_FADE)));
}

/** The ground's height at a world point: the A-row's raised ground and the lake's low ground (they never meet). */
export function groundY(x: number, z: number): number {
  return plateauY(x, z) + basinY(x, z);
}

type XYZ = { x: number; y: number; z: number };

/** Where a ray from `o` along `d` (world) first meets the ground, raised and low ground included: for taps on the map. */
export function groundHit(o: XYZ, d: XYZ): World {
  if (d.y > -1e-6) return [o.x, o.z];
  const below = (t: number) => o.y + d.y * t <= groundY(o.x + d.x * t, o.z + d.z * t);
  const end = (o.y + BASIN_D) / -d.y;
  let a = Math.max(0, (o.y - PLATEAU_H) / -d.y);
  let hit = end;
  const step = (end - a) / 48;
  for (let t = a + step; t < end; t += step) {
    if (below(t)) {
      hit = t;
      break;
    }
    a = t;
  }
  // close in on the edge between the last point above the ground and the first one on it
  for (let k = 0; k < 12 && hit < end; k++) {
    const m = (a + hit) / 2;
    if (below(m)) hit = m;
    else a = m;
  }
  return [o.x + d.x * hit, o.z + d.z * hit];
}
