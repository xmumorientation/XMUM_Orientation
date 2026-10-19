import { G, TAU, mat, rng, type V3 } from "../central/kit";
import { S, bar, circlePts, tube } from "../west/kit";
import { trackDist } from "./coaster";
import { COURT_Y, PLAZA_Y, groundY, segDist, walkDist } from "./ground";
import { NEON, PAINT, bulbC } from "./kit";
import {
  ALLEY,
  ALLEY_ARCH,
  ALLEY_BOOTHS,
  ARCADE,
  ARCADE_COURT,
  ARCH_Z,
  BANDSTAND,
  BANDSTAND_R,
  BIGTOP,
  BT_A,
  BT_B,
  BT_RY,
  CARTS,
  CIRCUS,
  CIRCUS_R,
  COURTS,
  DINER,
  FIRST_AID,
  FOOD,
  FORTUNE,
  HAUNTED,
  HH_PLAZA,
  HS,
  HS_R,
  HUB,
  HUB_R,
  LAMP_H,
  LANE,
  MAIN,
  MAIN_X,
  MIRRORS,
  PICNIC,
  PLAZAS,
  POWER_BOX,
  PRIZE,
  SHIP,
  SHIP_R,
  SQUARE,
  SQUARE_R,
  STATION_COURT,
  STRIKER,
  TERRACE,
  TICKETS,
  WAGONS,
  WALKS,
  WC,
  btPoint,
  onLawn,
  type Walk,
} from "./layout";
import {
  bandstand,
  bleachers,
  cart,
  diner,
  entranceArch,
  firstAid,
  flowerBed,
  fortuneTent,
  gameBooth,
  highStriker,
  mirrorMaze,
  restrooms,
  ringPedestal,
  ticketBooth,
  type Game,
} from "./midway";
import {
  STALL_COLORS,
  STALL_KINDS,
  beads,
  bench,
  bunting,
  commit,
  lamp,
  newLocal,
  placeM,
  stall,
  tAt,
  tree,
  umbrellaTable,
  type Parts,
} from "./parts";

// DRAFT: everything in the East zone that isn't a ride: lamps and bulb strings
// along the walks, stalls on the walk from Central and the East Walk, the
// helter-skelter, the food court, the midway (E2: the diner, the games alley,
// snack carts, the bandstand lawn, the circus ring with its wagons, the tents in
// the south corner, the entrance arch and the services), benches, trees along
// the road sides, and the power box with its cables. Zone metres.

/** Spots taken by buildings, stalls and the like (centre, radius), so trees keep off them. */
type Spot = [number, number, number];

/** True when (x, z) is inside the tent's oval grown by `grow` metres. */
function inTent(x: number, z: number, grow: number) {
  const dx = x - BIGTOP[0];
  const dz = z - BIGTOP[1];
  const c = Math.cos(BT_RY);
  const s = Math.sin(BT_RY);
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return (u / (BT_A + grow)) ** 2 + (v / (BT_B + grow)) ** 2 < 1;
}

function clearOf(x: number, z: number, taken: Spot[], m: number) {
  for (const [sx, sz, r] of taken) if (Math.hypot(x - sx, z - sz) < r + m) return false;
  return true;
}

// ---------- walks: lamps, strings, stalls, benches ----------

/**
 * Lamps every `step` metres along a walk on the given sides (+1 left, -1 right of its direction; `outer` keeps
 * only the side away from that point), with bulb strings between neighbours.
 */
function walkLamps(p: Parts, w: Walk, step: number, sides: number[], ring: string, taken: Spot[], outer?: [number, number]) {
  const pts = w.pts;
  const segs = w.closed ? pts.length : pts.length - 1;
  const rows: (V3 | null)[][] = sides.map(() => []);
  let s = step / 2;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    for (; s < len; s += step) {
      const cx = a[0] + (dx * s) / len;
      const cz = a[1] + (dz * s) / len;
      sides.forEach((sd, k) => {
        let x = cx + nx * sd * (w.hw + 0.8);
        let z = cz + nz * sd * (w.hw + 0.8);
        if (outer) {
          const x2 = cx - nx * sd * (w.hw + 0.8);
          const z2 = cz - nz * sd * (w.hw + 0.8);
          if (Math.hypot(x2 - outer[0], z2 - outer[1]) > Math.hypot(x - outer[0], z - outer[1])) {
            x = x2;
            z = z2;
          }
        }
        const ok = onLawn(x, z, 1) && groundY(x, z) === 0 && trackDist(x, z) > 4 && !inTent(x, z, 3) && clearOf(x, z, taken, 1);
        if (!ok) {
          rows[k].push(null);
          return;
        }
        lamp(p, x, z, 0, LAMP_H, ring);
        rows[k].push([x, LAMP_H + 0.15, z]);
        taken.push([x, z, 1]);
      });
    }
    s -= len;
  }
  for (const row of rows) {
    if (w.closed && row.length > 2) row.push(row[0]);
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      if (!a || !b || Math.hypot(b[0] - a[0], b[2] - a[2]) > step * 1.6) continue;
      bunting(p, a, b, p.lite ? 6 : 10, 0.7, !p.lite);
    }
  }
}

