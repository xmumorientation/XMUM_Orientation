import type * as THREE from "three";

import type { Bulbs } from "../central/kit";
import { G, mat } from "../central/kit";
import { bakeBooths } from "./booths";
import { bakeCarousel } from "./carousel";
import { bakeDecor } from "./decor";
import { bakeGround, groundY } from "./ground";
import { STEEL, bar } from "./kit";
import { bakeLagoon } from "./lagoon";
import { newParts, type Board, type Pool } from "./parts";
import { bakeSpiders } from "./spider";
import { bakeWheel } from "./wheel";

// DRAFT: bakes every static piece of the West zone into five geometries
// (paving, water, frame, light) plus one list of bulbs, so the zone's static
// part costs six draw calls (the frame casts shadows).

export type Built = {
  paving: THREE.BufferGeometry;
  water: THREE.BufferGeometry;
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
  bakeWheel(p);
  bakeCarousel(p);
  bakeBooths(p);
  bakeSpiders(p);
  bakeLagoon(p);
  bakeDecor(p);
  // the boards' A-frame legs (the faces are a separate mesh: they switch from CLOSED to OPEN)
  for (const b of p.boards) {
    const y = groundY(b.x, b.z);
    const c = Math.cos(b.ry);
    const s = Math.sin(b.ry);
    for (const side of [-0.85, 0.85]) {
      // local +x is the board's front; legs splay front and back
      const lx = b.x + side * s;
      const lz = b.z + side * c;
      for (const f of [-1, 1]) bar(p.frame, STEEL.silver, [lx + f * 0.55 * c, y, lz - f * 0.55 * s], [lx, y + 2.2, lz], 0.06);
    }
    p.frame.add(G.box, mat(b.x, y + 2.2, b.z, 0.2, 0.14, 1.9, b.ry), STEEL.silver);
  }
  const paving = p.paving.geometry();
  const water = p.water.geometry();
  const frame = p.frame.geometry();
  const light = p.light.geometry();
  return {
    paving,
    water,
    frame,
    light,
    bulbs: p.bulbs,
    boards: p.boards,
    pools: p.pools,
    dispose() {
      paving.dispose();
      water.dispose();
      frame.dispose();
      light.dispose();
    },
  };
}
