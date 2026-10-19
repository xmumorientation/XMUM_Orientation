import { BULB_COLORS, G, PAINT, STALL_COLORS, TAU, mat, rng, starPoints, type V3 } from "./kit";
import { groundY } from "./ground";
import {
  BOULEVARD,
  BOUNDS,
  BUMPER,
  BUMPER_HX,
  BUMPER_HZ,
  CROSSING,
  CROSSING_R,
  DROP,
  DROP_R,
  FOUNTAIN,
  LAMP_H,
  MIDWAY_LAMPS_X,
  MIDWAY_LAMPS_Z,
  POWER_BOX,
  PROMENADE,
  PROM_LAMPS_Z,
  SQUARE,
  STAGE,
  SWINGS,
  SWINGS_R,
  TEACUPS,
  TEACUPS_R,
} from "./layout";
import { bunting, frame, lamp, tAt, tree, type Parts } from "./parts";

// DRAFT: everything in the Central zone that isn't a ride: lamps and bulb
// strings, stalls, the north square (fountain, stage, food court, games),
// trees and hedges, the power box and its cables. Zone metres.

// ---------- stalls ----------

/** Stall kinds: what stands on the roof. */
type Kind = "ice" | "pop" | "candy" | "game" | "drink";
const KINDS: Kind[] = ["ice", "pop", "candy", "game", "drink"];

/** A toy stall 3.6 m wide. Its counter faces local +z, turned `ry` (0: faces +z, π: faces -z, -π/2: faces -x). */
function stall(p: Parts, x: number, z: number, ry: number, c: string, kind: Kind) {
  const f = frame(x, z, ry);
  const y0 = groundY(x, z);
  const box = (col: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
    const q = f(cx, y0 + cy, cz);
    p.paint.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), col);
  };
  box(c, 0, 1.3, -0.55, 3.6, 2.6, 1.5);
  box(PAINT.cream, 0, 0.55, 0.65, 3.6, 1.1, 1.0);
  box(c, 0, 1.14, 0.65, 3.7, 0.16, 1.1);
  for (const sx of [-1.7, 1.7]) box(PAINT.white, sx, 1.75, 1.05, 0.18, 2.4, 0.18);
  // striped awning, sloping down to the front
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = -1.9 + (3.8 * i) / n;
    const u1 = -1.9 + (3.8 * (i + 1)) / n;
    const col = i % 2 ? PAINT.white : c;
    p.paint.quad(col, f(u0, y0 + 3.0, 1.55), f(u1, y0 + 3.0, 1.55), f(u1, y0 + 3.75, -1.35), f(u0, y0 + 3.75, -1.35), true);
    // scallop under the front edge
    const q = f((u0 + u1) / 2, y0 + 3.02, 1.56);
    p.paint.add(G.pennant, mat(q[0], q[1], q[2], 0.62, 0.55, 1, ry), i % 2 ? c : PAINT.white);
  }
  // roof topper
  const top = f(0, y0 + 3.75, -0.6);
  const [tx, ty, tz] = top;
  if (kind === "ice") {
    p.paint.add(G.cone8, mat(tx, ty + 0.9, tz, 0.55, 1.6, 0.55, 0, Math.PI), PAINT.wood);
    p.paint.ball(PAINT.pink, [tx, ty + 2.0, tz], 0.75, G.ball);
    p.paint.ball(PAINT.cream, [tx, ty + 2.7, tz], 0.5, G.ball);
  } else if (kind === "pop") {
    p.paint.add(G.box, mat(tx, ty + 0.8, tz, 1.1, 1.4, 1.1, ry), PAINT.red);
    for (let i = 0; i < 4; i++) p.paint.ball(PAINT.cream, [tx + Math.cos(i * 1.7) * 0.35, ty + 1.6 + (i % 2) * 0.3, tz + Math.sin(i * 1.7) * 0.35], 0.42);
  } else if (kind === "candy") {
    p.paint.seg(PAINT.white, [tx, ty, tz], [tx, ty + 1.6, tz], 0.14, G.cyl6);
    p.paint.add(G.cyl12, mat(tx, ty + 2.1, tz, 0.95, 0.3, 0.95, ry, Math.PI / 2), PAINT.pink);
    p.paint.add(G.cyl12, mat(tx, ty + 2.1, tz, 0.55, 0.34, 0.55, ry, Math.PI / 2), PAINT.white);
  } else if (kind === "game") {
    p.paint.add(G.star, mat(tx, ty + 1.3, tz, 1.1, 1.1, 0.35, ry), PAINT.yellow);
    p.paint.add(G.star, mat(tx, ty + 1.3, tz, 1.1, 1.1, 0.35, ry + Math.PI / 2), PAINT.yellow);
  } else {
    p.paint.add(G.cup, mat(tx, ty + 0.85, tz, 0.6, 1.5, 0.6), PAINT.cyan);
    p.paint.seg(PAINT.pink, [tx, ty + 1.3, tz], [tx + 0.3, ty + 2.4, tz + 0.2], 0.14, G.cyl6);
  }
  // bulbs along the awning's front edge
  for (let i = 0; i <= 5; i++) {
    const q = f(-1.8 + i * 0.72, y0 + 2.92, 1.62);
    p.bulbs.add(q, 0.16, BULB_COLORS[(i + Math.round(x)) % 5], tAt(q[0], q[2]));
  }
}

