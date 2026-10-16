import { G, TAU, mat, rng, type V3 } from "../central/kit";
import { LIGHTS, NEON, S, STEEL, bar, circlePts, tube } from "./kit";
import { BRANCHES, groundY, lagoonE } from "./ground";
import {
  BOUNDS,
  CAROUSEL,
  CAROUSEL_R,
  COURT,
  DOME,
  DOME_R,
  FOOD,
  GATE_WALK,
  LAGOON,
  NEON_WALK,
  PARK_WALK,
  PIER_WALK,
  PLAZA_Y,
  POWER_BOX,
  SPIDERS,
  SPIDER_R,
  WHEEL,
  WHEEL_R,
} from "./layout";
import {
  STALL_COLORS,
  STALL_KINDS,
  arch,
  bench,
  bunting,
  frame,
  lamp,
  palm,
  stall,
  tAt,
  tree,
  umbrellaTable,
  type Parts,
} from "./parts";

// DRAFT: everything in the West zone that isn't a ride or the pier: the Neon
// Walk's lamps, strings and stalls, the Gate Walk and the Park Walk, the palm
// grove with its neon dome, the food court with its trucks, trees and hedges,
// and the power box with its cables. Zone metres.

/** Spots taken by stalls, trucks and the like (centre, radius), so trees keep off them. */
type Spot = [number, number, number];

// ---------- the Neon Walk ----------

const LAMP_OFF = NEON_WALK.hw + 0.8;
const WALK_LAMPS_Z = [-92, -78, -64, -50, -36, -22, -8, 6, 20, 34, 48, 60];

function neonWalk(p: Parts, taken: Spot[]) {
  const lite = p.lite;
  const nx = NEON_WALK.x + LAMP_OFF;
  const sx = NEON_WALK.x - LAMP_OFF;
  const near = (z: number, c: number, r: number) => Math.abs(z - c) < r;
  const northOk = (z: number) =>
    !near(z, SPIDERS[1][1], 4.5) && !(z > PIER_WALK.z - PIER_WALK.hw - 3 && z < PIER_WALK.z + PIER_WALK.hw + 3) && !near(z, GATE_WALK.from[1], 8) && z < 55;
  const southOk = (z: number) =>
    !near(z, CAROUSEL[1], 4.5) && !(z > COURT.z[0] - 1.5 && z < COURT.z[1] + 1.5) && !near(z, PARK_WALK.z, 4.5) && !near(z, GATE_WALK.from[1], 8);
  const top = (x: number, z: number): V3 => [x, 0.12 + 6.7, z];
  const north = WALK_LAMPS_Z.filter(northOk);
  const south = WALK_LAMPS_Z.filter(southOk);
  for (const z of north) lamp(p, nx, z, 0, 6.6, NEON.pink);
  for (const z of south) lamp(p, sx, z, 0, 6.6, NEON.cyan);
  // strings along each side, and across the walk where lamps face each other
  const along = (list: number[], x: number) => {
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i + 1] - list[i] > 15) continue;
      bunting(p, [x, 6.75, list[i]], [x, 6.75, list[i + 1]], lite ? 6 : 10, 0.7, !lite);
    }
  };
  along(north, nx);
  along(south, sx);
  for (let i = 0; i < WALK_LAMPS_Z.length - 1; i++) {
    const z0 = WALK_LAMPS_Z[i];
    const z1 = WALK_LAMPS_Z[i + 1];
    if (north.includes(z0) && south.includes(z1)) bunting(p, top(nx, z0), top(sx, z1), lite ? 8 : 12, 1.1, false);
    if (south.includes(z0) && north.includes(z1)) bunting(p, top(sx, z0), top(nx, z1), lite ? 8 : 12, 1.1, !lite);
  }
  // stalls: north side facing the walk (-x), south side facing it (+x)
  const northStalls = lite ? [-70, -40, -24] : [-72, -66, -44, -38, -26, 33, 39];
  const southStalls = lite ? [-44, 28] : [-80, -74, -46, -40, 27, 33];
  northStalls.forEach((z, i) => {
    stall(p, NEON_WALK.x + NEON_WALK.hw + 4.6, z, 0, -Math.PI / 2, STALL_COLORS[i % 5], STALL_KINDS[(i + 1) % 5]);
    taken.push([NEON_WALK.x + NEON_WALK.hw + 4.6, z, 3.2]);
  });
  southStalls.forEach((z, i) => {
    stall(p, NEON_WALK.x - NEON_WALK.hw - 4.6, z, 0, Math.PI / 2, STALL_COLORS[(i + 2) % 5], STALL_KINDS[(i + 3) % 5]);
    taken.push([NEON_WALK.x - NEON_WALK.hw - 4.6, z, 3.2]);
  });
  // benches between the lamps
  for (const z of [-57, -29, 27]) bench(p, nx + 0.9, z, 0, Math.PI);
  for (const z of [-85, -29, 55]) if (southOk(z)) bench(p, sx - 0.9, z, 0, 0);
  // light pools along the walk
  for (let z = -86; z <= 50; z += 17) p.pools.push({ x: NEON_WALK.x, z, r: 7, c: LIGHTS[Math.abs(Math.round(z / 17)) % 5] });
}

