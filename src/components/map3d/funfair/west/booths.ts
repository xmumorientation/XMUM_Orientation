import { G, TAU, mat, rng, type V3 } from "../central/kit";
import { LIGHTS, NEON, S, STEEL, bar, circlePts, tube } from "./kit";
import { BOOTHS, COURT } from "./layout";
import { bench, frame, lamp, tAt, bunting, type Parts } from "./parts";

// DRAFT: LY2, the game booths: a chequered court open to the Neon Walk, with
// the duck shoot across its far (park) side and four game booths down its
// sides. The duck shoot's targets are little crowned ducks, like the lake's
// duck, sliding along two rails (ducks.tsx); a big crowned duck sits on its
// roof.

const COURT_Y = 0.32;
/** The duck shoot: its centre, width, and the two target rails (x, y, z from, z to). */
export const SHOOT = { x: COURT.x[0] + 4.2, z: BOOTHS[1], w: 13 };
export const RAILS: { x: number; y: number; z: [number, number] }[] = [
  { x: SHOOT.x - 0.5, y: COURT_Y + 1.42, z: [SHOOT.z - 5.6, SHOOT.z + 5.6] },
  { x: SHOOT.x - 1.15, y: COURT_Y + 2.28, z: [SHOOT.z - 5.6, SHOOT.z + 5.6] },
];

type Game = "rings" | "cans" | "balloons" | "darts";

/**
 * A game booth `w` wide, its counter facing local +x, turned `ry` (0 faces +x, π/2 faces -z, -π/2 faces +z):
 * painted back wall with prize shelves, white sides and counter, a striped awning, a glowing sign.
 */