/** A round ticket kiosk with a cone roof and a star. */
function kiosk(p: Parts, x: number, z: number, c: string) {
  const y0 = groundY(x, z);
  p.paint.cyl(PAINT.cream, [x, y0 + 0.6, z], 1.9, 1.2, G.cyl8);
  p.paint.cyl(c, [x, y0 + 1.9, z], 1.6, 1.4, G.cyl8);
  p.paint.cyl(PAINT.ink, [x, y0 + 1.95, z], 1.62, 0.6, G.cyl8);
  p.paint.cyl(PAINT.white, [x, y0 + 2.75, z], 1.75, 0.3, G.cyl8);
  p.paint.add(G.cone8, mat(x, y0 + 3.85, z, 2.3, 1.9, 2.3), PAINT.pink);
  p.paint.add(G.star, mat(x, y0 + 5.5, z, 0.8, 0.8, 0.3, Math.PI / 4), PAINT.yellow);
  p.bulbs.ring(x, y0 + 2.92, z, 2.0, 12, 0.16, BULB_COLORS, tAt(x, z), tAt(x, z) + 0.05);
}

/** A bench along local x. */
function bench(p: Parts, x: number, z: number, ry: number) {
  const y = groundY(x, z);
  p.paint.add(G.box, mat(x, y + 0.45, z, 2.2, 0.16, 0.6, ry), PAINT.wood);
  const f = frame(x, z, ry);
  const back = f(0, y + 0.85, -0.28);
  p.paint.add(G.box, mat(back[0], back[1], back[2], 2.2, 0.5, 0.12, ry), PAINT.wood);
  for (const s of [-0.9, 0.9]) {
    const q = f(s, y + 0.2, 0);
    p.paint.add(G.box, mat(q[0], q[1], q[2], 0.14, 0.4, 0.5, ry), PAINT.navy);
  }
}

/** A round planter with a tree. */
function planter(p: Parts, x: number, z: number, k: number) {
  const y = groundY(x, z);
  p.paint.cyl(PAINT.lilac, [x, y + 0.4, z], 1.7, 0.8, G.cyl12);
  p.paint.cyl(PAINT.trunk, [x, y + 0.82, z], 1.45, 0.06, G.cyl12);
  tree(p, x, z, 0.9, k);
}

// ---------- the north square ----------

function fountain(p: Parts) {
  const [x, z] = FOUNTAIN;
  const y = 0.27;
  // basin: outer wall, rim, inner wall, then water
  p.paint.revolve([x, y, z], [[7.6, 0], [7.6, 0.9], [6.7, 0.9], [6.7, 0.5]], 32, (s) => (s % 2 ? PAINT.white : PAINT.tile));
  p.paving.add(G.disc48, mat(x, y + 0.5, z, 6.7, 1, 6.7), "#7fd3ec");
  // tiers
  p.paint.cyl(PAINT.white, [x, y + 1.6, z], 1.0, 2.4, G.cyl12);
  p.paint.add(G.cup, mat(x, y + 3.1, z, 3.0, 0.7, 3.0), PAINT.cyan);
  p.paving.add(G.disc48, mat(x, y + 3.46, z, 2.8, 1, 2.8), "#a6e6f5");
  p.paint.cyl(PAINT.white, [x, y + 4.0, z], 0.45, 1.3, G.cyl8);
  p.paint.add(G.cup, mat(x, y + 4.7, z, 1.4, 0.45, 1.4), PAINT.pink);
  p.neon.ball(PAINT.cyan, [x, y + 5.4, z], 0.55, G.ball, tAt(x, z));
  p.bulbs.ring(x, y + 1.0, z, 7.6, 40, 0.18, [BULB_COLORS[1], BULB_COLORS[3]], tAt(x, z), tAt(x, z) + 0.06);
  p.pools.push({ x, z, r: 11, c: "#4fd8ff" });
  bench(p, x, z - 10.5, 0);
  bench(p, x, z + 10.5, Math.PI);
}

