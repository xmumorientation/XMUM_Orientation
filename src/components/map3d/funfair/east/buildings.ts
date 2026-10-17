import { G, TAU, mat, type V3 } from "../central/kit";
import { S, bar, tube } from "../west/kit";
import { NEON, PAINT, bulbC } from "./kit";
import { ARCADE, ARCADE_RY, HAUNTED, HAUNTED_RY, HH_PLAZA, HH_PLAZA_R, PRIZE } from "./layout";
import { beads, commit, neonText, newLocal, placeM, tAt, type Parts } from "./parts";

// DRAFT: the East zone's two buildings. D2, the haunted house: a plum mansion
// with a steep slate roof and a tower, glowing boarded-up windows, three
// ghosts that glow once the power is on, pumpkins and a little graveyard, and
// the HAUNTED sign over its porch. D1, the arcade: a long cream hall behind a
// red marquee front with the ARCADE sign, bulbs and a gold crest, glowing game
// cabinets inside, and the prize stand beside it with shelves of plush prizes
// and a prize wheel on its roof. Each is built in its own frame (local +z its
// front) and moved into place.

/** The haunted house (16 x 10 m, the tower at its front left). */
export function bakeHaunted(p: Parts) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(HAUNTED[0], HAUNTED[1]);
  const zF = 4.5;
  fr.box(PAINT.stone, [0, 0.3, 0], [18, 0.6, 12]);
  fr.box(PAINT.plum, [0, 0.6 + 3.5, -0.5], [16, 7, 10]);
  fr.box(PAINT.cream, [0, 4.1, -0.5], [16.25, 0.25, 10.25]);
  fr.box(PAINT.cream, [0, 7.65, -0.5], [16.5, 0.3, 10.5]);
  // the roof: a steep gable along x
  const yE = 7.8;
  const yR = 12.6;
  const zf = zF + 0.8;
  const zb = -5.5 - 0.8;
  fr.quad(PAINT.slate, [-8.5, yE, zf], [8.5, yE, zf], [8.5, yR, -0.5], [-8.5, yR, -0.5], true);
  fr.quad(PAINT.slate, [8.5, yE, zb], [-8.5, yE, zb], [-8.5, yR, -0.5], [8.5, yR, -0.5], true);
  for (const x of [-8.3, 8.3]) fr.tri(PAINT.plumDark, [x, yE, zf - 0.6], [x, yR - 0.4, -0.5], [x, yE, zb + 0.6], true);
  for (const x of [-3, 3.5]) fr.box(PAINT.plumDark, [x, yR - 0.6, -2], [1.0, 3.2, 1.0]);
  // the tower with its spire
  const tx = -5.6;
  const tz = 3.2;
  fr.box(PAINT.plumDark, [tx, 0.6 + 7, tz], [4, 14, 4]);
  fr.box(PAINT.cream, [tx, 14.7, tz], [4.4, 0.3, 4.4]);
  fr.add(G.cone6, mat(tx, 14.85 + 3.2, tz, 3.2, 6.4, 3.2), PAINT.slate);
  fr.ball(PAINT.gold, [tx, 21.3, tz], 0.3);
  // windows: cream frames, glowing panes, boards across some
  const glow = [NEON.lilac, NEON.cyan, NEON.pink, NEON.lilac];
  const win = (x: number, y: number, z: number, k: number, boarded: boolean) => {
    fr.box(PAINT.cream, [x, y, z], [1.6, 2.0, 0.16]);
    li.add(G.box, mat(x, y, z + 0.1, 1.2, 1.6, 0.06), glow[k % 4], t + 0.03 + 0.01 * (k % 5), -30 - k);
    if (boarded) for (const s of [-1, 1]) fr.add(G.box, mat(x, y, z + 0.18, 1.7, 0.2, 0.06, 0, 0, s * 0.55), PAINT.woodDark);
  };
  let k = 0;
  for (const y of [2.5, 5.9]) for (const x of [-1.8, 4.2, 6.6]) if (!(y < 4 && x > 0 && x < 2.5)) win(x, y, zF + 0.02, k, k++ % 3 === 1);
  for (const y of [4.5, 8.5, 12]) win(tx, y, tz + 2.02, k, k++ % 2 === 0);
  // the door and the porch with the HAUNTED sign
  const dx = 1.4;
  fr.box(PAINT.redDeep, [dx, 0.6 + 1.4, zF + 0.1], [1.8, 2.8, 0.2]);
  fr.box(PAINT.slate, [dx, 3.75, zF + 1.25], [5.4, 0.3, 2.6]);
  for (const s of [-2.3, 2.3]) bar(fr, PAINT.cream, [dx + s, 0.6, zF + 2.3], [dx + s, 3.6, zF + 2.3], 0.12, S.tube6);
  fr.box(PAINT.plumDark, [dx, 4.75, zF + 2.2], [6.4, 1.5, 0.22]);
  neonText(li, "HAUNTED", 0.85, 4.33, zF + 2.36, 0.06, NEON.lilac, t + 0.02, 1000);
  beads(l.bulbs, [[-8, yE - 0.1, zf + 0.05], [8, yE - 0.1, zf + 0.05]], p.lite ? 1.6 : 0.9, 0.15, t + 0.04);
  // ghosts: they glow once the power is on
  for (const [gx, gy, gz] of [
    [3.2, 14.2, -0.5],
    [tx + 2.6, 18.5, tz + 1.5],
    [7.2, 9.8, zF + 1.4],
  ] as V3[]) {
    li.add(S.ball, mat(gx, gy, gz, 0.75), NEON.white, t + 0.08, -60);
    li.add(G.cone8, mat(gx, gy - 1.0, gz, 0.95, 1.9, 0.95), NEON.white, t + 0.08, -61);
    for (const s of [-0.25, 0.25]) li.add(G.ico, mat(gx + s, gy + 0.1, gz + 0.66, 0.12), "#141018", t + 0.08, -62);
  }
  // pumpkins along the front, a graveyard and two dead trees on the right
  for (let i = 0; i < 5; i++) li.add(G.ball, mat(-7 + i * 3.4 + (i > 2 ? 1 : 0), 0.95, zF + 1.6 + (i % 2) * 0.4, 0.42, 0.34, 0.42), NEON.orange, t + 0.02, -70 - i);
  for (let i = 0; i < 8; i++) {
    const gx = 10.5 + (i % 2) * 2.4;
    const gz = -4 + Math.floor(i / 2) * 2.6;
    fr.box(PAINT.stone, [gx, 0.6, gz], [0.9, 1.2, 0.25]);
    fr.add(S.cyl12, mat(gx, 1.2, gz, 0.45, 0.25, 0.45, 0, Math.PI / 2), PAINT.stone);
  }
  for (let i = 0; i <= 7; i++) bar(fr, PAINT.iron, [9.3, 0, -5.5 + i * 1.6], [9.3, 1.3, -5.5 + i * 1.6], 0.05, S.tube4);
  bar(fr, PAINT.iron, [9.3, 1.1, -5.5], [9.3, 1.1, 5.7], 0.05, S.tube4);
  for (const [bx, bz] of [
    [14.5, -5.5],
    [15.5, 4],
  ]) {
    bar(fr, PAINT.woodDark, [bx, 0, bz], [bx, 4.5, bz], 0.22, S.tube6);
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + bx;
      bar(fr, PAINT.woodDark, [bx, 2.8 + j * 0.6, bz], [bx + Math.cos(a) * 1.8, 4.2 + j * 0.5, bz + Math.sin(a) * 1.8], 0.09, S.tube4);
    }
  }
  commit(p, l, placeM(HAUNTED[0], HAUNTED[1], HAUNTED_RY));
  // the board faces the Ghost Lane; a lilac pool on the plaza
  p.boards.push({ x: HH_PLAZA[0] + 2.5, z: HH_PLAZA[1] - 4, ry: 0.82 });
  p.pools.push({ x: HH_PLAZA[0], z: HH_PLAZA[1], r: HH_PLAZA_R + 6, c: NEON.lilac });
}