function walks(p: Parts, taken: Spot[]) {
  const lite = p.lite;
  // stalls first, so lamps keep off them: on both sides of the walk from Central, facing it
  const north = lite ? [-88, -58, -34] : [-92, -86, -60, -54, -36, -30];
  const south = lite ? [-84, -40] : [-90, -84, -62, -56, -40, -34];
  const off = MAIN.hw + 4.6;
  north.forEach((z, i) => {
    stall(p, MAIN_X + off, z, 0, -Math.PI / 2, STALL_COLORS[i % 5], STALL_KINDS[(i + 1) % 5]);
    taken.push([MAIN_X + off, z, 3.2]);
  });
  south.forEach((z, i) => {
    stall(p, MAIN_X - off, z, 0, Math.PI / 2, STALL_COLORS[(i + 2) % 5], STALL_KINDS[(i + 3) % 5]);
    taken.push([MAIN_X - off, z, 3.2]);
  });
  // stalls on the East Walk's east side, facing it (west)
  const east = lite ? [-8, 8] : [-12, -6, 6, 12];
  east.forEach((x, i) => {
    const z = 82 + ((x + 20) / 40) * 4 + 3 + 4.6;
    stall(p, x, z, 0, Math.PI, STALL_COLORS[(i + 1) % 5], STALL_KINDS[(i + 2) % 5]);
    taken.push([x, z, 3.2]);
  });
  // lamps with strings: both sides of the main walks, the outer side of the ring road, one side of the lanes
  const [main, ring, ...rest] = WALKS;
  walkLamps(p, main, 13, [-1, 1], NEON.yellow, taken);
  walkLamps(p, ring, 15, [1], NEON.yellow, taken, BIGTOP);
  rest.forEach((w, i) => {
    if (w.lamps !== false) walkLamps(p, w, 14, w.hw >= 3 ? [-1, 1] : [1], [NEON.cyan, NEON.pink, NEON.lilac, NEON.yellow, NEON.orange][i % 5], taken);
  });
  // benches along the walk from Central and round the hub
  for (const z of [-107, -78, -66, -44]) {
    if (clearOf(MAIN_X + MAIN.hw + 1.6, z, taken, 1.2)) bench(p, MAIN_X + MAIN.hw + 1.6, z, 0, Math.PI);
    if (clearOf(MAIN_X - MAIN.hw - 1.6, z, taken, 1.2)) bench(p, MAIN_X - MAIN.hw - 1.6, z, 0, 0);
  }
  for (const a of [0.6, 2.2, 3.9, 5.4]) {
    const x = HUB[0] + Math.cos(a) * (HUB_R - 1.6);
    const z = HUB[1] + Math.sin(a) * (HUB_R - 1.6);
    if (!inTent(x, z, 4)) bench(p, x, z, PLAZA_Y, Math.atan2(Math.sin(a), -Math.cos(a)));
  }
  // light pools along the walks
  for (const w of [main, rest[3], rest[4]]) {
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, az] = w.pts[i];
      const [bx, bz] = w.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 10; s < len - 6; s += 22) p.pools.push({ x: ax + ((bx - ax) * s) / len, z: az + ((bz - az) * s) / len, r: 7, c: s % 44 < 22 ? NEON.warm : NEON.yellow });
    }
  }
}

// ---------- the helter-skelter ----------