/** Lamps and strings along the Gate Walk (towards the gate) and the Park Walk (from the lake park). */
function sideWalks(p: Parts) {
  const [ax, az] = GATE_WALK.from;
  const [bx, bz] = GATE_WALK.to;
  const len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  const off = GATE_WALK.hw + 0.9;
  const pts: V3[][] = [[], []];
  for (let d = 12; d < len - 4; d += 14) {
    [-1, 1].forEach((s, k) => {
      const x = ax + dx * d - dz * off * s;
      const z = az + dz * d + dx * off * s;
      lamp(p, x, z, 0, 6.2, s > 0 ? NEON.lilac : NEON.pink);
      pts[k].push([x, 6.35, z]);
    });
  }
  for (const row of pts) for (let i = 0; i < row.length - 1; i++) bunting(p, row[i], row[i + 1], p.lite ? 6 : 9, 0.7, !p.lite);
  for (const x of [-74, -88, -100]) lamp(p, x, PARK_WALK.z + PARK_WALK.hw + 0.9, 0, 6.2, NEON.cyan);
  // a neon arch where the Park Walk leaves the lake park
  arch(p, PARK_WALK.x[0] + 2.5, PARK_WALK.z, PARK_WALK.hw + 0.6, 0.12, 6.2, NEON.pink, 40);
}

// ---------- the palm grove and the neon dome ----------

/** A lattice dome over a little round stage: silver struts, neon rings, bulbs at the joints, a mirror ball. */
function neonDome(p: Parts) {
  const [x, z] = DOME;
  const y0 = PLAZA_Y;
  const R = 9;
  const t = tAt(x, z);
  const rings = 4;
  const n = 12;
  const pt = (k: number, i: number): V3 => {
    const e = (k / (rings + 0.6)) * (Math.PI / 2);
    const a = ((i + (k % 2) * 0.5) / n) * TAU;
    return [x + Math.cos(a) * Math.cos(e) * R, y0 + Math.sin(e) * R, z - Math.sin(a) * Math.cos(e) * R];
  };
  const apex: V3 = [x, y0 + R, z];
  const colors = [NEON.cyan, NEON.lilac, NEON.pink, NEON.yellow];
  for (let k = 0; k <= rings; k++) {
    const ring = Array.from({ length: n }, (_, i) => pt(k, i));
    tube(p.frame, ring, k === 0 ? 0.22 : 0.12, STEEL.white, 0, 0, true, false, S.tube6);
    if (k > 0) tube(p.light, ring.map(([a, b, c]) => [a, b + 0.16, c] as V3), 0.07, colors[(k - 1) % 4], t + 0.02 + k * 0.012, 500 + k * 20, true);
    for (let i = 0; i < n; i++) {
      const q = ring[i];
      if (k < rings) {
        bar(p.frame, STEEL.silver, q, pt(k + 1, i), 0.09, S.tube6);
        bar(p.frame, STEEL.silver, q, pt(k + 1, k % 2 ? i + 1 : i - 1 + n), 0.09, S.tube6);
      } else bar(p.frame, STEEL.silver, q, apex, 0.09, S.tube6);
      if (k > 0 && (!p.lite || i % 2 === 0)) p.bulbs.add(q, 0.22, NEON.warm, t + 0.03 + k * 0.012);
    }
  }
  p.light.add(S.ball, mat(apex[0], apex[1] + 0.3, apex[2], 0.5), NEON.pink, t + 0.09, -520);
  // the stage and the mirror ball
  p.frame.revolve([x, y0, z], [[4.6, 0], [4.6, 0.8], [0, 0.8]], 24, (s, k) => (k === 0 ? STEEL.pink : s % 2 ? STEEL.white : STEEL.lilac));
  tube(p.light, circlePts([x, y0 + 0.82, z], 4.62, 32), 0.07, NEON.cyan, t + 0.03, 540, true);
  bar(p.frame, STEEL.silver, [x, y0 + R - 0.1, z], [x, y0 + R - 2.6, z], 0.04, S.tube4);
  p.frame.ball("#e9edf5", [x, y0 + R - 3.4, z], 0.85, S.ball);
  p.pools.push({ x, z, r: DOME_R + 3, c: "#b98cff" });
}

