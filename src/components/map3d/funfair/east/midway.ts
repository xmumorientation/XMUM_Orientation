import { G, TAU, mat, rng, type V3 } from "../central/kit";
import { S, bar, circlePts, tube } from "../west/kit";
import { NEON, PAINT, bulbC, MARQUEE } from "./kit";
import { beads, commit, neonText, newLocal, placeM, tAt, type Parts } from "./parts";

// DRAFT: the East zone's midway pieces that aren't rides (E2, Ben 2026-10-17): the VORTEX Diner, the game booths
// and the high striker of the games alley, snack carts, flower beds, the bandstand, the circus ring's bleachers and
// pedestal, the fortune teller's tent, the hall of mirrors, the entrance arch, the ticket booth, the restrooms and
// first aid. Each is built in its own frame (local +z its front, metres) and committed at (x, z) turned ry, like the
// arcade; decor.ts places them. They light up with the zone (tAt) like everything else.

const FLOWERS = [PAINT.pink, PAINT.yellow, PAINT.red, PAINT.white, PAINT.lilac, PAINT.orange];

/** The VORTEX Diner: a streamlined diner, red below and cream above, a glowing window band, the sign on its roof. */
export function diner(p: Parts, x: number, z: number, ry: number, w: number, d: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  const L = w - d;
  const R = d / 2;
  const ends = (c: string, y: number, h: number, r: number, light = false, k = 0) => {
    for (const sx of [-1, 1]) {
      if (light) li.add(G.cyl20, mat(sx * (L / 2), y, 0, r, h, r), c, t, -30 - k);
      else fr.add(G.cyl20, mat(sx * (L / 2), y, 0, r, h, r), c);
    }
  };
  fr.box(PAINT.stone, [0, 0.2, 0], [L, 0.4, d + 0.8]);
  ends(PAINT.stone, 0.2, 0.4, R + 0.4);
  // red below, chrome lines, the window band, cream above, the roof's gold trim
  fr.box(PAINT.red, [0, 1.35, 0], [L, 1.9, d]);
  ends(PAINT.red, 1.35, 1.9, R);
  for (const y of [2.32, 3.76]) {
    fr.box(PAINT.white, [0, y, 0], [L, 0.12, d + 0.06]);
    ends(PAINT.white, y, 0.12, R + 0.03);
  }
  li.add(G.box, mat(0, 3.04, 0, L, 1.32, d - 0.1), "#ffe6b8", t, -30);
  ends("#ffe6b8", 3.04, 1.32, R - 0.05, true, 1);
  for (let mx = -L / 2; mx <= L / 2 + 0.01; mx += 2) {
    for (const sz of [-1, 1]) fr.box(PAINT.cream, [mx, 3.04, sz * (d / 2)], [0.18, 1.32, 0.14]);
  }
  fr.box(PAINT.cream, [0, 4.31, 0], [L, 0.98, d]);
  ends(PAINT.cream, 4.31, 0.98, R);
  fr.box(PAINT.red, [0, 4.31, d / 2 + 0.02], [L, 0.22, 0.04]);
  fr.box(PAINT.gold, [0, 4.87, 0], [L, 0.14, d + 0.3]);
  ends(PAINT.gold, 4.87, 0.14, R + 0.15);
  // the door under a striped canopy, a warm window in it
  fr.box(PAINT.navy, [0, 1.5, d / 2 + 0.04], [2.0, 2.2, 0.08]);
  li.add(G.box, mat(0, 1.95, d / 2 + 0.09, 1.2, 0.6, 0.04), NEON.warm, t, -32);
  for (let i = 0; i < 6; i++) {
    const u0 = -1.6 + (3.2 * i) / 6;
    const u1 = -1.6 + (3.2 * (i + 1)) / 6;
    fr.quad(i % 2 ? PAINT.cream : PAINT.red, [u0, 2.75, d / 2 + 2.2], [u1, 2.75, d / 2 + 2.2], [u1, 3.05, d / 2], [u0, 3.05, d / 2], true);
  }
  // pink neon along the roof's front edge, bulbs under it
  tube(li, [[-L / 2, 4.97, d / 2 + 0.18], [L / 2, 4.97, d / 2 + 0.18]], 0.06, NEON.pink, t, 40, false, false, S.tube4);
  beads(l.bulbs, [[-L / 2, 4.72, d / 2 + 0.25], [L / 2, 4.72, d / 2 + 0.25]], p.lite ? 1.4 : 0.7, 0.13, t);
  // the sign on the roof
  for (const sx of [-5, 5]) bar(fr, PAINT.gold, [sx, 4.95, 0.6], [sx, 5.6, 0.6], 0.12, S.tube6);
  fr.box(PAINT.red, [0, 6.7, 0.6], [14.2, 2.2, 0.3]);
  for (const y of [5.6, 7.8]) fr.box(PAINT.gold, [0, y, 0.6], [14.4, 0.18, 0.4]);
  neonText(li, "VORTEX DINER", 1.25, 6.05, 0.78, 0.08, NEON.yellow, t - 0.01, 900);
  beads(l.bulbs, [[-7.1, 7.95, 0.8], [7.1, 7.95, 0.8]], p.lite ? 1.1 : 0.55, 0.13, t);
  // a giant soda cup on the roof's east end
  fr.add(G.cup, mat(L / 2 - 0.5, 5.9, -1.6, 0.9, 2.0, 0.9), PAINT.cyan);
  fr.cyl(PAINT.white, [L / 2 - 0.5, 6.95, -1.6], 0.95, 0.15, G.cyl12);
  bar(fr, PAINT.red, [L / 2 - 0.5, 6.8, -1.6], [L / 2 - 0.1, 8.1, -1.3], 0.12, S.tube6);
  commit(p, l, placeM(x, z, ry));
}