function helterSkelter(p: Parts) {
  const [x, z] = HS;
  const y0 = PLAZA_Y;
  const t = tAt(x, z);
  const R0 = 3.4;
  const R1 = 2.3;
  const H = 14;
  p.frame.revolve([x, y0, z], [[R0, 0], [R1, H]], 16, (s) => (s % 2 ? PAINT.cream : PAINT.red));
  p.frame.cyl(PAINT.gold, [x, y0 + H + 0.15, z], R1 + 0.9, 0.3, G.cyl20);
  p.frame.revolve([x, y0 + H + 0.3, z], [[R1 + 0.7, 0], [0, 5]], 16, (s) => (s % 2 ? PAINT.cream : PAINT.red));
  bar(p.frame, PAINT.gold, [x, y0 + H + 5, z], [x, y0 + H + 7, z], 0.07, S.tube4);
  p.frame.tri(PAINT.yellow, [x, y0 + H + 7, z], [x, y0 + H + 6, z], [x, y0 + H + 6.5, z + 1.8], true);
  tube(p.light, circlePts([x, y0 + H + 0.34, z], R1 + 0.95, 24), 0.08, NEON.yellow, t, 0, true);
  // the slide: three turns down round the tower, a yellow chute with a red rim and bulbs on it
  const M = p.lite ? 54 : 84;
  const turns = 3;
  const P = (i: number, r: number, dy: number): V3 => {
    const f = i / M;
    const a = f * turns * TAU;
    const y = (H - 0.8) * (1 - f) + 0.7;
    const rr = R0 + (R1 - R0) * (y / H) + 0.1 + r;
    return [x + Math.cos(a) * rr, y0 + y + dy, z - Math.sin(a) * rr];
  };
  const rim: V3[] = [];
  for (let i = 0; i < M; i++) {
    p.frame.quad(PAINT.yellow, P(i, 0, 0), P(i, 1.5, -0.2), P(i + 1, 1.5, -0.2), P(i + 1, 0, 0), true);
    rim.push(P(i, 1.55, 0.15));
    if (i % 3 === 0) p.bulbs.add(P(i, 1.6, 0.4), 0.16, bulbC(i / 3), t + 0.12 * (i / M));
  }
  rim.push(P(M, 1.55, 0.15));
  for (let i = 0; i < rim.length - 1; i++) bar(p.frame, PAINT.red, rim[i], rim[i + 1], 0.12, S.tube4);
  const d = [26 - x, -8 - z];
  const l = Math.hypot(d[0], d[1]);
  p.boards.push({ x: x + (d[0] / l) * (HS_R - 1.5), z: z + (d[1] / l) * (HS_R - 1.5) + 2.5, ry: Math.atan2(-d[1], d[0]) });
  p.pools.push({ x, z, r: HS_R + 5, c: NEON.pink });
}

// ---------- the food court ----------

