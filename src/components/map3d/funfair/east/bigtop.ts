import { G, TAU, mat, type V3 } from "../central/kit";
import { S, bar, tube } from "../west/kit";
import { NEON, PAINT, bulbC } from "./kit";
import { BIGTOP, BT_A, BT_B, BT_RY, btPoint } from "./layout";
import { beads, commit, neonText, newLocal, placeM, tAt, type Parts } from "./parts";

// DRAFT: Canteen D6, the Big Top (ported from style B bench, in git history at 4eee382): a red
// and cream striped tent on the canteen's oval, its roof hung from two king
// poles, a teal skirt, a scalloped valance with a bulb at every tip, bulbs
// down every other roof seam, flags on the king poles and round the wall with
// bulb garlands up to the poles, and the door with its BIG TOP sign facing the
// hub. Built in the tent's frame (u along its long axis = local x, v = local z,
// the door at +z) and moved into place.

const WALL = 6.5;
const POLE = 9;
const PEAK = 24;

/** A point of the roof: angle th round the oval, s from the eave (0) to the ridge between the king poles (1). */
function roof(th: number, s: number): V3 {
  const ex = BT_A * Math.cos(th);
  const ez = BT_B * Math.sin(th);
  const ix = POLE * Math.cos(th);
  const iz = 1.2 * Math.sin(th);
  const u = Math.cos(th);
  const ridge = PEAK - 1.8 * (1 - u * u);
  return [ex + (ix - ex) * s, WALL + (ridge - WALL) * Math.pow(s, 1.7), ez + (iz - ez) * s];
}

const edge = (a: number, y: number, sc = 1): V3 => [BT_A * sc * Math.cos(a), y, BT_B * sc * Math.sin(a)];