/** What a game booth holds. */
export type Game = "rings" | "darts" | "ducks" | "hoops";

/** A game booth 4.2 m wide: painted walls, a cream counter (front, +z), a striped awning, a glowing sign, the game. */
export function gameBooth(p: Parts, x: number, z: number, ry: number, kind: Game, [paint, neon]: [string, string]) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  const W = 4.2;
  const D = 3.2;
  fr.box(PAINT.deck, [0, 0.08, 0], [W, 0.16, D]);
  fr.box(paint, [0, 1.6, -D / 2 + 0.1], [W, 3.2, 0.2]);
  for (const sx of [-1, 1]) fr.box(paint, [sx * (W / 2 - 0.1), 1.6, 0], [0.2, 3.2, D]);
  fr.box(PAINT.cream, [0, 0.55, D / 2 - 0.3], [W - 0.4, 1.1, 0.5]);
  fr.box(PAINT.gold, [0, 1.13, D / 2 - 0.3], [W - 0.3, 0.08, 0.6]);
  for (let i = 0; i < 6; i++) {
    const u0 = -W / 2 + (W * i) / 6;
    const u1 = -W / 2 + (W * (i + 1)) / 6;
    fr.quad(i % 2 ? PAINT.cream : PAINT.red, [u0, 3.0, D / 2 + 1.0], [u1, 3.0, D / 2 + 1.0], [u1, 3.4, -D / 2], [u0, 3.4, -D / 2], true);
  }
  fr.box(PAINT.gold, [0, 3.95, D / 2 + 0.6], [3.2, 0.8, 0.22]);
  li.add(G.box, mat(0, 3.95, D / 2 + 0.73, 2.8, 0.5, 0.06), neon, t + 0.02, -13);
  beads(l.bulbs, [[-W / 2, 2.92, D / 2 + 1.05], [W / 2, 2.92, D / 2 + 1.05]], p.lite ? 1.4 : 0.7, 0.13, t + 0.02);
  const back = -D / 2 + 0.32;
  if (kind === "rings") {
    // bottles on three shelves, rings on the counter
    for (let i = 0; i < 3; i++) {
      const y = 1.3 + i * 0.55;
      fr.box(PAINT.wood, [0, y, back + 0.1], [W - 0.6, 0.08, 0.5]);
      const n = p.lite ? 4 : 7;
      for (let j = 0; j < n; j++) fr.add(G.cyl6, mat(-1.5 + (j * 3) / (n - 1), y + 0.22, back + 0.1, 0.09, 0.36, 0.09), j % 2 ? "#3f9a5a" : "#2f7d8c");
    }
    for (let k = 0; k < 3; k++) fr.add(G.torus, mat(-0.8 + k * 0.8, 1.2, D / 2 - 0.3, 0.32, 0.32, 0.32), [PAINT.yellow, PAINT.pink, PAINT.cyan][k]);
  } else if (kind === "darts") {
    // a board of balloons
    fr.box(PAINT.cream, [0, 1.9, back], [W - 0.6, 2.0, 0.06]);
    const cols = p.lite ? 4 : 6;
    const rows = p.lite ? 2 : 3;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) fr.ball(FLOWERS[(i + j * 2) % FLOWERS.length], [-1.4 + (i * 2.8) / (cols - 1), 1.3 + j * 0.55, back + 0.18], 0.19, G.ico);
    }
  } else if (kind === "ducks") {
    // a trough of water with ducks, plush prizes on the back wall
    fr.box(PAINT.teal, [0, 0.75, 0.1], [W - 0.7, 0.5, 1.0]);
    fr.box("#7fd3f0", [0, 1.01, 0.1], [W - 0.9, 0.04, 0.85]);
    const n = p.lite ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const dx = -1.3 + (i * 2.6) / (n - 1);
      fr.ball(PAINT.yellow, [dx, 1.15, 0.1], 0.16, G.ico);
      fr.add(G.cone6, mat(dx + 0.18, 1.17, 0.1, 0.06, 0.14, 0.06, 0, 0, -Math.PI / 2), PAINT.orange);
    }
    fr.box(PAINT.wood, [0, 2.2, back + 0.1], [W - 0.6, 0.08, 0.5]);
    for (let i = 0; i < (p.lite ? 3 : 6); i++) fr.ball(FLOWERS[(i + 1) % FLOWERS.length], [-1.5 + i * 0.6, 2.45, back + 0.1], 0.24, G.ico);
  } else {
    // a basketball hoop on the back wall, balls on the counter
    fr.box(PAINT.white, [0, 2.4, back], [1.4, 1.0, 0.08]);
    fr.box(PAINT.red, [0, 2.25, back + 0.05], [0.5, 0.36, 0.02]);
    fr.add(G.torus, mat(0, 2.0, back + 0.4, 0.3, 0.3, 0.3), PAINT.orange);
    fr.add(G.cone8, mat(0, 1.8, back + 0.4, 0.27, 0.38, 0.27, 0, Math.PI), PAINT.white);
    for (let k = 0; k < 3; k++) fr.ball(PAINT.orange, [-0.8 + k * 0.8, 1.32, D / 2 - 0.3], 0.18, G.ico);
  }
  commit(p, l, placeM(x, z, ry));
}