function foodCourt(p: Parts) {
  const [x0, x1] = FOOD.x;
  const [z0, z1] = FOOD.z;
  const y = COURT_Y;
  const xs = p.lite ? [75, 86] : [72, 80, 88];
  const zs = p.lite ? [17, 29, 41] : [15, 23, 31, 39];
  let i = 0;
  for (const x of xs) for (const z of zs) umbrellaTable(p, x, z, y, i++ % 2 ? PAINT.red : PAINT.teal);
  const north = p.lite ? [18, 38] : [14, 22, 30, 38, 46];
  north.forEach((z, k) => stall(p, x1 - 2.4, z, y, -Math.PI / 2, STALL_COLORS[k % 5], STALL_KINDS[k % 5]));
  const east = p.lite ? [80] : [73, 81];
  east.forEach((x, k) => stall(p, x, z1 - 2.4, y, Math.PI, STALL_COLORS[(k + 2) % 5], STALL_KINDS[(k + 3) % 5]));
  // festoons from four tall poles
  const c: V3[] = [
    [x0 + 1.5, 0, z0 + 1.5],
    [x1 - 5.5, 0, z0 + 1.5],
    [x1 - 5.5, 0, z1 - 5.5],
    [x0 + 1.5, 0, z1 - 5.5],
  ];
  for (const q of c) lamp(p, q[0], q[2], y, 8, NEON.yellow);
  const top = (q: V3): V3 => [q[0], y + 8.15, q[2]];
  const pairs: [number, number][] = [
    [0, 2],
    [1, 3],
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  for (const [a, b] of pairs) bunting(p, top(c[a]), top(c[b]), p.lite ? 10 : 18, 1.6, false);
  p.pools.push({ x: (x0 + x1) / 2 - 2, z: (z0 + z1) / 2 - 8, r: 14, c: NEON.warm });
  p.pools.push({ x: (x0 + x1) / 2 - 2, z: (z0 + z1) / 2 + 10, r: 14, c: NEON.yellow });
}

// ---------- the circus wagons ----------

/** A circus wagon 6 m long along local x, turned ry (round the circus ring). */
function wagon(p: Parts, x: number, z: number, ry: number, k: number) {
  const t = tAt(x, z);
  const l = newLocal(p.lite);
  const fr = l.frame;
  const body = [PAINT.red, PAINT.teal, PAINT.navy, PAINT.red][k % 4];
  fr.box(body, [0, 2.15, 0], [6, 2.5, 2.6]);
  fr.box(PAINT.gold, [0, 0.95, 0], [6.2, 0.16, 2.72]);
  fr.box(PAINT.gold, [0, 3.42, 0], [6.2, 0.16, 2.72]);
  fr.box(PAINT.cream, [0, 3.75, 0], [6.5, 0.4, 3.0]);
  for (const sx of [-2.1, 2.1]) {
    for (const sz of [-1.45, 1.45]) {
      fr.add(S.cyl12, mat(sx, 0.8, sz, 0.78, 0.2, 0.78, 0, Math.PI / 2), PAINT.cream);
      fr.add(S.cyl12, mat(sx, 0.8, sz * 1.08, 0.22, 0.12, 0.22, 0, Math.PI / 2), PAINT.gold);
    }
  }
  if (k % 2 === 0) {
    for (let i = 0; i < 9; i++) for (const sz of [-1.36, 1.36]) bar(fr, PAINT.gold, [-2.6 + i * 0.65, 1.05, sz], [-2.6 + i * 0.65, 3.35, sz], 0.05, S.tube4);
  } else {
    for (const sz of [-1, 1]) fr.add(G.star, mat(0, 2.2, sz * 1.36, 0.8, 0.8, 0.12), PAINT.yellow);
  }
  fr.box(PAINT.iron, [3.7, 0.8, 0], [1.6, 0.12, 0.2]);
  for (const sz of [-1.52, 1.52]) beads(l.bulbs, [[-3.2, 4.0, sz], [3.2, 4.0, sz]], p.lite ? 1.6 : 0.8, 0.14, t);
  commit(p, l, placeM(x, z, ry));
}

// ---------- power box and cables ----------

/**
 * The cables' routes from the box: to the tent's door, the coaster, the ship, the haunted house, the arcade, the
 * helter-skelter, the food court, Midway Square (along the games alley's edge) and the circus ring.
 */
function cableRoutes(): [number, number][][] {
  const [bx, bz] = POWER_BOX;
  const door = btPoint(-3, BT_B + 3.5);
  const [ax, az] = ALLEY.a;
  const [ex, ez] = ALLEY.b;
  const ul = Math.hypot(ex - ax, ez - az);
  const off = ALLEY.hw - 0.6;
  const nx = (-(ez - az) / ul) * off;
  const nz = ((ex - ax) / ul) * off;
  return [
    [[bx + 0.9, bz + 1.1], [ax + nx, az + nz], [ex + nx, ez + nz], [SQUARE[0] - 4, SQUARE[1] + 3]],
    [[bx + 1.0, bz + 1.1], [HS[0] - HS_R + 0.5, HS[1] - 2], [HS[0] + 3, HS[1] + 7.5], [40, 58], [42, 76], [CIRCUS[0] - CIRCUS_R + 1, CIRCUS[1] - 4]],
    [[bx - 1.0, bz + 1.0], [-1.5, -11], door],
    [[bx - 1.3, bz], [-0.3, bz - 6], [-0.3, -67.6], [STATION_COURT.x[1] - 0.6, -67.6]],
    [[bx - 0.6, bz - 1.2], [-14, -24.4], [-52, -9], [-63, 2], [SHIP[0] + SHIP_R - 1.5, 5]],
    [[bx - 0.2, bz - 1.3], [-14, -25.6], [-53, -10.2], [-66, 3.6], [-68.5, 40], [HH_PLAZA[0] - 4, HH_PLAZA[1] - 4]],
    [[bx + 0.2, bz - 1.3], [-14, -26.8], [-54, -11.4], [-67.3, 5.2], [-70, 41], [ARCADE_COURT.x[1] - 2, ARCADE_COURT.z[0] + 4]],
    [[bx + 1.2, bz + 0.8], [HS[0] - HS_R + 0.5, HS[1] - 3]],
    [[bx + 1.3, bz], [22, -26], [46, -16], [FOOD.x[0] - 0.5, 9]],
  ];
}

function powerBox(p: Parts) {
  const [x, z] = POWER_BOX;
  const y = groundY(x, z);
  p.frame.add(G.box, mat(x, y + 0.15, z, 3.4, 0.3, 2.6), PAINT.iron);
  p.frame.add(G.box, mat(x, y + 1.4, z, 2.2, 2.2, 1.5), PAINT.cream);
  p.frame.add(G.box, mat(x, y + 2.6, z, 2.6, 0.22, 1.9), PAINT.red);
  for (let i = 0; i < 8; i++) p.frame.add(G.box, mat(x - 0.96 + i * 0.275, y + 0.55, z + 0.77, 0.275, 0.22, 0.04), i % 2 ? PAINT.black : PAINT.yellow);
  for (let i = 0; i < 4; i++) p.frame.add(G.box, mat(x + 1.11, y + 1.3, z - 0.45 + i * 0.3, 0.04, 1.1, 0.12), PAINT.iron);
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
        p.light.seg(NEON.yellow, [a[0], yc, a[1]], [b[0], yc, b[1]], 0.17, S.tube4, 0.04 + (0.62 * (s + f0 * len)) / 175, -700 - j);
      }
      s += len;
    }
  }
  p.pools.push({ x, z, r: 4.5, c: NEON.yellow });
}