/** The little stage at the north end of the midway, facing south. */
function stage(p: Parts) {
  const [x, z] = STAGE;
  const y = 0.27;
  p.paint.add(G.box, mat(x, y + 0.5, z, 7, 1, 14), PAINT.navy);
  p.paint.add(G.box, mat(x, y + 1.02, z, 6.6, 0.06, 13.6), PAINT.wood);
  p.paint.add(G.box, mat(x - 3.6, y + 0.35, z, 0.8, 0.7, 4), PAINT.navy);
  p.paint.add(G.box, mat(x + 3.2, y + 3.6, z, 0.6, 6.2, 14), PAINT.lilac);
  // shell arch: rings of coloured slats over the stage
  const R = 7.2;
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI;
    const a1 = ((i + 1) / 9) * Math.PI;
    const col = [PAINT.pink, PAINT.white, PAINT.cyan][i % 3];
    const P = (a: number, r: number, dx: number): V3 => [x + dx, y + 1 + Math.sin(a) * r, z + Math.cos(a) * r];
    p.paint.quad(col, P(a0, R, -3.4), P(a1, R, -3.4), P(a1, R, 3.4), P(a0, R, 3.4), true);
    p.paint.quad(col, P(a0, R - 0.5, -3.6), P(a1, R - 0.5, -3.6), P(a1, R, -3.4), P(a0, R, -3.4), true);
  }
  const t = tAt(x, z);
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    p.bulbs.add([x - 3.75, y + 1 + Math.sin(a) * (R - 0.25), z + Math.cos(a) * (R - 0.25)], 0.22, BULB_COLORS[i % 5], t + (0.08 * i) / 18);
  }
  // neon star on the back wall
  const pts = starPoints(0.45).map(([a, b]) => [x + 2.85, y + 4.4 + b * 2.2, z + a * 2.2] as V3);
  for (let i = 0; i < pts.length; i++) p.neon.seg(PAINT.yellow, pts[i], pts[(i + 1) % pts.length], 0.26, G.cyl6, t + 0.1);
  p.pools.push({ x: x - 4, z, r: 9, c: "#ffd84a" });
}

/** The high striker: hit the pad, ring the bell. */
function striker(p: Parts, x: number, z: number) {
  const y = 0.27;
  p.paint.add(G.box, mat(x, y + 0.3, z, 2.2, 0.6, 2.2), PAINT.red);
  p.paint.add(G.box, mat(x, y + 5, z, 0.5, 9.4, 0.5), PAINT.white);
  for (let i = 0; i < 6; i++) p.paint.add(G.box, mat(x, y + 1.2 + i * 1.4, z, 0.56, 0.7, 0.56), [PAINT.cyan, PAINT.lilac, PAINT.pink, PAINT.orange, PAINT.yellow, PAINT.red][i]);
  p.paint.add(G.cup, mat(x, y + 10.1, z, 0.9, 0.8, 0.9, 0, Math.PI), PAINT.yellow);
  const t = tAt(x, z);
  for (let i = 0; i < 12; i++) p.bulbs.add([x + 0.4, y + 1 + i * 0.75, z + 0.4], 0.17, i % 2 ? BULB_COLORS[0] : BULB_COLORS[2], t + i * 0.01);
}

/** Giant lollipop on a stick. */
function lollipop(p: Parts, x: number, z: number, c: string, ry: number) {
  const y = groundY(x, z);
  p.paint.cyl(PAINT.navy, [x, y + 0.25, z], 0.8, 0.5, G.cyl8);
  p.paint.cyl(PAINT.white, [x, y + 2.9, z], 0.2, 5, G.cyl6);
  p.paint.add(G.cyl20, mat(x, y + 6.4, z, 2.0, 0.5, 2.0, ry, Math.PI / 2), c);
  p.paint.add(G.cyl20, mat(x, y + 6.4, z, 1.35, 0.56, 1.35, ry, Math.PI / 2), PAINT.white);
  p.paint.add(G.cyl20, mat(x, y + 6.4, z, 0.7, 0.62, 0.7, ry, Math.PI / 2), c);
}

