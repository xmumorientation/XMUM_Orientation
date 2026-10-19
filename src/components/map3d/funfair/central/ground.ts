import { G, PAINT, mat } from "./kit";
import {
  BOULEVARD,
  BUMPER,
  BUMPER_HX,
  BUMPER_HZ,
  CROSSING,
  CROSSING_R,
  DROP,
  DROP_R,
  PROMENADE,
  SQUARE,
  SWINGS,
  SWINGS_R,
  TEACUPS,
  TEACUPS_R,
} from "./layout";
import type { Parts } from "./parts";

// DRAFT: the Central zone's ground: the midway and the promenade, the ride
// plazas and the north square, on the campus lawn (y = 0; the zone has no
// lawn of its own). Layers never share a height (no z-fighting from the map's
// far camera): paths 0.12, plazas are raised slabs (0.26 to 0.46).

const PATH = "#f6e6cf";
const PATH_EDGE = "#c9aef0";
const PATH_W = 5;

/** Height of the ground's top at (x, z), so cables and small things sit on it. */
export function groundY(x: number, z: number) {
  const r = (c: readonly [number, number]) => Math.hypot(x - c[0], z - c[1]);
  const rc = r(CROSSING);
  if (rc < CROSSING_R - 3.4) return 0.46;
  if (rc < CROSSING_R - 2.2) return 0.38;
  if (rc < CROSSING_R) return 0.32;
  if (rc < CROSSING_R + 0.9) return 0.26;
  for (const [c, R] of [
    [TEACUPS, TEACUPS_R],
    [SWINGS, SWINGS_R],
    [DROP, DROP_R],
  ] as const) {
    if (r(c) < R) return 0.32;
    if (r(c) < R + 0.9) return 0.26;
  }
  const bx = Math.abs(x - BUMPER[0]);
  const bz = Math.abs(z - BUMPER[1]);
  if (bx < BUMPER_HX + 3.5 && bz < BUMPER_HZ + 3.5) return 0.32;
  if (bx < BUMPER_HX + 4.4 && bz < BUMPER_HZ + 4.4) return 0.26;
  if (x > SQUARE.x[0] - 0.6 && x < SQUARE.x[1] + 0.6 && z > SQUARE.z[0] - 0.6 && z < SQUARE.z[1] + 0.6) return 0.27;
  if (Math.abs(z) < BOULEVARD.hw && x > BOULEVARD.x[0]) return 0.12;
  if (x > PROMENADE.x[0] && x < PROMENADE.x[1]) return 0.12;
  // the campus lawn
  return 0;
}

/** Plaza slab (top at y = h) with a darker rim. */
function plaza(p: Parts, x: number, z: number, r: number, top: string, rim: string, h = 0.32) {
  p.paving.cyl(rim, [x, (h - 0.06) / 2, z], r + 0.9, h - 0.06, G.cyl48);
  p.paving.cyl(top, [x, h / 2, z], r, h, G.cyl48);
}

/** A flat path strip from x0..x1 by z0..z1 with lilac edges along its length. */
function path(p: Parts, x0: number, x1: number, z0: number, z1: number) {
  const along = x1 - x0 >= z1 - z0;
  const e = 0.9;
  if (along) {
    p.paving.add(G.quad, mat((x0 + x1) / 2, 0.12, (z0 + z1) / 2, x1 - x0, 1, z1 - z0 - 2 * e), PATH);
    p.paving.add(G.quad, mat((x0 + x1) / 2, 0.12, z0 + e / 2, x1 - x0, 1, e), PATH_EDGE);
    p.paving.add(G.quad, mat((x0 + x1) / 2, 0.12, z1 - e / 2, x1 - x0, 1, e), PATH_EDGE);
  } else {
    p.paving.add(G.quad, mat((x0 + x1) / 2, 0.12, (z0 + z1) / 2, x1 - x0 - 2 * e, 1, z1 - z0), PATH);
    p.paving.add(G.quad, mat(x0 + e / 2, 0.12, (z0 + z1) / 2, e, 1, z1 - z0), PATH_EDGE);
    p.paving.add(G.quad, mat(x1 - e / 2, 0.12, (z0 + z1) / 2, e, 1, z1 - z0), PATH_EDGE);
  }
}

/** A raised star tile (toy inlay) on a path. */
function star(p: Parts, x: number, z: number, r: number, c: string, y = 0.12, ry = 0) {
  p.paving.add(G.star, mat(x, y + 0.05, z, r, r, 0.1, ry, -Math.PI / 2), c);
}