// ---------- trees ----------

function freeLawn(x: number, z: number, m: number, taken: Spot[]) {
  if (!onLawn(x, z, m + 1)) return false;
  for (const [dx, dz] of [
    [0, 0],
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
  ])
    if (groundY(x + dx, z + dz) > 0) return false;
  if (inTent(x, z, 5 + m) || trackDist(x, z) < 4.5 + m) return false;
  for (const w of WALKS) if (walkDist(x, z, w) < w.hw + 3 + m) return false;
  for (const pl of PLAZAS) if (Math.hypot(x - pl.c[0], z - pl.c[1]) < pl.r + 2 + m) return false;
  for (const c of COURTS) if (x > c.x[0] - 2 - m && x < c.x[1] + 2 + m && z > c.z[0] - 2 - m && z < c.z[1] + 2 + m) return false;
  if (!clearOf(x, z, taken, m)) return false;
  for (const route of cableRoutes()) for (let i = 0; i < route.length - 1; i++) if (segDist(x, z, route[i], route[i + 1]) < 1.2 + m * 0.6) return false;
  return true;
}

/** Where the trees grow: a belt along the zone's road sides (Ben, 2026-10-17: no more trees filling every gap). */
function inBelt(x: number, z: number) {
  return x > 100 || z > 104 || (x < -112 && z > 15) || (x < -50 && z < -88);
}

/** Single shade trees on the lawns between the midway's pieces; each only where the lawn is free. */
const SHADE: [number, number][] = [
  [94, -34],
  [74, -44],
  [92, -2],
  [52, -16],
  [88, -44],
  [64, -14],
  [96, -92],
  [62, -100],
  [64, 88],
  [30, 106],
  [-84, 26],
  [-78, 62],
  [-70, 30],
  [-30, 96],
  [10, 100],
];

function greenery(p: Parts, taken: Spot[]) {
  const r = rng(91);
  const step = p.lite ? 17 : 12.5;
  let k = 0;
  for (let x = -122; x < 113; x += step) {
    for (let z = -119; z < 116; z += step) {
      const tx = x + (r() - 0.5) * step * 0.7;
      const tz = z + (r() - 0.5) * step * 0.7;
      const s = 0.85 + r() * 0.4;
      if (!inBelt(tx, tz) || !freeLawn(tx, tz, 2.4 * s, taken)) continue;
      tree(p, tx, tz, 0, s, k++);
    }
  }
  for (const [i, [x, z]] of SHADE.entries()) {
    if (p.lite && i % 2) continue;
    if (freeLawn(x, z, 2.6, taken)) tree(p, x, z, 0, 1.05, k++);
  }
}