/** A picnic table with two benches, along local z. */
function picnic(p: Parts, x: number, z: number, ry: number) {
  const f = frame(x, z, ry);
  const box = (c: string, u: number, y: number, v: number, sx: number, sy: number, sz: number) => {
    const q = f(u, y, v);
    p.frame.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), c);
  };
  box(STEEL.wood, 0, 0.75, 0, 0.9, 0.08, 2.2);
  for (const s of [-1, 1]) {
    box(STEEL.wood, s * 0.8, 0.45, 0, 0.32, 0.07, 2.2);
    box(STEEL.steel, s * 0.35, 0.37, 0, 0.08, 0.74, 1.8);
  }
}

// ---------- the food court ----------

/** A food truck facing local +x: a body with a serving hatch, an awning, wheels, a glowing sign on the roof. */
function truck(p: Parts, x: number, z: number, ry: number, paint: string, neon: string) {
  const f = frame(x, z, ry);
  const y0 = 0.32;
  const t = tAt(x, z);
  const box = (c: string, u: number, y: number, v: number, sx: number, sy: number, sz: number) => {
    const q = f(u, y0 + y, v);
    p.frame.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), c);
  };
  box(paint, 0, 1.75, 0, 2.5, 2.3, 6.2);
  box(STEEL.white, 0, 0.5, 0, 2.4, 0.3, 6.0);
  box(STEEL.white, 0.2, 1.75, 2.15, 2.2, 1.9, 1.8);
  box("#bfe9f2", 0.95, 2.05, 2.15, 0.06, 0.9, 1.6);
  box("#3b3150", 1.26, 1.85, -0.6, 0.04, 1.05, 3.4);
  box(STEEL.white, 1.45, 1.2, -0.6, 0.5, 0.1, 3.6);
  for (const v of [-2.2, 1.9])
    for (const s of [-1, 1]) {
      const q = f(s * 1.15, y0 + 0.45, v);
      p.frame.add(S.cyl12, mat(q[0], q[1], q[2], 0.45, 0.3, 0.45, ry, 0, Math.PI / 2), "#43475a");
    }
  // awning over the hatch, and a sign on the roof
  p.frame.quad(STEEL.white, f(1.25, y0 + 2.75, -2.4), f(1.25, y0 + 2.75, 1.2), f(2.4, y0 + 2.45, 1.2), f(2.4, y0 + 2.45, -2.4), true);
  box(STEEL.silver, -0.2, 3.25, -0.6, 0.3, 0.9, 3.6);
  const face = f(-0.03, y0 + 3.25, -0.6);
  p.light.add(G.box, mat(face[0], face[1], face[2], 0.06, 0.6, 3.2, ry), neon, t + 0.03, -600);
  for (let i = 0; i <= 5; i++) p.bulbs.add(f(2.42, y0 + 2.4, -2.4 + i * 0.72), 0.14, i % 2 ? NEON.warm : neon, t + 0.03);
}

