import type * as THREE from "three";

import type { Bulbs } from "../central/kit";
import { G, mat } from "../central/kit";
import { bar } from "../west/kit";
import { bakeBigTop } from "./bigtop";
import { bakeArcade, bakeHaunted } from "./buildings";
import { bakeCoaster } from "./coaster";
import { bakeDecor } from "./decor";
import { bakeGround, groundY } from "./ground";
import { PAINT } from "./kit";
import { newParts, type Board, type Pool } from "./parts";
import { bakeShip } from "./ship";

// DRAFT: bakes every static piece of the East zone into three geometries
// (paving, frame, light) plus one list of bulbs, so the zone's static part
// costs four draw calls (and the frame's shadow).

export type Built = {
  paving: THREE.BufferGeometry;
  frame: THREE.BufferGeometry;
  light: THREE.BufferGeometry;
  bulbs: Bulbs;
  boards: Board[];
  pools: Pool[];
  dispose(): void;
};

export function buildStatic(lite: boolean): Built {
  const p = newParts(lite);
  bakeGround(p);
  bakeBigTop(p);
  bakeCoaster(p);
  bakeShip(p);
  bakeHaunted(p);
  bakeArcade(p);
  bakeDecor(p);
  // the boards' A-frame legs (the faces are a separate mesh: they switch from CLOSED to OPEN)
  for (const b of p.boards) {
    const y = groundY(b.x, b.z);
    const c = Math.cos(b.ry);
    const s = Math.sin(b.ry);
    for (const side of [-0.85, 0.85]) {
      const lx = b.x + side * s;
      const lz = b.z + side * c;
      for (const f of [-1, 1]) bar(p.frame, PAINT.wood, [lx + f * 0.55 * c, y, lz - f * 0.55 * s], [lx, y + 2.2, lz], 0.06);
    }
    p.frame.add(G.box, mat(b.x, y + 2.2, b.z, 0.2, 0.14, 1.9, b.ry), PAINT.gold);
  }
  const paving = p.paving.geometry();
  const frame = p.frame.geometry();
  const light = p.light.geometry();
  return {
    paving,
    frame,
    light,
    bulbs: p.bulbs,
    boards: p.boards,
    pools: p.pools,
    dispose() {
      paving.dispose();
      frame.dispose();
      light.dispose();
    },
  };
}