/** The arcade (22 x 10 m, open front) and the prize stand. */
export function bakeArcade(p: Parts) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(ARCADE[0], ARCADE[1]);
  const W = 22;
  const D = 10;
  const H = 5;
  const y0 = 0.4;
  fr.box(PAINT.stone, [0, 0.2, 0], [W + 0.6, 0.4, D + 0.6]);
  fr.box(PAINT.redDeep, [0, 0.5, 0], [W - 0.8, 0.2, D - 0.8]);
  fr.box(PAINT.cream, [0, y0 + H / 2, -D / 2 + 0.2], [W, H, 0.4]);
  for (const sx of [-1, 1]) fr.box(PAINT.cream, [sx * (W / 2 - 0.2), y0 + H / 2, 0], [0.4, H, D]);
  fr.box(PAINT.cream, [0, y0 + H + 0.2, 0], [W + 0.4, 0.4, D + 0.4]);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) fr.box(PAINT.red, [sx * (W / 2 + 0.06), y0 + H / 2, -D / 2 + 1 + i * 2], [0.12, H, 1.0]);
  fr.box(PAINT.navy, [0, y0 + 2.4, -D / 2 + 0.45], [W - 1, 4.6, 0.1]);
  for (const x of [-10.8, -3.7, 3.7, 10.8]) {
    fr.box(PAINT.cream, [x, y0 + H / 2, D / 2 - 0.3], [0.9, H, 0.9]);
    fr.box(PAINT.red, [x, y0 + H / 2, D / 2 - 0.3], [0.95, 1.2, 0.95]);
  }
  // game cabinets with glowing screens
  const screens = [NEON.cyan, NEON.pink, NEON.yellow, NEON.lilac];
  for (let i = 0; i < 7; i++) {
    const x = -8.4 + i * 2.8;
    fr.box([PAINT.red, PAINT.teal, PAINT.navy][i % 3], [x, y0 + 1.1, -D / 2 + 1.3], [1.3, 2.0, 1.0]);
    li.add(G.box, mat(x, y0 + 1.55, -D / 2 + 1.82, 0.95, 0.7, 0.06), screens[i % 4], t + 0.01 * i, -20 - i);
  }
  for (let i = 0; i < 4; i++) {
    const x = -6 + i * 4;
    fr.box([PAINT.teal, PAINT.red][i % 2], [x, y0 + 1.1, 0.6], [1.3, 2.0, 1.0]);
    li.add(G.box, mat(x, y0 + 1.55, 1.12, 0.95, 0.7, 0.06), screens[(i + 1) % 4], t + 0.02, -40 - i);
  }
  // the striped awning
  for (let i = 0; i < 22; i++) {
    const x0 = -W / 2 + i;
    fr.quad(i % 2 ? PAINT.cream : PAINT.red, [x0, y0 + 4.0, D / 2 + 2.2], [x0 + 1, y0 + 4.0, D / 2 + 2.2], [x0 + 1, y0 + 4.7, D / 2 + 0.2], [x0, y0 + 4.7, D / 2 + 0.2], true);
  }
  beads(l.bulbs, [[-W / 2, y0 + 3.92, D / 2 + 2.25], [W / 2, y0 + 3.92, D / 2 + 2.25]], p.lite ? 1.6 : 0.8, 0.15, t + 0.02);
  // the marquee front: a red board with gold trim and a gold crest, the ARCADE sign and bulbs round it
  const by = y0 + H + 1.9;
  fr.box(PAINT.red, [0, by, D / 2 - 0.1], [W, 3.0, 0.4]);
  fr.box(PAINT.gold, [0, by - 1.55, D / 2 - 0.1], [W + 0.3, 0.2, 0.5]);
  fr.box(PAINT.gold, [0, by + 1.55, D / 2 - 0.1], [W + 0.3, 0.2, 0.5]);
  fr.add(S.cyl32, mat(0, by + 1.5, D / 2 - 0.45, 3.4, 0.3, 3.4, 0, Math.PI / 2), PAINT.gold);
  fr.add(G.star, mat(0, by + 5.4, D / 2 - 0.45, 1.1, 1.1, 0.35), PAINT.yellow);
  neonText(li, "ARCADE", 1.8, by - 0.9, D / 2 + 0.17, 0.11, NEON.yellow, t, 700);
  const rect: V3[] = [
    [-W / 2 + 0.3, by - 1.25, D / 2 + 0.14],
    [W / 2 - 0.3, by - 1.25, D / 2 + 0.14],
    [W / 2 - 0.3, by + 1.25, D / 2 + 0.14],
    [-W / 2 + 0.3, by + 1.25, D / 2 + 0.14],
    [-W / 2 + 0.3, by - 1.25, D / 2 + 0.14],
  ];
  beads(l.bulbs, rect, p.lite ? 1.5 : 0.8, 0.15, (f) => t + 0.05 * f);
  const arc: V3[] = Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI;
    return [Math.cos(a) * 3.15, by + 1.5 + Math.sin(a) * 3.15, D / 2 - 0.2] as V3;
  });
  beads(l.bulbs, arc, p.lite ? 1.2 : 0.65, 0.15, t + 0.06);
  commit(p, l, placeM(ARCADE[0], ARCADE[1], ARCADE_RY));
  p.boards.push({ x: ARCADE[0] + 9, z: ARCADE[1] - 3, ry: 0 });
  p.pools.push({ x: ARCADE[0] + 9, z: ARCADE[1], r: 15, c: NEON.yellow });
  prizeStand(p);
}