/** The high striker: a tower with a light scale that runs up it as the zone powers on, a gold bell, a hammer. */
export function highStriker(p: Parts, x: number, z: number, y0: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  fr.box(PAINT.red, [0, y0 + 0.25, 0], [1.6, 0.5, 1.6]);
  fr.cyl(PAINT.gold, [0, y0 + 0.56, 0.95], 0.45, 0.12, G.cyl12);
  fr.box(PAINT.cream, [0, y0 + 4.6, -0.3], [0.9, 8.2, 0.25]);
  fr.box(PAINT.redDeep, [0, y0 + 4.6, -0.15], [0.22, 8.0, 0.1]);
  const scale = [NEON.cyan, NEON.cyan, NEON.cyan, NEON.yellow, NEON.yellow, NEON.yellow, NEON.orange, NEON.orange, NEON.pink, NEON.pink];
  scale.forEach((c, i) => li.add(G.box, mat(0, y0 + 1.1 + i * 0.8, -0.13, 0.62, 0.6, 0.05), c, t + i * 0.012, -50 - i));
  fr.box(PAINT.black, [0, y0 + 1.7, -0.06], [0.3, 0.2, 0.14]);
  fr.add(G.cone12, mat(0, y0 + 9.0, -0.2, 0.45, 0.55, 0.45), PAINT.gold);
  fr.add(G.star, mat(0, y0 + 9.9, -0.25, 0.55, 0.55, 0.15), PAINT.yellow);
  for (const sx of [-0.55, 0.55]) beads(l.bulbs, [[sx, y0 + 0.8, -0.3], [sx, y0 + 8.6, -0.3]], 0.55, 0.12, (f) => t + f * 0.12);
  // the hammer, leaning on the base
  bar(fr, PAINT.wood, [0.95, y0 + 0.05, 1.3], [1.15, y0 + 1.6, 0.75], 0.06, S.tube6);
  fr.box(PAINT.red, [1.17, y0 + 1.66, 0.72], [0.28, 0.28, 0.6]);
  commit(p, l, placeM(x, z, ry));
}

