import { G, TAU, mat, rng, type V3 } from "../central/kit";
import { S, bar, circlePts, tube } from "../west/kit";
import { trackDist } from "./coaster";
import { COURT_Y, PLAZA_Y, groundY, segDist, walkDist } from "./ground";
import { NEON, PAINT, bulbC } from "./kit";
import {
  ARCADE,
  ARCADE_COURT,
  BIGTOP,
  BT_A,
  BT_B,
  BT_RY,
  COURTS,
  FOOD,
  HAUNTED,
  HH_PLAZA,
  HS,
  HS_R,
  HUB,
  HUB_R,
  LAMP_H,
  MAIN,
  MAIN_X,
  PLAZAS,
  POWER_BOX,
  PRIZE,
  SHIP,
  SHIP_R,
  STATION_COURT,
  WAGONS,
  WALKS,
  btPoint,
  onLawn,
  type Walk,
} from "./layout";
import { STALL_COLORS, STALL_KINDS, beads, bench, bunting, lamp, stall, tAt, tree, umbrellaTable, type Parts } from "./parts";

// DRAFT: everything in the East zone that isn't a ride: lamps and bulb strings
// along the walks, stalls on the walk from Central and the East Walk, the
// helter-skelter, the food court, the circus wagons, benches, trees, and the
// power box with its cables. Zone metres.

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
  rest.forEach((w, i) => walkLamps(p, w, 14, w.hw >= 3 ? [-1, 1] : [1], [NEON.cyan, NEON.pink, NEON.lilac, NEON.yellow, NEON.orange][i % 5], taken));
  // benches along the walk from Central and round the hub
  for (const z of [-112, -78, -66, -44]) {
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

function wagon(p: Parts, x: number, z: number, k: number) {
  const t = tAt(x, z);
  const body = [PAINT.red, PAINT.teal, PAINT.navy, PAINT.red][k % 4];
  p.frame.box(body, [x, 2.15, z], [6, 2.5, 2.6]);
  p.frame.box(PAINT.gold, [x, 0.95, z], [6.2, 0.16, 2.72]);
  p.frame.box(PAINT.gold, [x, 3.42, z], [6.2, 0.16, 2.72]);
  p.frame.box(PAINT.cream, [x, 3.75, z], [6.5, 0.4, 3.0]);
  for (const sx of [-2.1, 2.1]) {
    for (const sz of [-1.45, 1.45]) {
      p.frame.add(S.cyl12, mat(x + sx, 0.8, z + sz, 0.78, 0.2, 0.78, 0, Math.PI / 2), PAINT.cream);
      p.frame.add(S.cyl12, mat(x + sx, 0.8, z + sz * 1.08, 0.22, 0.12, 0.22, 0, Math.PI / 2), PAINT.gold);
    }
  }
  if (k % 2 === 0) {
    for (let i = 0; i < 9; i++) for (const sz of [-1.36, 1.36]) bar(p.frame, PAINT.gold, [x - 2.6 + i * 0.65, 1.05, z + sz], [x - 2.6 + i * 0.65, 3.35, z + sz], 0.05, S.tube4);
  } else {
    for (const sz of [-1, 1]) p.frame.add(G.star, mat(x, 2.2, z + sz * 1.36, 0.8, 0.8, 0.12), PAINT.yellow);
  }
  p.frame.box(PAINT.iron, [x + 3.7, 0.8, z], [1.6, 0.12, 0.2]);
  for (const sz of [-1.52, 1.52]) beads(p.bulbs, [[x - 3.2, 4.0, z + sz], [x + 3.2, 4.0, z + sz]], p.lite ? 1.6 : 0.8, 0.14, t);
}

// ---------- power box and cables ----------

/** The cables' routes from the box: to the tent's door, the coaster, the ship, the haunted house, the arcade, the helter-skelter and the food court. */
function cableRoutes(): [number, number][][] {
  const [bx, bz] = POWER_BOX;
  const door = btPoint(-3, BT_B + 3.5);
  return [
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

function greenery(p: Parts, taken: Spot[]) {
  const r = rng(91);
  const step = p.lite ? 17 : 12.5;
  let k = 0;
  for (let x = -110; x < 113; x += step) {
    for (let z = -119; z < 116; z += step) {
      const tx = x + (r() - 0.5) * step * 0.7;
      const tz = z + (r() - 0.5) * step * 0.7;
      const s = 0.85 + r() * 0.4;
      if (!freeLawn(tx, tz, 2.4 * s, taken)) continue;
      tree(p, tx, tz, 0, s, k++);
    }
  }
}

export function bakeDecor(p: Parts) {
  const taken: Spot[] = [
    [POWER_BOX[0], POWER_BOX[1], 3],
    [HAUNTED[0], HAUNTED[1], 14],
    [ARCADE[0], ARCADE[1], 13],
    [PRIZE[0], PRIZE[1], 5],
    ...WAGONS.map(([x, z]) => [x, z, 4.5] as Spot),
  ];
  walks(p, taken);
  helterSkelter(p);
  foodCourt(p);
  WAGONS.forEach(([x, z], i) => wagon(p, x, z, i));
  powerBox(p);
  greenery(p, taken);
}