/** A balloon seller's cart with a bunch of balloons. */
function balloons(p: Parts, x: number, z: number) {
  const y = groundY(x, z);
  p.paint.add(G.box, mat(x, y + 0.9, z, 1.6, 0.9, 1.0), PAINT.cyan);
  for (const s of [-0.6, 0.6]) p.paint.add(G.cyl12, mat(x + s, y + 0.4, z + 0.55, 0.4, 0.12, 0.4, 0, Math.PI / 2), PAINT.ink);
  const r = rng(7);
  for (let i = 0; i < 9; i++) {
    const b: V3 = [x + (r() - 0.5) * 2.4, y + 4.2 + r() * 1.6, z + (r() - 0.5) * 2.4];
    p.paint.seg(PAINT.white, [x, y + 1.4, z], b, 0.05);
    p.paint.ball(BULB_COLORS[i % 5], b, [0.55, 0.68, 0.55], G.ball);
  }
}

function umbrellaTable(p: Parts, x: number, z: number, c: string) {
  const y = 0.27;
  p.paint.cyl(PAINT.white, [x, y + 0.5, z], 0.12, 1, G.cyl6);
  p.paint.cyl(PAINT.white, [x, y + 1.02, z], 1.0, 0.1, G.cyl12);
  p.paint.cyl(PAINT.white, [x, y + 2.0, z], 0.08, 2.4, G.cyl6);
  p.paint.revolve([x, y + 2.9, z], [[2.3, 0], [0, 0.8]], 8, (s) => (s % 2 ? PAINT.white : c), true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    p.paint.cyl(c, [x + Math.cos(a) * 1.6, y + 0.3, z + Math.sin(a) * 1.6], 0.35, 0.6, G.cyl8);
  }
}

function square(p: Parts) {
  fountain(p);
  stage(p);
  const lite = p.lite;
  // game alley along the west edge, food along the east edge, sweets along the north edge
  const xs = lite ? [46, 58, 70] : [44, 51, 58, 65, 72];
  xs.forEach((x, i) => stall(p, x, SQUARE.z[0] + 3, 0, STALL_COLORS[i % 6], i % 2 ? "game" : "candy"));
  xs.forEach((x, i) => stall(p, x, SQUARE.z[1] - 3, Math.PI, STALL_COLORS[(i + 2) % 6], (["ice", "pop", "drink"] as Kind[])[i % 3]));
  for (const z of lite ? [-34, 34] : [-40, -30, 30, 40]) stall(p, SQUARE.x[1] - 3, z, -Math.PI / 2, STALL_COLORS[Math.abs(z / 10) % 6], z < 0 ? "candy" : "ice");
  striker(p, 82, -52);
  balloons(p, 50, -22);
  lollipop(p, SQUARE.x[0] + 2, -10, PAINT.pink, 0);
  lollipop(p, SQUARE.x[0] + 2, 10, PAINT.cyan, 0);
  // food court
  const tables: [number, number][] = lite
    ? [
        [50, 34],
        [62, 46],
        [74, 34],
      ]
    : [
        [48, 30],
        [48, 44],
        [60, 37],
        [60, 51],
        [72, 30],
        [72, 44],
        [82, 54],
      ];
  tables.forEach(([x, z], i) => umbrellaTable(p, x, z, STALL_COLORS[i % 6]));
  planter(p, 44, -14, 1);
  planter(p, 44, 14, 2);
  planter(p, 78, -14, 4);
  planter(p, 78, 14, 5);
  // bulb strings round the square, from the corner posts
  const cs: [number, number][] = [
    [SQUARE.x[0] + 1, SQUARE.z[0] + 7],
    [SQUARE.x[1] - 1, SQUARE.z[0] + 7],
    [SQUARE.x[1] - 1, SQUARE.z[1] - 7],
    [SQUARE.x[0] + 1, SQUARE.z[1] - 7],
  ];
  for (const [x, z] of cs) lamp(p, x, z, LAMP_H + 1.5, PAINT.navy, BULB_COLORS[1]);
  const fy = 0.27 + LAMP_H + 1.4;
  for (const [x, z] of cs) {
    // to the fountain's top
    bunting(p, [x, fy, z], [FOUNTAIN[0], 0.27 + 5.6, FOUNTAIN[1]], lite ? 10 : 18, 1.6, false);
  }
}