/** What a snack cart sells. */
export type CartKind = "popcorn" | "candy" | "ice" | "churros";
const CART_PAINT: Record<CartKind, [string, string, string]> = {
  popcorn: [PAINT.red, PAINT.red, NEON.yellow],
  candy: [PAINT.pink, PAINT.pink, NEON.pink],
  ice: [PAINT.teal, PAINT.cyan, NEON.cyan],
  churros: [PAINT.gold, PAINT.orange, NEON.orange],
};

/** A snack cart on two wheels with a striped umbrella and its wares on top; its glowing sign faces +z. */
export function cart(p: Parts, x: number, z: number, y0: number, ry: number, kind: CartKind) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  const [body, stripe, neon] = CART_PAINT[kind];
  fr.box(body, [0, y0 + 0.95, 0], [1.9, 0.8, 1.0]);
  fr.box(PAINT.cream, [0, y0 + 1.39, 0], [2.0, 0.08, 1.1]);
  for (const sz of [-0.56, 0.56]) fr.add(G.cyl12, mat(-0.45, y0 + 0.36, sz, 0.34, 0.08, 0.34, 0, Math.PI / 2), PAINT.cream);
  bar(fr, PAINT.gold, [0.95, y0 + 1.05, -0.4], [1.4, y0 + 1.25, -0.4], 0.04, S.tube4);
  bar(fr, PAINT.gold, [0.95, y0 + 1.05, 0.4], [1.4, y0 + 1.25, 0.4], 0.04, S.tube4);
  li.add(G.box, mat(0, y0 + 0.95, 0.51, 1.4, 0.42, 0.04), neon, t, -60);
  bar(fr, PAINT.white, [0, y0 + 1.42, 0], [0, y0 + 2.75, 0], 0.05, S.tube4);
  fr.revolve([0, y0 + 2.45, 0], [[1.35, 0], [0, 0.6]], 8, (s) => (s % 2 ? PAINT.cream : stripe), true);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    l.bulbs.add([Math.cos(a) * 1.32, y0 + 2.42, Math.sin(a) * 1.32], 0.1, bulbC(i), t);
  }
  const wx = 0.45;
  if (kind === "popcorn") {
    fr.add(G.cup, mat(wx, y0 + 1.8, 0, 0.32, 0.7, 0.32), PAINT.red);
    fr.ball(PAINT.ivory, [wx, y0 + 2.2, 0], [0.34, 0.2, 0.34]);
  } else if (kind === "candy") {
    bar(fr, PAINT.white, [wx, y0 + 1.43, 0], [wx, y0 + 1.95, 0], 0.03, S.tube4);
    fr.ball(PAINT.pink, [wx, y0 + 2.15, 0], [0.32, 0.3, 0.32]);
  } else if (kind === "ice") {
    fr.add(G.cone8, mat(wx, y0 + 1.75, 0, 0.22, 0.6, 0.22, 0, Math.PI), PAINT.gold);
    fr.ball(PAINT.pink, [wx, y0 + 2.12, 0], 0.26, G.ico);
  } else {
    fr.add(G.cup, mat(wx, y0 + 1.65, 0, 0.26, 0.45, 0.26), PAINT.red);
    for (let i = 0; i < 3; i++) bar(fr, PAINT.gold, [wx - 0.1 + i * 0.1, y0 + 1.6, 0], [wx - 0.16 + i * 0.16, y0 + 2.3, 0.05], 0.04, S.tube4);
  }
  commit(p, l, placeM(x, z, ry));
}