/** The prize stand: a red booth with shelves of plush prizes and a prize wheel on its roof. */
function prizeStand(p: Parts) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(PRIZE[0], PRIZE[1]);
  fr.box(PAINT.red, [0, 1.7, -1.4], [7, 3.4, 0.3]);
  for (const sx of [-3.4, 3.4]) fr.box(PAINT.red, [sx, 1.7, 0], [0.25, 3.4, 3.0]);
  fr.box(PAINT.cream, [0, 0.55, 1.2], [7, 1.1, 0.8]);
  for (let i = 0; i < 7; i++) fr.box(PAINT.red, [-3 + i, 0.55, 1.62], [0.5, 1.1, 0.06]);
  const plush = [PAINT.pink, PAINT.cyan, PAINT.lilac, PAINT.yellow, PAINT.orange];
  for (let s = 0; s < 3; s++) {
    const y = 1.4 + s * 0.65;
    fr.box(PAINT.wood, [0, y, -1.0], [6.4, 0.1, 0.6]);
    for (let i = 0; i < (p.lite ? 5 : 10); i++) fr.ball(plush[(i + s) % 5], [-2.9 + i * (p.lite ? 1.4 : 0.65), y + 0.28, -1.0], 0.26, G.ball);
  }
  // the roof: red and cream stripes sloping to the front, bulbs along its edge
  for (let i = 0; i < 8; i++) {
    const x0 = -3.6 + i * 0.9;
    fr.quad(i % 2 ? PAINT.cream : PAINT.red, [x0, 3.1, 1.9], [x0 + 0.9, 3.1, 1.9], [x0 + 0.9, 3.7, -1.6], [x0, 3.7, -1.6], true);
  }
  beads(l.bulbs, [[-3.6, 3.02, 1.95], [3.6, 3.02, 1.95]], p.lite ? 1.2 : 0.6, 0.14, t + 0.02);
  // the prize wheel: twelve wedges, a gold rim with bulbs, a pointer
  const c: V3 = [0, 6.3, -0.6];
  const R = 2.3;
  bar(fr, PAINT.gold, [0, 3.6, -0.75], [0, c[1], -0.75], 0.14, S.tube6);
  const wedges = [PAINT.red, PAINT.cream, PAINT.yellow, PAINT.teal, PAINT.pink, PAINT.cream];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const b = ((i + 1) / 12) * TAU;
    fr.tri(wedges[i % 6], c, [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2]], [c[0] + Math.cos(b) * R, c[1] + Math.sin(b) * R, c[2]], true);
  }
  fr.add(G.torus, mat(c[0], c[1], c[2], R, R, R, 0, Math.PI / 2), PAINT.gold);
  fr.add(S.cyl12, mat(c[0], c[1], c[2] + 0.1, 0.3, 0.3, 0.3, 0, Math.PI / 2), PAINT.gold);
  fr.tri(PAINT.gold, [c[0] - 0.3, c[1] + R + 0.6, c[2] + 0.1], [c[0] + 0.3, c[1] + R + 0.6, c[2] + 0.1], [c[0], c[1] + R - 0.2, c[2] + 0.1], true);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    li.add(S.bulb, mat(c[0] + Math.cos(a) * (R + 0.05), c[1] + Math.sin(a) * (R + 0.05), c[2] + 0.12, 0.13), bulbC(i), t + 0.03, i);
  }
  tube(li, [[-3.5, 3.4, 1.98], [3.5, 3.4, 1.98]], 0.06, NEON.yellow, t + 0.01, 3, false, false, S.tube4);
  commit(p, l, placeM(PRIZE[0], PRIZE[1], ARCADE_RY));
}