// ---------- the midway (E2) ----------

/** The turn that makes a piece's front (local +z) face from (x, z) towards (tx, tz). */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

/** True when a piece of radius r fits at (x, z) on bare lawn (flower beds, picnic tables, benches). */
function bare(x: number, z: number, r: number, taken: Spot[]) {
  if (!onLawn(x, z, r) || trackDist(x, z) < r + 2 || inTent(x, z, r + 1) || !clearOf(x, z, taken, r)) return false;
  for (const [dx, dz] of [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ])
    if (groundY(x + dx, z + dz) > 0) return false;
  return WALKS.every((w) => walkDist(x, z, w) > w.hw + r + 0.3);
}

const BOOTH_PAINT: [string, string][] = [
  [PAINT.red, NEON.yellow],
  [PAINT.teal, NEON.cyan],
  [PAINT.navy, NEON.pink],
  [PAINT.plum, NEON.lilac],
];
const GAMES: Game[] = ["rings", "darts", "ducks", "hoops"];

/** Flower beds along a walk, every `step` metres on both sides, where the lawn is free. */
function bedsAlong(p: Parts, w: Walk, step: number, taken: Spot[], seed: number) {
  let k = seed;
  for (let i = 0; i < w.pts.length - 1; i++) {
    const [ax, az] = w.pts[i];
    const [bx, bz] = w.pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let s = step / 2; s < len - 2; s += step) {
      for (const side of [-1, 1]) {
        const x = ax + ux * s - uz * side * (w.hw + 1.6);
        const z = az + uz * s + ux * side * (w.hw + 1.6);
        if (!bare(x, z, 1.5, taken)) continue;
        flowerBed(p, x, z, Math.atan2(-uz, ux), 2.8, 1.0, k++);
        taken.push([x, z, 1.7]);
      }
    }
  }
}