/** A raised flower bed `w` by `d` (along local x and z): a cream kerb, soil, leaves and flowers. */
export function flowerBed(p: Parts, x: number, z: number, ry: number, w: number, d: number, seed: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const r = rng(seed * 37 + 11);
  fr.box(PAINT.cream, [0, 0.12, 0], [w + 0.3, 0.24, d + 0.3]);
  fr.box(PAINT.woodDark, [0, 0.28, 0], [w, 0.12, d]);
  const leaves = Math.max(2, Math.round(w * d * 0.6));
  for (let i = 0; i < leaves; i++) fr.ball(PAINT.leafDark, [(r() - 0.5) * (w - 0.4), 0.42, (r() - 0.5) * (d - 0.4)], [0.38, 0.22, 0.38], G.ico);
  const n = Math.round(w * d * (p.lite ? 1.2 : 2.4));
  for (let i = 0; i < n; i++) {
    fr.ball(FLOWERS[Math.floor(r() * FLOWERS.length)], [(r() - 0.5) * (w - 0.3), 0.55 + r() * 0.12, (r() - 0.5) * (d - 0.3)], 0.12 + r() * 0.06, G.ico);
  }
  commit(p, l, placeM(x, z, ry));
}

/** The bandstand: eight cream posts under a striped dome on a round deck, a band playing; its steps face +z. */
export function bandstand(p: Parts, x: number, z: number, y0: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  const R = 4.4;
  fr.cyl(PAINT.cream, [0, y0 + 0.4, 0], R + 0.4, 0.8, G.cyl20);
  fr.cyl(PAINT.deck, [0, y0 + 0.83, 0], R + 0.3, 0.06, G.cyl20);
  for (let i = 0; i < 2; i++) fr.box(PAINT.cream, [0, y0 + 0.2 + i * 0.27, R + 0.65 + (1 - i) * 0.45], [2.2, 0.4 + i * 0.14, 0.5]);
  const post = (i: number): V3 => {
    const a = (i / 8) * TAU + TAU / 16;
    return [Math.sin(a) * R, 0, Math.cos(a) * R];
  };
  for (let i = 0; i < 8; i++) {
    const [px, , pz] = post(i);
    bar(fr, PAINT.cream, [px, y0 + 0.85, pz], [px, y0 + 4.2, pz], 0.12, S.tube6);
    fr.cyl(PAINT.gold, [px, y0 + 4.1, pz], 0.2, 0.2, G.cyl6);
    if (i === 0 || i === 7) continue;
    const [qx, , qz] = post(i + 1);
    bar(fr, PAINT.cream, [px, y0 + 1.55, pz], [qx, y0 + 1.55, qz], 0.06, S.tube4);
  }
  fr.revolve([0, y0 + 4.2, 0], [[R + 0.8, 0], [R * 0.55, 1.4], [0.35, 2.6], [0, 2.8]], 16, (s) => (s % 2 ? PAINT.cream : PAINT.red), true);
  fr.cyl(PAINT.gold, [0, y0 + 7.2, 0], 0.12, 0.7, G.cyl6);
  fr.add(G.star, mat(0, y0 + 7.85, 0, 0.45, 0.45, 0.12), PAINT.yellow);
  tube(li, circlePts([0, y0 + 4.05, 0], R + 0.05, 24), 0.06, NEON.yellow, t, 70, true, false, S.tube4);
  l.bulbs.ring(0, y0 + 4.25, 0, R + 0.75, p.lite ? 12 : 24, 0.13, MARQUEE, t, t + 0.05);
  if (!p.lite) {
    const band = [PAINT.red, PAINT.navy, PAINT.red, PAINT.navy];
    band.forEach((c, i) => {
      const a = (i / 4) * TAU + 0.4;
      const bx = Math.sin(a) * 2;
      const bz = Math.cos(a) * 2;
      fr.add(G.cyl8, mat(bx, y0 + 1.45, bz, 0.3, 1.1, 0.3), c);
      fr.ball("#e8b48f", [bx, y0 + 2.25, bz], 0.22, G.ico);
      fr.cyl(PAINT.red, [bx, y0 + 2.5, bz], 0.22, 0.24, G.cyl6);
      fr.add(G.cup, mat(bx + 0.35, y0 + 1.6, bz, 0.16, 0.4, 0.16, 0, 0, 0.6), PAINT.gold);
    });
  }
  commit(p, l, placeM(x, z, ry));
}