function booth(p: Parts, x: number, z: number, ry: number, w: number, paint: string, neon: string, game: Game | "ducks") {
  const f = frame(x, z, ry);
  const y0 = COURT_Y;
  const t = tAt(x, z);
  const box = (c: string, u: number, y: number, v: number, sx: number, sy: number, sz: number) => {
    const q = f(u, y0 + y, v);
    p.frame.add(G.box, mat(q[0], q[1], q[2], sx, sy, sz, ry), c);
  };
  const hw = w / 2;
  box(STEEL.silver, 0, 0.15, 0, 3.8, 0.3, w);
  box(paint, -1.75, 1.85, 0, 0.3, 3.1, w);
  for (const s of [-1, 1]) box(STEEL.white, 0, 1.85, s * (hw - 0.1), 3.6, 3.1, 0.2);
  box(STEEL.white, 1.6, 0.85, 0, 0.6, 1.1, w - 0.4);
  box(paint, 1.92, 0.85, 0, 0.06, 0.3, w - 0.4);
  box(STEEL.silver, 0, 3.5, 0, 4.0, 0.22, w + 0.3);
  // awning stripes, sloping down to the front
  const n = Math.round(w / 0.9);
  for (let i = 0; i < n; i++) {
    const v0 = -hw - 0.1 + ((w + 0.2) * i) / n;
    const v1 = -hw - 0.1 + ((w + 0.2) * (i + 1)) / n;
    p.frame.quad(i % 2 ? STEEL.white : paint, f(2.0, y0 + 3.45, v0), f(2.0, y0 + 3.45, v1), f(2.9, y0 + 2.95, v1), f(2.9, y0 + 2.95, v0), true);
  }
  for (let i = 0; i <= n; i++) {
    const v = -hw - 0.1 + ((w + 0.2) * i) / n;
    p.bulbs.add(f(2.95, y0 + 2.85, v), 0.16, i % 2 ? NEON.warm : neon, t + 0.02);
  }
  // the sign on the roof: silver box, glowing face, white neon frame (at the front on the duck shoot: its duck sits behind)
  const sw = Math.min(w - 1, 5.2);
  const su = game === "ducks" ? 1.45 : 0.6;
  box(STEEL.silver, su, 4.25, 0, 0.3, 1.3, sw + 0.3);
  const face = f(su + 0.18, y0 + 4.25, 0);
  p.light.add(G.box, mat(face[0], face[1], face[2], 0.06, 0.9, sw - 0.4, ry), neon, t + 0.03, -31);
  tube(p.light, [f(su + 0.2, y0 + 3.65, -sw / 2), f(su + 0.2, y0 + 3.65, sw / 2), f(su + 0.2, y0 + 4.85, sw / 2), f(su + 0.2, y0 + 4.85, -sw / 2)], 0.06, NEON.white, t + 0.04, 32, true, false, S.tube4);
  const r = rng(Math.round(x * 7 + z * 3));
  if (game === "ducks") return;
  // prizes on two shelves along the back wall
  for (const y of [2.05, 2.85]) {
    box(STEEL.white, -1.45, y - 0.08, 0, 0.35, 0.08, w - 0.6);
    for (let v = -hw + 0.6; v < hw - 0.5; v += 0.62) {
      const q = f(-1.42, y0 + y + 0.22, v + (r() - 0.5) * 0.1);
      p.frame.ball([STEEL.pink, STEEL.cyan, STEEL.yellow, STEEL.lilac, STEEL.orange][Math.floor(r() * 5)], q, 0.24 + r() * 0.06);
    }
  }
  // the game itself, on a table behind the counter
  if (game === "rings" || game === "cans") {
    box(STEEL.white, 0.2, 0.7, 0, 1.6, 0.1, w - 1.4);
    for (let v = -hw + 1.2; v <= hw - 1.2; v += 0.5) {
      for (let u = -0.4; u <= 0.6; u += 0.5) {
        const q = f(0.2 + u, y0 + (game === "rings" ? 1.0 : 0.95), v);
        if (game === "rings") p.frame.add(S.cyl12, mat(q[0], q[1], q[2], 0.09, 0.55, 0.09), STEEL.cyan);
        else p.frame.add(S.cyl12, mat(q[0], q[1], q[2], 0.16, 0.42, 0.16), (Math.round(v * 2) + Math.round(u * 2)) % 2 ? STEEL.red : STEEL.silver);
      }
    }
  } else if (game === "balloons") {
    for (let v = -hw + 0.7; v < hw - 0.5; v += 0.55)
      for (let y = 1.3; y < 1.9; y += 0.5) p.frame.ball(LIGHTS[Math.floor(r() * 5)], f(-1.5, y0 + y, v), 0.24);
  } else if (game === "darts") {
    for (const v of [-hw / 2, 0, hw / 2]) {
      const q = f(-1.55, y0 + 1.6, v);
      p.frame.add(S.cyl20, mat(q[0], q[1], q[2], 0.65, 0.08, 0.65, ry, 0, Math.PI / 2), STEEL.white);
      p.light.add(S.tube16, mat(q[0] + 0, q[1], q[2], 0.45, 0.1, 0.45, ry, 0, Math.PI / 2), NEON.pink, t + 0.04, -33);
    }
  }
}

/** A crowned duck figure, facing local +x, `s` metres to the top of its crown. */
export function crownedDuck(p: Parts, f: (x: number, y: number, z: number) => V3, ry: number, y0: number, s: number) {
  const k = s / 1.15;
  const add = (g: Parameters<typeof p.frame.add>[0], x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, rz = 0) => {
    const q = f(x * k, y0 + y * k, z * k);
    p.frame.add(g, mat(q[0], q[1], q[2], sx * k, sy * k, sz * k, ry, 0, rz), c);
  };
  add(S.ball, 0, 0.3, 0, 0.55, 0.36, 0.38, STEEL.white);
  add(G.cone8, -0.52, 0.42, 0, 0.16, 0.34, 0.16, STEEL.white, Math.PI / 2 + 0.5);
  add(S.ball, 0.32, 0.72, 0, 0.24, 0.24, 0.24, STEEL.white);
  add(G.cone8, 0.6, 0.68, 0, 0.09, 0.22, 0.07, STEEL.orange, -Math.PI / 2);
  add(S.ball, 0.48, 0.78, 0.13, 0.04, 0.04, 0.04, "#1b1b22");
  add(S.ball, 0.48, 0.78, -0.13, 0.04, 0.04, 0.04, "#1b1b22");
  add(S.cyl12, 0.3, 0.98, 0, 0.13, 0.1, 0.13, "#f2b33d");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    add(G.cone6, 0.3 + Math.cos(a) * 0.11, 1.08, Math.sin(a) * 0.11, 0.04, 0.1, 0.04, "#f2b33d");
  }
}