function foodCourt(p: Parts, taken: Spot[]) {
  const [x0, x1] = FOOD.x;
  const [z0, z1] = FOOD.z;
  // trucks along the north edge, facing in
  const trucks = p.lite ? [70, 92] : [68, 79, 90];
  trucks.forEach((z, i) => {
    truck(p, x1 - 2.4, z, Math.PI, STALL_COLORS[i % 5][0], STALL_COLORS[i % 5][1]);
    taken.push([x1 - 2.4, z, 4]);
  });
  // tables in rows
  const xs = p.lite ? [22, 36] : [20, 29, 38];
  const zs = p.lite ? [72, 90] : [70, 79, 88, 97];
  let k = 0;
  for (const x of xs) for (const z of zs) umbrellaTable(p, x, z, 0.32, [STEEL.pink, STEEL.cyan, STEEL.yellow, STEEL.lilac][k++ % 4]);
  // poles at the corners and middles with strings criss-crossing the court
  const posts: [number, number][] = [
    [x0 + 1, z0 + 1],
    [x0 + 1, (z0 + z1) / 2],
    [x0 + 1, z1 - 1],
    [x1 - 7, z0 + 1],
    [x1 - 7, (z0 + z1) / 2],
    [x1 - 7, z1 - 1],
  ];
  for (const [x, z] of posts) lamp(p, x, z, 0.32, 7.2, NEON.yellow);
  const top = (i: number): V3 => [posts[i][0], 0.32 + 7.3, posts[i][1]];
  for (const [a, b] of [
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 4],
    [0, 3],
    [2, 5],
  ])
    bunting(p, top(a), top(b), p.lite ? 10 : 16, 1.4, !p.lite && a !== 1);
  // the entrance from the lagoon: a neon arch
  arch(p, LAGOON.x, z0 + 0.6, 3.4, 0.32, 6.4, NEON.yellow, 41, Math.PI / 2);
  p.pools.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: 20, c: "#ffd27a" });
}

// ---------- trees and hedges ----------

/** Free lawn: on the land, off every path, plaza, court and the lagoon, and clear of stalls and the power box. */
function freeLawn(x: number, z: number, m: number, taken: Spot[]) {
  const [X0, X1] = BOUNDS.x;
  const [Z0, Z1] = BOUNDS.z;
  if (x < X0 + m || x > X1 - m || z < Z0 + m || z > Z1 - m) return false;
  for (const [dx, dz] of [
    [0, 0],
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
  ])
    if (groundY(x + dx, z + dz) > 0) return false;
  if (lagoonE(x, z, LAGOON.rim + m + 1) < 1) return false;
  if (Math.hypot(x - WHEEL[0], z - WHEEL[1]) < WHEEL_R + 2 + m) return false;
  if (Math.hypot(x - DOME[0], z - DOME[1]) < DOME_R + 2 + m) return false;
  if (Math.hypot(x - CAROUSEL[0], z - CAROUSEL[1]) < CAROUSEL_R + 2 + m) return false;
  for (const [sx, sz] of SPIDERS) if (Math.hypot(x - sx, z - sz) < SPIDER_R + 2 + m) return false;
  if (x > COURT.x[0] - 2 - m && x < COURT.x[1] + 2 + m && z > COURT.z[0] - 2 - m && z < COURT.z[1] + 2 + m) return false;
  if (x > FOOD.x[0] - 2 - m && x < FOOD.x[1] + 2 + m && z > FOOD.z[0] - 2 - m && z < FOOD.z[1] + 2 + m) return false;
  // walks: keep the lamp rows clear
  if (Math.abs(x - NEON_WALK.x) < NEON_WALK.hw + 3 + m && z < NEON_WALK.z[1] + 2) return false;
  if (Math.abs(z - PIER_WALK.z) < PIER_WALK.hw + 3 + m && x < PIER_WALK.x[1] + 2) return false;
  for (const [a, b] of BRANCHES) if (segDist(x, z, a, b) < 4 + m) return false;
  if (segDist(x, z, GATE_WALK.from, GATE_WALK.to) < GATE_WALK.hw + 3 + m) return false;
  if (Math.abs(z - PARK_WALK.z) < PARK_WALK.hw + 3 + m && x < PARK_WALK.x[1]) return false;
  for (const [sx, sz, r] of taken) if (Math.hypot(x - sx, z - sz) < r + m) return false;
  for (const route of cableRoutes()) for (let i = 0; i < route.length - 1; i++) if (segDist(x, z, route[i], route[i + 1]) < 1.2 + m * 0.6) return false;
  return true;
}