// ---------- midway and promenade ----------

function midway(p: Parts) {
  const lite = p.lite;
  const zs = [-MIDWAY_LAMPS_Z, MIDWAY_LAMPS_Z];
  const top = (x: number, z: number): V3 => [x, groundY(x, z) + LAMP_H + 0.1, z];
  for (const x of MIDWAY_LAMPS_X) for (const z of zs) lamp(p, x, z, groundY(x, z) + LAMP_H);
  for (let i = 0; i < MIDWAY_LAMPS_X.length - 1; i++) {
    const x0 = MIDWAY_LAMPS_X[i];
    const x1 = MIDWAY_LAMPS_X[i + 1];
    // criss-cross over the midway (not over the square's fountain), and along each side
    if (x1 <= SQUARE.x[0] + 6) {
      bunting(p, top(x0, -MIDWAY_LAMPS_Z), top(x1, MIDWAY_LAMPS_Z), lite ? 8 : 12, 1.1, !lite);
      bunting(p, top(x0, MIDWAY_LAMPS_Z), top(x1, -MIDWAY_LAMPS_Z), lite ? 8 : 12, 1.1, false);
    }
    if (!lite) for (const z of zs) bunting(p, top(x0, z), top(x1, z), 8, 0.7, true);
  }
  // promenade
  const pxs = [PROMENADE.x[0] - 0.8, PROMENADE.x[1] + 0.8];
  for (const z of PROM_LAMPS_Z) for (const x of pxs) lamp(p, x, z, LAMP_H, PAINT.navy, BULB_COLORS[(z / 12 + 10) % 5]);
  for (let i = 0; i < PROM_LAMPS_Z.length - 1; i++) {
    const z0 = PROM_LAMPS_Z[i];
    const z1 = PROM_LAMPS_Z[i + 1];
    if (z0 < 0 && z1 > 0) continue;
    bunting(p, top(pxs[0], z0), top(pxs[1], z1), lite ? 6 : 9, 0.8, !lite);
    bunting(p, top(pxs[1], z0), top(pxs[0], z1), lite ? 6 : 9, 0.8, false);
  }
  // stalls along the midway, both sides
  const west = [-70, -65, -50, -45, -8, -3, 2, 18, 23, 28];
  const east = [-70, -65, -50, -45, -40, -8, -3, 2, 20, 25, 30];
  const pick = (l: number[]) => (lite ? l.filter((_, i) => i % 2 === 0) : l);
  pick(west).forEach((x, i) => stall(p, x, -11.2, 0, STALL_COLORS[i % 6], KINDS[i % 5]));
  pick(east).forEach((x, i) => stall(p, x, 11.2, Math.PI, STALL_COLORS[(i + 3) % 6], KINDS[(i + 2) % 5]));
  kiosk(p, -75, -10, PAINT.cyan);
  kiosk(p, -75, 10, PAINT.pink);
  // benches along the promenade
  for (const z of [-56, -18, 18, 56]) {
    bench(p, PROMENADE.x[0] - 2.2, z, Math.PI / 2);
    bench(p, PROMENADE.x[1] + 2.2, z, -Math.PI / 2);
  }
  // pools of light along the midway
  for (let x = -60; x <= 30; x += 18) p.pools.push({ x, z: 0, r: 7, c: BULB_COLORS[(x / 18 + 10) % 5] });
}