/** Bleachers `len` long: three tiers stepping back from the front (+z), red and cream seats, a back rail. */
export function bleachers(p: Parts, x: number, z: number, ry: number, len: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  for (let i = 0; i < 3; i++) {
    const h = 0.5 * (i + 1);
    fr.box(PAINT.wood, [0, h / 2, -i * 0.9], [len, h, 0.9]);
    fr.box(i % 2 ? PAINT.cream : PAINT.red, [0, h + 0.05, -i * 0.9 + 0.1], [len - 0.2, 0.1, 0.5]);
  }
  for (const sx of [-1, 1]) bar(fr, PAINT.gold, [sx * (len / 2), 1.5, -2.05], [sx * (len / 2), 2.6, -2.05], 0.06, S.tube4);
  bar(fr, PAINT.gold, [-len / 2, 2.6, -2.05], [len / 2, 2.6, -2.05], 0.05, S.tube4);
  if (!p.lite) {
    const r = rng(Math.round(x * 13 + z));
    for (let i = 0; i < 9; i++) {
      const tier = i % 3;
      const sx = -len / 2 + 0.8 + r() * (len - 1.6);
      fr.ball(["#e8b48f", "#c48a63", "#8d5a3b"][i % 3], [sx, 0.5 * (tier + 1) + 0.75, -tier * 0.9 + 0.1], 0.2, G.ico);
      fr.add(G.cyl8, mat(sx, 0.5 * (tier + 1) + 0.35, -tier * 0.9 + 0.1, 0.22, 0.5, 0.22), FLOWERS[i % FLOWERS.length]);
    }
  }
  commit(p, l, placeM(x, z, ry));
}

/** The circus ring's middle: a striped pedestal with a star, and a tall striped mast for the bulb strings. */
export function ringPedestal(p: Parts, x: number, z: number, y0: number, mastH: number) {
  const t = tAt(x, z);
  p.frame.revolve([x, y0, z], [[1.7, 0], [1.7, 0.9], [1.2, 1.1], [0, 1.1]], 16, (s, k) => (k === 0 ? (s % 2 ? PAINT.red : PAINT.cream) : PAINT.gold));
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? PAINT.cream : PAINT.red;
    p.frame.cyl(c, [x, y0 + 1.1 + (i + 0.5) * ((mastH - 1.1) / 6), z], 0.16, (mastH - 1.1) / 6, G.cyl8);
  }
  p.frame.add(G.star, mat(x, y0 + mastH + 0.6, z, 0.7, 0.7, 0.18), PAINT.yellow);
  p.bulbs.add([x, y0 + mastH + 0.05, z], 0.3, NEON.warm, t);
}

/** The fortune teller's tent: a round striped tent, a crystal ball glowing by its door (+z), the FORTUNE sign. */
export function fortuneTent(p: Parts, x: number, z: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  fr.revolve([0, 0, 0], [[3.1, 0], [3.1, 2.4]], 12, (s) => (s % 2 ? PAINT.gold : PAINT.plum));
  fr.revolve([0, 2.4, 0], [[3.4, 0], [0, 2.8]], 12, (s) => (s % 2 ? PAINT.gold : PAINT.plumDark), true);
  fr.box(PAINT.black, [0, 1.1, 3.05], [1.2, 2.1, 0.12]);
  fr.cyl(PAINT.gold, [0, 5.35, 0], 0.08, 0.5, G.cyl6);
  fr.add(G.star, mat(0, 5.85, 0, 0.42, 0.42, 0.1), PAINT.yellow);
  fr.box(PAINT.plumDark, [0, 2.95, 3.25], [3.4, 0.7, 0.15]);
  neonText(li, "FORTUNE", 0.45, 2.73, 3.34, 0.04, NEON.lilac, t, 1100);
  bar(fr, PAINT.gold, [1.8, 0, 3.6], [1.8, 1.0, 3.6], 0.06, S.tube4);
  li.add(G.ball, mat(1.8, 1.32, 3.6, 0.32), NEON.lilac, t, -80);
  l.bulbs.ring(0, 2.4, 0, 3.45, p.lite ? 10 : 20, 0.12, MARQUEE, t, t + 0.04);
  commit(p, l, placeM(x, z, ry));
}