export function bakeBigTop(p: Parts) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const door = btPoint(0, BT_B + 2);
  const t0 = tAt(door[0], door[1]);
  // the lights run from the door round both sides of the tent, then up its roof
  const away = (a: number) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) / Math.PI;
  const N = 48;
  const RINGS = p.lite ? 6 : 9;
  const th = (i: number) => (i / N) * TAU;
  for (let i = 0; i < N; i++) {
    const a = th(i);
    const b = th(i + 1);
    const stripe = i % 2 ? PAINT.cream : PAINT.red;
    for (let j = 0; j < RINGS; j++) {
      const s0 = j / RINGS;
      const s1 = (j + 1) / RINGS;
      fr.quad(stripe, roof(a, s0), roof(a, s1), roof(b, s1), roof(b, s0));
    }
    fr.tri(PAINT.red, roof(a, 1), [0, PEAK - 1.8, 0], roof(b, 1));
    fr.quad(stripe, edge(a, 1.3), edge(a, WALL), edge(b, WALL), edge(b, 1.3));
    fr.quad(PAINT.teal, edge(a, 0), edge(a, 1.3), edge(b, 1.3), edge(b, 0));
  }
  // a gold band over the skirt
  for (let i = 0; i < N; i++) fr.quad(PAINT.gold, edge(th(i), 1.25, 1.004), edge(th(i), 1.55, 1.004), edge(th(i + 1), 1.55, 1.004), edge(th(i + 1), 1.25, 1.004));
  // scalloped valance, with a bulb at every tip, and a yellow neon line along the eave
  const NV = p.lite ? 48 : 96;
  for (let i = 0; i < NV; i++) {
    const a = (i / NV) * TAU;
    const b = ((i + 1) / NV) * TAU;
    const tip = edge((a + b) / 2, WALL - 1.0, 1.012);
    fr.tri(i % 2 ? PAINT.yellow : PAINT.red, edge(a, WALL + 0.1, 1.012), edge(b, WALL + 0.1, 1.012), tip);
    l.bulbs.add([tip[0], tip[1] - 0.15, tip[2]], 0.17, bulbC(i), t0 + 0.05 * away(a));
  }
  const eave = Array.from({ length: NV }, (_, i) => edge((i / NV) * TAU, WALL + 0.14, 1.016));
  tube(li, eave, 0.11, NEON.yellow, (i) => t0 + 0.05 * away((i / NV) * TAU), 0, true);
  // king poles with yellow caps, gold balls and big flags
  for (const sx of [-1, 1]) {
    const x = sx * POLE;
    bar(fr, PAINT.cream, [x, PEAK - 2, 0], [x, PEAK + 3.6, 0], 0.24, S.tube8);
    fr.add(G.cone12, mat(x, PEAK + 0.5, 0, 1.7, 1.6, 1.7), PAINT.yellow);
    fr.ball(PAINT.gold, [x, PEAK + 3.85, 0], 0.38);
    fr.tri(sx < 0 ? PAINT.yellow : PAINT.red, [x, PEAK + 3.5, 0], [x, PEAK + 1.7, 0], [x, PEAK + 2.5, 3.8], true);
    l.bulbs.add([x, PEAK + 4.4, 0], 0.32, NEON.yellow, t0 + 0.22);
  }
  // flag poles round the wall, with bulb garlands up to the king poles
  const NF = 12;
  const flagC = [PAINT.pink, PAINT.cyan, PAINT.yellow, PAINT.orange, PAINT.lilac];
  for (let i = 0; i < NF; i++) {
    const a = ((i + 0.5) / NF) * TAU;
    const base = edge(a, 0, 1.06);
    const top: V3 = [base[0], 10, base[2]];
    bar(fr, PAINT.cream, base, top, 0.13, S.tube6);
    fr.ball(PAINT.gold, [top[0], 10.2, top[2]], 0.22);
    const dx = -Math.sin(a);
    const dz = Math.cos(a);
    fr.tri(flagC[i % 5], top, [top[0], 8.9, top[2]], [top[0] + dx * 2.2, 9.4, top[2] + dz * 2.2], true);
    const king: V3 = [Math.sign(Math.cos(a)) * POLE, PEAK + 3, 0];
    const pts: V3[] = [];
    for (let k = 0; k <= 16; k++) {
      const f = k / 16;
      pts.push([top[0] + (king[0] - top[0]) * f, top[1] - 0.2 + (king[1] - top[1] + 0.2) * f - 2.2 * 4 * f * (1 - f), top[2] + (king[2] - top[2]) * f]);
    }
    const ta = t0 + 0.06 * away(a) + 0.1;
    beads(l.bulbs, pts.slice(1, -1), p.lite ? 2.6 : 1.7, 0.17, (f) => ta + 0.1 * f, i * 3);
  }
  // bulbs down every other roof seam
  for (let i = 0; i < N; i += 2) {
    for (let j = 0; j < 10; j++) {
      const q = roof(th(i), 0.08 + j * 0.088);
      l.bulbs.add([q[0], q[1] + 0.22, q[2]], 0.18, j === 4 ? bulbC(3 + 4 * (i / 2)) : NEON.warm, t0 + 0.06 * away(th(i)) + 0.012 * j + 0.04);
    }
  }

  // the door (+z): a dark opening, cream posts with gold caps, the red sign board, a striped awning
  const z = BT_B;
  fr.box(PAINT.black, [0, 3, z - 0.4], [7.2, 6, 2.2]);
  for (const x of [-4.3, 4.3]) {
    fr.box(PAINT.cream, [x, 3.7, z + 2.6], [1.0, 7.4, 1.0]);
    fr.box(PAINT.gold, [x, 7.5, z + 2.6], [1.3, 0.4, 1.3]);
    fr.box(PAINT.red, [x, 0.3, z + 2.6], [1.2, 0.6, 1.2]);
    beads(l.bulbs, [[x, 0.9, z + 3.15], [x, 7.1, z + 3.15]], 0.55, 0.14, t0 - 0.02);
  }
  fr.box(PAINT.red, [0, 8.6, z + 2.6], [10.4, 2.0, 0.8]);
  fr.box(PAINT.gold, [0, 7.55, z + 2.6], [10.6, 0.25, 0.9]);
  fr.box(PAINT.gold, [0, 9.65, z + 2.6], [10.6, 0.25, 0.9]);
  for (let i = 0; i < 10; i++) {
    const x0 = -4.8 + i * 0.96;
    const x1 = x0 + 0.96;
    fr.quad(i % 2 ? PAINT.cream : PAINT.teal, [x0, 6.7, z - 0.2], [x0, 7.4, z + 2.2], [x1, 7.4, z + 2.2], [x1, 6.7, z - 0.2], true);
  }
  neonText(li, "BIG TOP", 1.15, 8.0, z + 3.06, 0.08, NEON.yellow, t0 - 0.03, 500);
  beads(l.bulbs, [[-5.1, 9.9, z + 3.05], [5.1, 9.9, z + 3.05]], 0.55, 0.14, t0 - 0.02);

  commit(p, l, placeM(BIGTOP[0], BIGTOP[1], BT_RY));

  // a CLOSED board at the door, a warm pool at the door and a soft one round the tent
  const bd = btPoint(-7.5, BT_B + 6);
  p.boards.push({ x: bd[0], z: bd[1], ry: BT_RY - Math.PI / 2 });
  p.pools.push({ x: door[0], z: door[1], r: 12, c: NEON.warm });
  p.pools.push({ x: BIGTOP[0], z: BIGTOP[1], r: 44, c: "#ffb36b" });
}
