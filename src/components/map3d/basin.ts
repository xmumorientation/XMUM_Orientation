import * as THREE from "three";

import { EXTENT } from "./geo";
import { BASIN_BOX, basinY } from "./terrain";

// The lake's low ground (terrain.ts basinY) as a grid mesh that wears the flat ground's canvas, like the A-row's raised
// ground does (plateau.tsx), and a mask that cuts the flat ground's plane away where the mesh dips below it.

/** Grid cells (world units): finer on desktops. */
const CELL = { lite: 0.6, full: 0.3 };
/** A cell is part of the low ground if a corner is this far below the flat ground. */
const EPS = 1e-4;

type Grid = { x0: number; z0: number; nx: number; nz: number; cell: number; ys: Float32Array; low: Uint8Array };

const grids = new Map<boolean, Grid>();

/** The low ground's heights at the grid's corners, and which cells dip below the flat ground. Shared. */
function grid(lite: boolean): Grid {
  const cached = grids.get(lite);
  if (cached) return cached;
  const cell = lite ? CELL.lite : CELL.full;
  const [bx0, bz0, bx1, bz1] = BASIN_BOX;
  const nx = Math.ceil((bx1 - bx0) / cell) + 1;
  const nz = Math.ceil((bz1 - bz0) / cell) + 1;
  const ys = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ys[j * nx + i] = basinY(bx0 + i * cell, bz0 + j * cell);
  const low = new Uint8Array((nx - 1) * (nz - 1));
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      low[j * (nx - 1) + i] = Math.min(ys[a], ys[a + 1], ys[a + nx], ys[a + nx + 1]) < -EPS ? 1 : 0;
    }
  }
  const g = { x0: bx0, z0: bz0, nx, nz, cell, ys, low };
  grids.set(lite, g);
  return g;
}

const surfaces = new Map<boolean, THREE.BufferGeometry>();

/**
 * The low ground as a mesh (`lite`: coarser), with the flat ground's UVs, so a canvas laid on the flat ground (its
 * paint, GroundMarks) lies on it in the same place. Only the cells that dip below the flat ground. Shared, so not
 * disposed.
 */
export function basinSurface(lite: boolean): THREE.BufferGeometry {
  const cached = surfaces.get(lite);
  if (cached) return cached;
  const { x0, z0, nx, nz, cell, ys, low } = grid(lite);
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      pos.set([x, ys[k], z], k * 3);
      uv.set([(x + EXTENT.x) / (2 * EXTENT.x), (EXTENT.z - z) / (2 * EXTENT.z)], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (!low[j * (nx - 1) + i]) continue;
      const a = j * nx + i;
      index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  surfaces.set(lite, g);
  return g;
}

const masks = new Map<boolean, THREE.DataTexture>();

/**
 * An alpha map for a plane laid over the whole flat ground (planeGeometry of EXTENT, turned flat): black where the low
 * ground's mesh takes over, one texel a cell. A cell is cut only if its neighbours are low ground too, so the plane's
 * cut edge, softened by the texture's filtering, stays over the mesh, where the low ground is still almost level with
 * the plane. Shared, so not disposed.
 */
export function basinMask(lite: boolean): THREE.Texture {
  const cached = masks.get(lite);
  if (cached) return cached;
  const { x0, z0, nx, nz, cell, low } = grid(lite);
  const cx = nx - 1;
  const cz = nz - 1;
  const data = new Uint8Array(cx * cz * 4).fill(255);
  for (let j = 1; j < cz - 1; j++) {
    for (let i = 1; i < cx - 1; i++) {
      let cut = true;
      for (let dj = -1; dj <= 1 && cut; dj++) for (let di = -1; di <= 1 && cut; di++) cut = !!low[(j + dj) * cx + i + di];
      if (cut) data.fill(0, (j * cx + i) * 4, (j * cx + i) * 4 + 4);
    }
  }
  // rows run with z, columns with x; the plane's uv runs with x and against z
  const t = new THREE.DataTexture(data, cx, cz, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  const w = cx * cell;
  const d = cz * cell;
  t.repeat.set((2 * EXTENT.x) / w, (-2 * EXTENT.z) / d);
  t.offset.set((-EXTENT.x - x0) / w, (EXTENT.z - z0) / d);
  t.needsUpdate = true;
  masks.set(lite, t);
  return t;
}