/** The Starlight pole in the crossing: base and pole (the star on top turns; see power.tsx). */
export const POLE_H = 11.5;
function crossing(p: Parts) {
  const [x, z] = CROSSING;
  const y = 0.46;
  p.paint.cyl(PAINT.navy, [x, y + 0.5, z], 1.8, 1.0, G.cyl8);
  p.paint.cyl(PAINT.yellow, [x, y + 1.15, z], 1.3, 0.3, G.cyl8);
  p.paint.cyl(PAINT.white, [x, y + POLE_H / 2, z], 0.45, POLE_H, G.cyl8);
  for (let i = 0; i < 4; i++) p.paint.cyl(i % 2 ? PAINT.pink : PAINT.cyan, [x, y + 2.5 + i * 2.3, z], 0.52, 0.6, G.cyl8);
  // strings from the pole's top to the lamps round the crossing
  const top: V3 = [x, y + POLE_H - 0.3, z];
  const ends: V3[] = [
    [-30, groundY(-30, -MIDWAY_LAMPS_Z) + LAMP_H + 0.1, -MIDWAY_LAMPS_Z],
    [-30, groundY(-30, MIDWAY_LAMPS_Z) + LAMP_H + 0.1, MIDWAY_LAMPS_Z],
    [-18, groundY(-18, -MIDWAY_LAMPS_Z) + LAMP_H + 0.1, -MIDWAY_LAMPS_Z],
    [-18, groundY(-18, MIDWAY_LAMPS_Z) + LAMP_H + 0.1, MIDWAY_LAMPS_Z],
  ];
  for (const e of ends) bunting(p, top, e, p.lite ? 6 : 9, 0.5, !p.lite);
  p.pools.push({ x, z, r: CROSSING_R + 3, c: "#7ff6ff" });
}

// ---------- edges: hedges and trees ----------

/** Free lawn: not on a path, plaza, stall row, square or near the edge. */
function freeLawn(x: number, z: number, m: number) {
  const [X0, X1] = BOUNDS.x;
  const [Z0, Z1] = BOUNDS.z;
  if (x < X0 + 2 + m || x > X1 - 2 - m || z < Z0 + 1 + m || z > Z1 - 1 - m) return false;
  if (Math.abs(z) < 13 + m && x < SQUARE.x[0]) return false; // midway, its stalls and lamps
  if (x > PROMENADE.x[0] - 3 - m && x < PROMENADE.x[1] + 3 + m) return false;
  if (x > SQUARE.x[0] - 1 - m) return false;
  for (const [c, r] of [
    [TEACUPS, TEACUPS_R],
    [SWINGS, SWINGS_R],
    [DROP, DROP_R],
    [CROSSING, CROSSING_R],
  ] as const)
    if (Math.hypot(x - c[0], z - c[1]) < r + 1.5 + m) return false;
  if (Math.abs(x - BUMPER[0]) < BUMPER_HX + 5 + m && Math.abs(z - BUMPER[1]) < BUMPER_HZ + 5 + m) return false;
  // side paths to the rides
  for (const [px, pz] of [TEACUPS, BUMPER, SWINGS, DROP]) {
    if (Math.abs(x - px) < 3.5 + m && Math.abs(z) < Math.abs(pz)) return false;
    if (Math.abs(z - pz) < 3.5 + m && x > Math.min(px, PROMENADE.x[0]) && x < Math.max(px, PROMENADE.x[1])) return false;
  }
  if (Math.hypot(x - POWER_BOX[0], z - POWER_BOX[1]) < 4 + m) return false;
  // not on a cable
  for (const r of cableRoutes())
    for (let i = 0; i < r.length - 1; i++) {
      const [ax, az] = r[i];
      const dx = r[i + 1][0] - ax;
      const dz = r[i + 1][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 1 + m * 0.7) return false;
    }
  return true;
}

function greenery(p: Parts) {
  const [X0, X1] = BOUNDS.x;
  const [Z0, Z1] = BOUNDS.z;
  // hedges on the south (park) and north edges, open where the midway runs
  const hedge = (x: number, za: number, zb: number) => {
    for (let z = za; z < zb - 1; z += 6) {
      const z1 = Math.min(zb, z + 5);
      p.paint.add(G.box, mat(x, 0.65, (z + z1) / 2, 1.6, 1.3, z1 - z), PAINT.leafDark);
      p.paint.add(G.box, mat(x, 1.35, (z + z1) / 2, 1.2, 0.2, z1 - z - 0.4), PAINT.leaf);
    }
  };
  hedge(X0 + 1.4, Z0 + 1, -BOULEVARD.hw - 3);
  hedge(X0 + 1.4, BOULEVARD.hw + 3, Z1 - 1);
  hedge(X1 - 1.4, Z0 + 1, -BOULEVARD.hw - 3);
  hedge(X1 - 1.4, BOULEVARD.hw + 3, Z1 - 1);
  // trees on the free lawn
  const r = rng(42);
  const step = p.lite ? 11 : 7.5;
  let k = 0;
  for (let x = X0 + 4; x < X1 - 3; x += step) {
    for (let z = Z0 + 2.5; z < Z1 - 2; z += step) {
      const tx = x + (r() - 0.5) * step * 0.6;
      const tz = z + (r() - 0.5) * step * 0.6;
      const s = 0.85 + r() * 0.45;
      if (!freeLawn(tx, tz, 2.2 * s)) continue;
      tree(p, tx, tz, s, k++);
    }
  }
}