export function bakeBooths(p: Parts) {
  const [x0, x1] = COURT.x;
  const [z0, z1] = COURT.z;
  // the duck shoot across the park side, facing the Neon Walk
  booth(p, SHOOT.x, SHOOT.z, 0, SHOOT.w, STEEL.pink, NEON.pink, "ducks");
  // the water rails the ducks ride on
  for (const r of RAILS) {
    p.frame.box("#3f9fd6", [r.x, r.y - 0.12, SHOOT.z], [0.5, 0.14, SHOOT.w - 1.0]);
    p.frame.box(STEEL.white, [r.x + 0.28, r.y - 0.08, SHOOT.z], [0.06, 0.24, SHOOT.w - 1.0]);
  }
  // a big crowned duck on its roof, and neon targets either side of it
  const fd = frame(SHOOT.x - 0.7, SHOOT.z, 0);
  crownedDuck(p, fd, 0, COURT_Y + 3.62, 2.6);
  const t = tAt(SHOOT.x, SHOOT.z);
  for (const s of [-1, 1]) {
    const c: V3 = [SHOOT.x + 1.45, COURT_Y + 4.75, SHOOT.z + s * 4.6];
    bar(p.frame, STEEL.silver, [c[0], COURT_Y + 3.6, c[2]], [c[0], c[1] - 0.95, c[2]], 0.08, S.tube6);
    tube(p.light, circlePts(c, 0.95, 20, [0, 1, 0], [0, 0, 1]), 0.08, NEON.cyan, t + 0.04, 60, true);
    tube(p.light, circlePts(c, 0.5, 14, [0, 1, 0], [0, 0, 1]), 0.08, NEON.pink, t + 0.05, 80, true);
    p.light.add(S.ball, mat(c[0], c[1], c[2], 0.16), NEON.yellow, t + 0.06, -90);
  }
  // game booths down the court's sides, facing in
  const xs = [x0 + 13, x0 + 24.5];
  booth(p, xs[0], z0 + 2.2, -Math.PI / 2, 6, STEEL.cyan, NEON.cyan, "rings");
  booth(p, xs[1], z0 + 2.2, -Math.PI / 2, 6, STEEL.yellow, NEON.yellow, "cans");
  booth(p, xs[0], z1 - 2.2, Math.PI / 2, 6, STEEL.lilac, NEON.lilac, "balloons");
  booth(p, xs[1], z1 - 2.2, Math.PI / 2, 6, STEEL.orange, NEON.orange, "darts");
  // lamps at the court's corners on the walk side, strings across the court to the duck shoot's roof
  const lampsAt: [number, number][] = [
    [x1 - 1.2, z0 + 1.2],
    [x1 - 1.2, z1 - 1.2],
    [x0 + 8, z0 + 1.2],
    [x0 + 8, z1 - 1.2],
  ];
  for (const [lx, lz] of lampsAt) lamp(p, lx, lz, COURT_Y, 6.6, NEON.pink);
  const top = (i: number): V3 => [lampsAt[i][0], COURT_Y + 6.7, lampsAt[i][1]];
  bunting(p, top(0), top(3), p.lite ? 10 : 16, 1.3, !p.lite);
  bunting(p, top(1), top(2), p.lite ? 10 : 16, 1.3, false);
  bunting(p, top(0), top(1), p.lite ? 10 : 16, 1.1, !p.lite);
  bunting(p, top(2), top(3), p.lite ? 10 : 16, 1.1, false);
  // benches in the court, facing the duck shoot
  for (const v of [-6, 6]) bench(p, x1 - 9, SHOOT.z + v, COURT_Y, Math.PI);
  p.boards.push({ x: x1 - 2.6, z: SHOOT.z + 7.5, ry: 0 });
  p.pools.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: 22, c: "#ff6cd0" });
}