export function bakeGround(p: Parts) {
  // the midway (south to north) and the promenade (west to east)
  const hw = BOULEVARD.hw;
  path(p, BOULEVARD.x[0], SQUARE.x[0] + 1, -hw, hw);
  path(p, PROMENADE.x[0], PROMENADE.x[1], PROMENADE.z[0], -hw);
  path(p, PROMENADE.x[0], PROMENADE.x[1], hw, PROMENADE.z[1]);
  for (let x = BOULEVARD.x[0] + 6; x < SQUARE.x[0] - 2; x += 9) {
    if (Math.abs(x - CROSSING[0]) < CROSSING_R + 2) continue;
    star(p, x, 0, 1.25, [PAINT.cyan, PAINT.pink, PAINT.yellow][Math.round(x / 9 + 30) % 3]);
  }

  // side paths from the midway and the promenade to each ride
  const pw = PATH_W / 2;
  path(p, TEACUPS[0] - pw, TEACUPS[0] + pw, TEACUPS[1] + TEACUPS_R - 1, -hw);
  path(p, TEACUPS[0] + TEACUPS_R - 1, PROMENADE.x[0], TEACUPS[1] - pw, TEACUPS[1] + pw);
  path(p, BUMPER[0] - pw, BUMPER[0] + pw, hw, BUMPER[1] - BUMPER_HZ - 3.5);
  path(p, BUMPER[0] + BUMPER_HX + 3.5, PROMENADE.x[0], BUMPER[1] - pw, BUMPER[1] + pw);
  path(p, SWINGS[0] - pw, SWINGS[0] + pw, SWINGS[1] + SWINGS_R - 1, -hw);
  path(p, PROMENADE.x[1], SWINGS[0] - SWINGS_R + 1, SWINGS[1] - pw, SWINGS[1] + pw);
  path(p, DROP[0] - pw, DROP[0] + pw, hw, DROP[1] - DROP_R + 1);
  path(p, PROMENADE.x[1], DROP[0] - DROP_R + 1, DROP[1] - pw, DROP[1] + pw);

  // ride plazas
  plaza(p, TEACUPS[0], TEACUPS[1], TEACUPS_R, "#e3d5f6", "#a68fd8");
  plaza(p, SWINGS[0], SWINGS[1], SWINGS_R, "#ffdcea", "#e78fbb");
  plaza(p, DROP[0], DROP[1], DROP_R, "#d2f3f4", "#5cc6d3");
  const bx = BUMPER_HX + 3.5;
  const bz = BUMPER_HZ + 3.5;
  p.paving.box("#e9c86a", [BUMPER[0], 0.13, BUMPER[1]], [2 * bx + 1.8, 0.26, 2 * bz + 1.8]);
  p.paving.box("#fff0c4", [BUMPER[0], 0.16, BUMPER[1]], [2 * bx, 0.32, 2 * bz]);

  // the crossing: a round plaza with a star inlay round the Starlight pole
  const [cx, cz] = CROSSING;
  plaza(p, cx, cz, CROSSING_R, PATH, PATH_EDGE);
  p.paving.cyl("#7fe3ee", [cx, 0.19, cz], CROSSING_R - 2.2, 0.38, G.cyl48);
  p.paving.cyl(PATH, [cx, 0.23, cz], CROSSING_R - 3.4, 0.46, G.cyl48);
  star(p, cx, cz, 6.2, "#ffd84a", 0.46);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    star(p, cx + Math.cos(a) * (CROSSING_R - 2.8), cz + Math.sin(a) * (CROSSING_R - 2.8), 0.55, i % 2 ? PAINT.pink : PAINT.white, 0.38);
  }

  // the north square: big chequered paving
  const [sx0, sx1] = SQUARE.x;
  const [sz0, sz1] = SQUARE.z;
  p.paving.box("#cdb89c", [(sx0 + sx1) / 2, 0.1, (sz0 + sz1) / 2], [sx1 - sx0 + 1.2, 0.2, sz1 - sz0 + 1.2]);
  const nx = Math.round((sx1 - sx0) / 6);
  const nz = Math.round((sz1 - sz0) / 6);
  const tx = (sx1 - sx0) / nx;
  const tz = (sz1 - sz0) / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++)
      p.paving.add(G.quad, mat(sx0 + (i + 0.5) * tx, 0.27, sz0 + (j + 0.5) * tz, tx, 1, tz), (i + j) % 2 ? "#f3e7d6" : "#e8d8c2");
}