function segDist(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

function greenery(p: Parts, taken: Spot[]) {
  const [X0, X1] = BOUNDS.x;
  const [Z0, Z1] = BOUNDS.z;
  // hedges along the road side (north) and the west edge
  const hedge = (a: V3, b: V3) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i < n; i++) {
      const f0 = i / n + 0.04 / n;
      const f1 = (i + 1) / n - 0.04 / n;
      const q0: V3 = [a[0] + (b[0] - a[0]) * f0, 0.65, a[2] + (b[2] - a[2]) * f0];
      const q1: V3 = [a[0] + (b[0] - a[0]) * f1, 0.65, a[2] + (b[2] - a[2]) * f1];
      const ry = Math.atan2(-(q1[2] - q0[2]), q1[0] - q0[0]);
      const l = Math.hypot(q1[0] - q0[0], q1[2] - q0[2]);
      p.frame.add(G.box, mat((q0[0] + q1[0]) / 2, 0.65, (q0[2] + q1[2]) / 2, l, 1.3, 1.5, ry), STEEL.leafDark);
      p.frame.add(G.box, mat((q0[0] + q1[0]) / 2, 1.36, (q0[2] + q1[2]) / 2, l - 0.4, 0.14, 1.1, ry), STEEL.leaf);
    }
  };
  hedge([X1 - 0.8, 0, Z0 + 1], [X1 - 0.8, 0, Z1 - 1]);
  hedge([X0 + 22, 0, Z0 + 0.8], [X1 - 2.5, 0, Z0 + 0.8]);
  // picnic tables in the grove
  const tables: [number, number][] = p.lite ? [[16, -46]] : [[16, -46], [22, -84], [58, -84], [60, -42]];
  for (const [x, z] of tables) {
    if (!freeLawn(x, z, 1.6, taken)) continue;
    picnic(p, x, z, 0.4);
    taken.push([x, z, 2]);
  }
  // trees: palms near the lagoon and in the grove, round trees elsewhere
  const r = rng(77);
  const step = p.lite ? 15 : 10.5;
  let k = 0;
  for (let x = X0 + 4; x < X1 - 2; x += step) {
    for (let z = Z0 + 3; z < Z1 - 2; z += step) {
      const tx = x + (r() - 0.5) * step * 0.7;
      const tz = z + (r() - 0.5) * step * 0.7;
      const s = 0.85 + r() * 0.4;
      if (!freeLawn(tx, tz, 2.4 * s, taken)) continue;
      const grove = tx > 0 && (tz < -20 || lagoonE(tx, tz, LAGOON.rim + 14) < 1);
      if (grove || r() < 0.18) palm(p, tx, tz, 0, s, k, grove && k % 2 === 0 ? (k % 4 ? NEON.pink : NEON.cyan) : null);
      else tree(p, tx, tz, 0, s, k);
      k++;
    }
  }
}

// ---------- power box and cables ----------