function midway(p: Parts, taken: Spot[]) {
  const lite = p.lite;
  // the VORTEX Diner, facing the square, and its terrace
  diner(p, DINER.x, DINER.z, -Math.PI / 2, DINER.w, DINER.d);
  taken.push([DINER.x, DINER.z - 6, 7.5], [DINER.x, DINER.z + 6, 7.5]);
  const terraceX = (TERRACE.x[0] + TERRACE.x[1]) / 2;
  for (const z of lite ? [-77, -63] : [-78, -73.5, -66.5, -62]) umbrellaTable(p, terraceX, z, COURT_Y, z < DINER.z ? PAINT.red : PAINT.teal);
  p.boards.push({ x: TERRACE.x[0] - 0.8, z: DINER.z + 3.5, ry: Math.PI });
  p.pools.push({ x: TERRACE.x[0], z: DINER.z, r: 13, c: NEON.pink });

  // Midway Square: a striped mast with bulb strings to the lamps round its rim, the high striker
  const mastH = 11;
  ringPedestal(p, SQUARE[0], SQUARE[1], PLAZA_Y, mastH);
  const gaps = [ALLEY.b, LANE[LANE.length - 1], [DINER.x, DINER.z], STRIKER].map(([x, z]) => Math.atan2(z - SQUARE[1], x - SQUARE[0]));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.32)) continue;
    const lx = SQUARE[0] + Math.cos(a) * (SQUARE_R - 1.1);
    const lz = SQUARE[1] + Math.sin(a) * (SQUARE_R - 1.1);
    lamp(p, lx, lz, PLAZA_Y, LAMP_H, NEON.yellow);
    taken.push([lx, lz, 1]);
    bunting(p, [SQUARE[0], PLAZA_Y + mastH - 0.3, SQUARE[1]], [lx, PLAZA_Y + LAMP_H + 0.15, lz], lite ? 6 : 11, 0.9, !lite);
  }
  highStriker(p, STRIKER[0], STRIKER[1], PLAZA_Y, facing(STRIKER[0], STRIKER[1], SQUARE[0], SQUARE[1]));
  taken.push([STRIKER[0], STRIKER[1], 2]);
  p.pools.push({ x: SQUARE[0], z: SQUARE[1], r: 16, c: NEON.warm });

  // the games alley: the GAMES arch at its start, booths down both sides facing it, bulb strings across it
  const [ax, az] = ALLEY.a;
  const [ex, ez] = ALLEY.b;
  const len = Math.hypot(ex - ax, ez - az);
  const ux = (ex - ax) / len;
  const uz = (ez - az) / len;
  const along = (s: number, side: number, off: number): [number, number] => [ax + ux * s - uz * side * off, az + uz * s + ux * side * off];
  const [gx, gz] = along(ALLEY_ARCH, 0, 0);
  entranceArch(p, gx, gz, Math.atan2(-ux, -uz), ALLEY.hw + 1.2, "GAMES");
  for (const side of [-1, 1]) taken.push([...along(ALLEY_ARCH, side, ALLEY.hw + 1.2), 1.4] as Spot);
  const board = along(ALLEY_ARCH + 3, 1, ALLEY.hw - 0.9);
  p.boards.push({ x: board[0], z: board[1], ry: Math.atan2(uz, -ux) });
  ALLEY_BOOTHS.forEach((s, i) => {
    for (const side of [-1, 1]) {
      const [x, z] = along(s, side, ALLEY.hw + 2.6);
      gameBooth(p, x, z, Math.atan2(uz * side, -ux * side), GAMES[(i + (side > 0 ? 2 : 0)) % 4], BOOTH_PAINT[(i * 2 + (side > 0 ? 1 : 0)) % 4]);
      taken.push([x, z, 2.8]);
    }
    // bulb strings across the alley, zigzagging from one side's awnings to the other's
    const a = along(s - 2.2, 1, ALLEY.hw + 0.9);
    const b = along(s + 2.2, -1, ALLEY.hw + 0.9);
    bunting(p, [a[0], 3.7, a[1]], [b[0], 3.7, b[1]], lite ? 6 : 10, 0.5, !lite);
    if (i < ALLEY_BOOTHS.length - 1) {
      const c = along(s + 6.8, 1, ALLEY.hw + 0.9);
      bunting(p, [b[0], 3.7, b[1]], [c[0], 3.7, c[1]], lite ? 6 : 10, 0.5, !lite);
    }
  });
  for (const s of [20, 45]) {
    const [x, z] = along(s, 0, 0);
    p.pools.push({ x, z, r: 9, c: NEON.yellow });
  }

  // snack carts
  for (const [i, c] of CARTS.entries()) {
    if (lite && i % 2) continue;
    const [x, z] = c.at;
    cart(p, x, z, groundY(x, z), facing(x, z, c.face[0], c.face[1]), c.kind);
    taken.push([x, z, 1.8]);
  }

  // the bandstand lawn: the bandstand facing the helter-skelter's walk, picnic tables, benches, flower beds
  const bandRy = facing(BANDSTAND[0], BANDSTAND[1], HS[0], HS[1]);
  bandstand(p, BANDSTAND[0], BANDSTAND[1], PLAZA_Y, bandRy);
  p.pools.push({ x: BANDSTAND[0], z: BANDSTAND[1], r: 11, c: NEON.warm });
  for (const [i, [x, z]] of PICNIC.entries()) {
    if ((lite && i % 2) || !bare(x, z, 2.4, taken)) continue;
    umbrellaTable(p, x, z, 0, i % 2 ? PAINT.teal : PAINT.red);
    taken.push([x, z, 2.6]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + TAU / 8;
    const x = BANDSTAND[0] + Math.cos(a) * (BANDSTAND_R + 3.4);
    const z = BANDSTAND[1] + Math.sin(a) * (BANDSTAND_R + 3.4);
    if (bare(x, z, 1.5, taken)) {
      flowerBed(p, x, z, Math.atan2(-Math.cos(a), -Math.sin(a)), 2.6, 1.1, 40 + i);
      taken.push([x, z, 1.7]);
    }
    const b = (i / 4) * TAU;
    const bx = BANDSTAND[0] + Math.cos(b) * (BANDSTAND_R + 2.6);
    const bz = BANDSTAND[1] + Math.sin(b) * (BANDSTAND_R + 2.6);
    if (!lite && bare(bx, bz, 1.2, taken)) {
      bench(p, bx, bz, 0, Math.atan2(Math.sin(b), -Math.cos(b)));
      taken.push([bx, bz, 1.4]);
    }
  }

  // the circus ring: bleachers north and south facing it, the wagons round its east side, bulb strings from the mast
  const ringMast = 9.5;
  ringPedestal(p, CIRCUS[0], CIRCUS[1], PLAZA_Y, ringMast);
  const stands: [number, number, number][] = [
    [CIRCUS[0] + CIRCUS_R + 4.5, CIRCUS[1], -Math.PI / 2],
    [CIRCUS[0] - CIRCUS_R - 4.5, CIRCUS[1], Math.PI / 2],
  ];
  const top: V3 = [CIRCUS[0], PLAZA_Y + ringMast - 0.3, CIRCUS[1]];
  for (const [x, z, ry] of stands) {
    bleachers(p, x, z, ry, 10);
    taken.push([x, z - 3, 4], [x, z + 3, 4]);
    for (const sd of [-1, 1]) {
      const lx = sd * 5;
      const lz = -2.05;
      bunting(p, top, [x + lx * Math.cos(ry) + lz * Math.sin(ry), 2.7, z - lx * Math.sin(ry) + lz * Math.cos(ry)], lite ? 6 : 10, 0.6, !lite);
    }
  }
  WAGONS.forEach(([x, z, a], i) => {
    wagon(p, x, z, a, i);
    taken.push([x, z, 4]);
    bunting(p, top, [x, 4.1, z], lite ? 6 : 10, 0.7, !lite);
  });
  {
    const [sx, sz] = [36, 79.1];
    const d = Math.hypot(CIRCUS[0] - sx, CIRCUS[1] - sz);
    const vx = (CIRCUS[0] - sx) / d;
    const vz = (CIRCUS[1] - sz) / d;
    p.boards.push({ x: sx + vx * 6 + vz * 3.6, z: sz + vz * 6 - vx * 3.6, ry: Math.atan2(vz, -vx) });
  }
  p.pools.push({ x: CIRCUS[0], z: CIRCUS[1], r: 15, c: NEON.orange });

  // the south corner: the fortune teller's tent and the hall of mirrors, facing the south walk
  fortuneTent(p, FORTUNE[0], FORTUNE[1], -Math.PI / 2);
  mirrorMaze(p, MIRRORS[0], MIRRORS[1], Math.PI / 2);
  taken.push([FORTUNE[0], FORTUNE[1], 4.2], [MIRRORS[0], MIRRORS[1], 7]);
  p.pools.push({ x: FORTUNE[0] - 4, z: FORTUNE[1], r: 7, c: NEON.lilac }, { x: MIRRORS[0] + 6.5, z: MIRRORS[1], r: 8, c: NEON.cyan });

  // the entrance arch over the walk from Central, and the ticket booth beside it
  entranceArch(p, MAIN_X, ARCH_Z, Math.PI, MAIN.hw + 1.4, "BIG TOP");
  taken.push([MAIN_X - MAIN.hw - 1.4, ARCH_Z, 1.4], [MAIN_X + MAIN.hw + 1.4, ARCH_Z, 1.4]);
  ticketBooth(p, TICKETS[0], TICKETS[1], Math.PI / 2);
  taken.push([TICKETS[0], TICKETS[1], 2.4]);
  p.pools.push({ x: MAIN_X, z: ARCH_Z + 2, r: 8, c: NEON.yellow });

  // the restrooms by the square, first aid by the arcade
  restrooms(p, WC[0], WC[1], facing(WC[0], WC[1], SQUARE[0], SQUARE[1]));
  firstAid(p, FIRST_AID[0], FIRST_AID[1], facing(FIRST_AID[0], FIRST_AID[1], ARCADE_COURT.x[1], ARCADE[1]));
  taken.push([WC[0], WC[1], 5], [FIRST_AID[0], FIRST_AID[1], 3]);

  // flower beds along the new walks (the west lane, the walk to the bandstand, to the circus, the south walk)
  WALKS.slice(-4).forEach((w, i) => bedsAlong(p, w, lite ? 22 : 11, taken, 60 + i * 20));
}

export function bakeDecor(p: Parts) {
  const taken: Spot[] = [
    [POWER_BOX[0], POWER_BOX[1], 3],
    [HAUNTED[0], HAUNTED[1], 14],
    [ARCADE[0], ARCADE[1], 13],
    [PRIZE[0], PRIZE[1], 5],
  ];
  midway(p, taken);
  walks(p, taken);
  helterSkelter(p);
  foodCourt(p);
  powerBox(p);
  greenery(p, taken);
}