/** The hall of mirrors: a six-sided pavilion of glowing mirror walls under a striped roof; its door faces +z. */
export function mirrorMaze(p: Parts, x: number, z: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  const R = 6;
  fr.cyl(PAINT.stone, [0, 0.15, 0], R + 0.4, 0.3, G.cyl6);
  // corners at 30° + k·60°, so a flat side (the door) faces +z
  const corner = (k: number): [number, number] => {
    const a = TAU / 12 + (k * TAU) / 6;
    return [Math.cos(a) * R, Math.sin(a) * R];
  };
  for (let k = 0; k < 6; k++) {
    const [ax, az] = corner(k);
    const [bx, bz] = corner(k + 1);
    bar(fr, PAINT.gold, [ax, 0.3, az], [ax, 3.4, az], 0.12, S.tube6);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (mz > R * 0.8) continue;
    const a = Math.atan2(-(bz - az), bx - ax);
    const len = Math.hypot(bx - ax, bz - az);
    fr.add(G.box, mat(mx, 1.75, mz, len - 0.3, 2.9, 0.1, a), PAINT.white);
    li.add(G.box, mat(mx * 1.02, 1.75, mz * 1.02, len - 0.7, 2.5, 0.06, a), "#c9f6ff", t + 0.01 * k, -90 - k);
  }
  fr.revolve([0, 3.4, 0], [[R + 0.7, 0], [0, 2.6]], 6, (s) => (s % 2 ? PAINT.cream : PAINT.teal), true, TAU / 12);
  fr.box(PAINT.navy, [0, 3.95, R * 0.87 + 0.35], [4.4, 0.75, 0.15]);
  neonText(li, "MIRRORS", 0.45, 3.73, R * 0.87 + 0.44, 0.04, NEON.cyan, t, 1200);
  l.bulbs.ring(0, 3.42, 0, R + 0.6, p.lite ? 12 : 24, 0.12, MARQUEE, t, t + 0.05);
  fr.add(G.star, mat(0, 6.35, 0, 0.45, 0.45, 0.12), PAINT.yellow);
  commit(p, l, placeM(x, z, ry));
}

/** An arch over a walk `2 halfW` wide: two striped towers, a red beam, a neon sign (`text`) facing +z. */
export function entranceArch(p: Parts, x: number, z: number, ry: number, halfW: number, text: string) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) fr.box(i % 2 ? PAINT.cream : PAINT.red, [sx * halfW, 0.5 + i, 0], [1.1, 1.0, 1.1]);
    fr.box(PAINT.gold, [sx * halfW, 7.1, 0], [1.4, 0.2, 1.4]);
    fr.add(G.cone8, mat(sx * halfW, 7.75, 0, 0.75, 1.1, 0.75), PAINT.red);
  }
  fr.box(PAINT.red, [0, 6.3, 0], [2 * halfW, 0.8, 0.6]);
  fr.box(PAINT.cream, [0, 7.75, 0], [2 * halfW - 1.6, 1.8, 0.3]);
  for (const y of [6.85, 8.65]) fr.box(PAINT.gold, [0, y, 0], [2 * halfW - 1.4, 0.16, 0.4]);
  neonText(li, text, 1.1, 7.2, 0.2, 0.08, NEON.yellow, t, 1300);
  beads(l.bulbs, [[-halfW + 0.8, 5.85, 0.35], [halfW - 0.8, 5.85, 0.35]], p.lite ? 1.0 : 0.5, 0.13, t);
  beads(l.bulbs, [[-halfW + 0.8, 8.85, 0.2], [halfW - 0.8, 8.85, 0.2]], p.lite ? 1.0 : 0.5, 0.13, t);
  const flags = [PAINT.red, PAINT.cream, PAINT.gold, PAINT.teal];
  for (let i = 0; i < 9; i++) fr.add(G.pennant, mat(-halfW + 1.2 + (i * (2 * halfW - 2.4)) / 8, 5.88, 0.32, 0.8, 0.8, 0.8), flags[i % 4]);
  commit(p, l, placeM(x, z, ry));
}