// ---------- power box and cables ----------

/** Where the cables leave the box, and their routes to the rides and the square. */
function cableRoutes(): [number, number][][] {
  const [bx, bz] = POWER_BOX;
  const rim = (c: readonly [number, number], r: number): [number, number] => {
    const dx = bx - c[0];
    const dz = bz - c[1];
    const l = Math.hypot(dx, dz);
    return [c[0] + (dx / l) * r, c[1] + (dz / l) * r];
  };
  return [
    [[bx - 0.6, bz - 1.3], rim(TEACUPS, TEACUPS_R - 4.5)],
    [[bx, bz + 1.4], [bx - 1, 12.5], [BUMPER[0] + BUMPER_HX + 1.5, BUMPER[1] - BUMPER_HZ + 2]],
    [[bx + 1.1, bz - 1], [-14, -18], rim(SWINGS, SWINGS_R - 4)],
    [[bx + 1.2, bz + 1], [-33, -8.4], [-12, -8.4], [-10, 14], rim(DROP, DROP_R - 5)],
    [[bx + 1.2, bz + 1], [-33, -8.4], [SQUARE.x[0] - 2, -8.4], [FOUNTAIN[0] - 7.6, -2.5]],
  ];
}

function powerBox(p: Parts) {
  const [x, z] = POWER_BOX;
  const y = groundY(x, z);
  p.paint.add(G.box, mat(x, y + 0.15, z, 3.4, 0.3, 2.6), "#a39bb3");
  p.paint.add(G.box, mat(x, y + 1.4, z, 2.2, 2.2, 1.5), PAINT.steel);
  p.paint.add(G.box, mat(x, y + 2.6, z, 2.6, 0.22, 1.9), PAINT.ink);
  for (let i = 0; i < 8; i++) p.paint.add(G.box, mat(x - 0.96 + i * 0.275, y + 0.55, z + 0.77, 0.275, 0.22, 0.04), i % 2 ? PAINT.ink : PAINT.yellow);
  for (let i = 0; i < 4; i++) p.paint.add(G.box, mat(x + 1.11, y + 1.3, z - 0.45 + i * 0.3, 0.04, 1.1, 0.12), PAINT.ink);
  // neon bolt on the door
  const bolt: V3[] = [
    [x + 0.15, y + 2.15, z + 0.78],
    [x - 0.25, y + 1.45, z + 0.78],
    [x + 0.15, y + 1.45, z + 0.78],
    [x - 0.2, y + 0.8, z + 0.78],
  ];
  for (let i = 0; i < 3; i++) p.neon.seg(PAINT.yellow, bolt[i], bolt[i + 1], 0.12, G.box, 0.03);
  // cables along the ground: the current runs out along them as the zone powers up
  for (const route of cableRoutes()) {
    let s = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i];
      const [bx2, bz2] = route[i + 1];
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const n = Math.max(1, Math.ceil(len / 1.8));
      for (let j = 0; j < n; j++) {
        const f0 = j / n;
        const f1 = (j + 1) / n;
        const a: [number, number] = [ax + (bx2 - ax) * f0, az + (bz2 - az) * f0];
        const b: [number, number] = [ax + (bx2 - ax) * f1, az + (bz2 - az) * f1];
        const ya = groundY(a[0], a[1]) + 0.1;
        const yb = groundY(b[0], b[1]) + 0.1;
        const yc = Math.max(ya, yb);
        p.neon.seg(PAINT.cyan, [a[0], yc, a[1]], [b[0], yc, b[1]], 0.36, G.box, 0.04 + (0.62 * (s + (f0 * len))) / 150, j);
      }
      s += len;
    }
  }
  p.pools.push({ x, z, r: 4.5, c: "#4fd8ff" });
}

export function bakeDecor(p: Parts) {
  midway(p);
  crossing(p);
  square(p);
  greenery(p);
  powerBox(p);
  // closed boards by each ride's entrance from the midway, and at the gate end
  p.boards.push({ x: -71, z: -4.6, ry: Math.PI / 2 });
  void DROP_R;
  void SWINGS_R;
}
