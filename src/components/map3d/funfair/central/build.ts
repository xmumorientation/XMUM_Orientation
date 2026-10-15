import type * as THREE from "three";

import { bakeBumper } from "./bumper";
import { bakeDecor } from "./decor";
import { bakeDrop } from "./drop";
import { bakeGround, groundY } from "./ground";
import { G, PAINT, mat } from "./kit";
import { newParts, type Board, type Pool } from "./parts";
import { bakeSwings } from "./swings";
import { bakeTeacups } from "./teacups";

import type { Bulbs } from "./kit";

// DRAFT: bakes every static piece of the Central zone into four geometries
// (ground, paint, neon) plus one list of bulbs, so the whole zone's static
// part costs four draw calls.

export type Built = {
  paving: THREE.BufferGeometry;
  paint: THREE.BufferGeometry;
  neon: THREE.BufferGeometry;
  bulbs: Bulbs;
  boards: Board[];
  pools: Pool[];
  dispose(): void;
};

export function buildStatic(lite: boolean): Built {
  const p = newParts(lite);
  bakeGround(p);
  bakeDecor(p);
  bakeDrop(p);
  bakeSwings(p);
  bakeTeacups(p);
  bakeBumper(p);
  // the boards' A-frame legs (the faces are a separate mesh: they switch from CLOSED to OPEN)
  for (const b of p.boards) {
    const y = groundY(b.x, b.z);
    const c = Math.cos(b.ry);
    const s = Math.sin(b.ry);
    for (const side of [-0.85, 0.85]) {
      // local +x is the board's front; legs splay front and back
      const lx = b.x + side * s;
      const lz = b.z + side * c;
      for (const f of [-1, 1]) p.paint.seg(PAINT.wood, [lx + f * 0.55 * c, y, lz - f * 0.55 * s], [lx, y + 2.2, lz], 0.12);
    }
    p.paint.add(G.box, mat(b.x, y + 2.2, b.z, 0.2, 0.14, 1.9, b.ry), PAINT.wood);
  }
  const paving = p.paving.geometry();
  const paint = p.paint.geometry();
  const neon = p.neon.geometry();
  return {
    paving,
    paint,
    neon,
    bulbs: p.bulbs,
    boards: p.boards,
    pools: p.pools,
    dispose() {
      paving.dispose();
      paint.dispose();
      neon.dispose();
    },
  };
}