/** The ticket booth: a little striped kiosk with a lit window (+z) under a gold dome, the TICKETS sign. */
export function ticketBooth(p: Parts, x: number, z: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  for (let i = 0; i < 6; i++) fr.box(i % 2 ? PAINT.cream : PAINT.red, [-1.25 + (i + 0.5) * (2.5 / 6), 1.35, 0], [2.5 / 6, 2.7, 2.2]);
  li.add(G.box, mat(0, 1.75, 1.12, 1.6, 0.9, 0.04), NEON.warm, t, -100);
  fr.box(PAINT.gold, [0, 1.18, 1.25], [1.9, 0.08, 0.35]);
  fr.box(PAINT.gold, [0, 2.78, 0], [2.8, 0.16, 2.5]);
  fr.add(S.domeLo, mat(0, 2.86, 0, 1.3, 1.1, 1.2), PAINT.gold);
  fr.box(PAINT.red, [0, 3.35, 1.25], [2.9, 0.62, 0.14]);
  neonText(li, "TICKETS", 0.4, 3.15, 1.33, 0.04, NEON.yellow, t, 1400);
  commit(p, l, placeM(x, z, ry));
}

/** The restrooms: a cream block with a teal roof, two doors (+z) and the WC sign. */
export function restrooms(p: Parts, x: number, z: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  fr.box(PAINT.cream, [0, 1.5, 0], [7, 3.0, 4.5]);
  fr.box(PAINT.teal, [0, 3.12, 0], [7.6, 0.24, 5.1]);
  for (const sx of [-1.6, 1.6]) {
    fr.box(PAINT.navy, [sx, 1.1, 2.26], [1.1, 2.1, 0.06]);
    li.add(G.box, mat(sx, 2.45, 2.27, 0.5, 0.5, 0.04), sx < 0 ? NEON.pink : NEON.cyan, t, -110);
  }
  fr.box(PAINT.navy, [0, 3.7, 0.8], [2.2, 0.9, 0.16]);
  neonText(li, "WC", 0.55, 3.43, 0.9, 0.05, NEON.white, t, 1500);
  commit(p, l, placeM(x, z, ry));
}

/** First aid: a white kiosk with red crosses on its front (+z) and sides and a red beacon on top. */
export function firstAid(p: Parts, x: number, z: number, ry: number) {
  const l = newLocal(p.lite);
  const fr = l.frame;
  const li = l.light;
  const t = tAt(x, z);
  fr.box(PAINT.white, [0, 1.4, 0], [3.4, 2.8, 3.0]);
  fr.box(PAINT.red, [0, 2.86, 0], [3.6, 0.14, 3.2]);
  fr.box(PAINT.navy, [0.7, 1.05, 1.52], [1.0, 2.0, 0.06]);
  const cross = (cx: number, cz: number, a: number) => {
    fr.add(G.box, mat(cx, 1.9, cz, 0.9, 0.28, 0.05, a), PAINT.red);
    fr.add(G.box, mat(cx, 1.9, cz, 0.28, 0.9, 0.05, a), PAINT.red);
  };
  cross(-0.8, 1.53, 0);
  cross(1.73, 0, Math.PI / 2);
  cross(-1.73, 0, Math.PI / 2);
  li.add(G.ball, mat(0, 3.15, 0, 0.22), "#ff3b3b", t, -120);
  commit(p, l, placeM(x, z, ry));
}