/** The cables' routes from the box: to the booths, the two spiders, the carousel, the wheel and the pier. */
function cableRoutes(): [number, number][][] {
  const [bx, bz] = POWER_BOX;
  const rim = (c: readonly [number, number], r: number, from: [number, number]): [number, number] => {
    const dx = from[0] - c[0];
    const dz = from[1] - c[1];
    const l = Math.hypot(dx, dz);
    return [c[0] + (dx / l) * r, c[1] + (dz / l) * r];
  };
  // along the Neon Walk's edges (north and south)
  const wx = NEON_WALK.x + NEON_WALK.hw - 0.45;
  const sx = NEON_WALK.x - NEON_WALK.hw + 0.45;
  return [
    [[bx - 1.3, bz], [COURT.x[1] - 1.2, bz]],
    [[bx + 1.2, bz - 0.8], [-36, -6], rim(SPIDERS[0], SPIDER_R - 3, [-36, -6])],
    [[bx - 0.6, bz - 1.2], [wx, bz - 6], [wx, SPIDERS[1][1] + 4], rim(SPIDERS[1], SPIDER_R - 3, [wx, SPIDERS[1][1] + 4])],
    [[bx - 1.0, bz - 1.0], [sx, -3], [sx, CAROUSEL[1] + 6], rim(CAROUSEL, CAROUSEL_R - 2.5, [sx, CAROUSEL[1] + 6])],
    [[bx + 0.6, bz + 1.2], [wx, bz + 5.5], [wx, 40], rim(WHEEL, WHEEL_R - 4, [wx, 40])],
    [[bx + 1.2, bz + 0.8], [bx + 4, PIER_WALK.z - PIER_WALK.hw - 1.6], [LAGOON.x - LAGOON.rx - LAGOON.rim + 0.5, PIER_WALK.z - PIER_WALK.hw - 1.6]],
  ];
}

function powerBox(p: Parts) {
  const [x, z] = POWER_BOX;
  const y = groundY(x, z);
  p.frame.add(G.box, mat(x, y + 0.15, z, 3.4, 0.3, 2.6), STEEL.steel);
  p.frame.add(G.box, mat(x, y + 1.4, z, 2.2, 2.2, 1.5), STEEL.silver);
  p.frame.add(G.box, mat(x, y + 2.6, z, 2.6, 0.22, 1.9), STEEL.white);
  for (let i = 0; i < 8; i++) p.frame.add(G.box, mat(x - 0.96 + i * 0.275, y + 0.55, z + 0.77, 0.275, 0.22, 0.04), i % 2 ? "#2a2342" : STEEL.yellow);
  for (let i = 0; i < 4; i++) p.frame.add(G.box, mat(x + 1.11, y + 1.3, z - 0.45 + i * 0.3, 0.04, 1.1, 0.12), STEEL.graphite);
  // a neon bolt on the door
  const bolt: V3[] = [
    [x + 0.15, y + 2.15, z + 0.78],
    [x - 0.25, y + 1.45, z + 0.78],
    [x + 0.15, y + 1.45, z + 0.78],
    [x - 0.2, y + 0.8, z + 0.78],
  ];
  tube(p.light, bolt, 0.07, NEON.yellow, 0.03, 0, false, true);
  // cables along the ground: the current runs out along them as the zone powers up
  for (const route of cableRoutes()) {
    let s = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i];
      const [bx, bz] = route[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 1.8));
      for (let j = 0; j < n; j++) {
        const f0 = j / n;
        const f1 = (j + 1) / n;
        const a: [number, number] = [ax + (bx - ax) * f0, az + (bz - az) * f0];
        const b: [number, number] = [ax + (bx - ax) * f1, az + (bz - az) * f1];
        const yc = Math.max(groundY(a[0], a[1]), groundY(b[0], b[1])) + 0.1;
        p.light.seg(NEON.pink, [a[0], yc, a[1]], [b[0], yc, b[1]], 0.17, S.tube4, 0.04 + (0.62 * (s + f0 * len)) / 160, -700 - j);
      }
      s += len;
    }
  }
  p.pools.push({ x, z, r: 4.5, c: "#ff6cd0" });
}

export function bakeDecor(p: Parts) {
  const taken: Spot[] = [[POWER_BOX[0], POWER_BOX[1], 3]];
  neonWalk(p, taken);
  sideWalks(p);
  neonDome(p);
  foodCourt(p, taken);
  powerBox(p);
  greenery(p, taken);
  // benches along the Pier Walk, between the arches
  for (const x of [-38.5, -27.5, -5.5]) {
    bench(p, x, PIER_WALK.z - PIER_WALK.hw - 2.6, 0, -Math.PI / 2);
    bench(p, x, PIER_WALK.z + PIER_WALK.hw + 2.6, 0, Math.PI / 2);
  }
}
