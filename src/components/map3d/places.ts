// DRAFT (map-3d-draft branch): where the campus map's places sit in the 3D
// world. Station areas (src/lib/mapBuildings.ts) attach to their 3D building
// or court. The dorms are not modelled: they get a flat footprint and a name
// only.

import type { EN } from "./campusData";
import type { Vec3 } from "./CampusScene";
import {
  B1_PLACE,
  BLOCKS,
  EXTENT,
  PLATEAU_H,
  SPORTS,
  TRACK,
  fromReal,
  toWorld,
  type Placed,
  type Sport,
  type World,
} from "./geo";

/**
 * A station area: its footprint, the height of its map label (markers float
 * just above it) and the height of its tap area.
 */
export type AreaPlace = Placed & { area: string; labelY: number; height: number };

function blockPlace(name: string): AreaPlace {
  const b = BLOCKS.find((item) => item.name === name)!;
  const { pos, hx, hz, rotY } = b;
  // the blocks stand on the raised ground; the tap area reaches down to the lawn
  const labelY = (b.flat ? 10.4 : 9.6) + PLATEAU_H;
  return { area: name, pos, hx, hz, rotY, labelY, height: (b.flat ? 9.4 : 7.6) + PLATEAU_H };
}

function courtPlace(area: string, sport: Sport): AreaPlace {
  const c = SPORTS.find((s) => s.sport === sport)!;
  return {
    area,
    pos: [(c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2],
    hx: Math.abs(c.x[1] - c.x[0]) / 2,
    hz: Math.abs(c.z[1] - c.z[0]) / 2,
    rotY: 0,
    labelY: 1.8,
    height: 1.2,
  };
}

/** Every area a station can have (the stations_area_building check) except TBD, which has no place yet. */
export const AREA_PLACES: AreaPlace[] = [
  ...["A1", "A2", "A3", "A4", "A5"].map(blockPlace),
  { area: "B1", pos: B1_PLACE.pos, hx: B1_PLACE.hx, hz: B1_PLACE.hz, rotY: B1_PLACE.rotY, labelY: 6, height: 4.8 },
  {
    area: "Track & Field",
    pos: toWorld(TRACK.center),
    hx: TRACK.length / 2,
    hz: TRACK.width / 2,
    rotY: 0,
    labelY: 3,
    height: 1.2,
  },
  courtPlace("Tennis Court", "tennis"),
  courtPlace("Volleyball Court", "volleyball"),
];

export function areaPlace(area: string): AreaPlace | null {
  return AREA_PLACES.find((p) => p.area === area) ?? null;
}

/** The point a marker floats over: the area's label. */
export function labelPoint(p: AreaPlace): Vec3 {
  return [p.pos[0], p.labelY, p.pos[1]];
}

/** Footprint-local point → world. */
export function localToWorld(p: Placed, lx: number, lz: number): World {
  const c = Math.cos(p.rotY);
  const s = Math.sin(p.rotY);
  return [p.pos[0] + lx * c + lz * s, p.pos[1] - lx * s + lz * c];
}

/** Station `i` of `n` in one area, once the area's badge splits: round the footprint, just outside it. */
export function ringPoint(p: AreaPlace, i: number, n: number): Vec3 {
  const a = Math.PI / 4 + (i / n) * Math.PI * 2;
  const [x, z] = localToWorld(p, Math.cos(a) * (p.hx + 2.6), Math.sin(a) * (p.hz + 2.6));
  return [x, p.labelY, z];
}

/** Keep a point on the slab: a fix just off campus still gets a pin, at the edge (as on the 2D map). */
export function clampToSlab([x, z]: World, margin = 1.5): World {
  return [
    Math.min(EXTENT.x - margin, Math.max(-EXTENT.x + margin, x)),
    Math.min(EXTENT.z - margin, Math.max(-EXTENT.z + margin, z)),
  ];
}

/**
 * Dorms and the D6 canteen: building outlines from OpenStreetMap (scripts/map3d/campus.json, metres east and
 * north of the Track & Field GPS point). Not modelled; drawn flat on the ground with their name.
 */
const DORMS_M: { name: string; ring: EN[] }[] = [
  { name: "LY1", ring: [[-477.6, 357.5], [-472.8, 368.3], [-490.8, 376.2], [-480.7, 398.8], [-493.4, 404.4], [-502.5, 384.0], [-521.4, 392.3], [-527.3, 379.2], [-506.8, 370.2], [-516.5, 348.5], [-505.6, 343.7], [-495.8, 365.5]] },
  { name: "LY2", ring: [[-425.4, 364.0], [-417.2, 374.3], [-429.4, 384.0], [-419.7, 396.4], [-430.0, 404.3], [-439.6, 392.0], [-452.5, 402.2], [-460.7, 392.0], [-447.6, 381.6], [-458.1, 368.2], [-447.8, 360.4], [-437.5, 373.6]] },
  { name: "LY3", ring: [[-397.8, 410.3], [-342.4, 417.8], [-350.9, 479.3], [-406.2, 471.8]] },
  { name: "LY4", ring: [[-289.6, 376.3], [-281.4, 386.5], [-293.6, 396.2], [-283.9, 408.7], [-294.2, 416.6], [-303.8, 404.3], [-316.7, 414.5], [-324.9, 404.3], [-311.8, 393.9], [-322.3, 380.5], [-312.0, 372.6], [-301.7, 385.9]] },
  { name: "LY5", ring: [[-217.4, 375.2], [-208.1, 384.4], [-219.1, 395.4], [-208.1, 406.7], [-217.4, 415.7], [-228.3, 404.6], [-240.0, 416.2], [-249.3, 406.9], [-237.5, 395.2], [-249.4, 383.0], [-240.1, 374.1], [-228.3, 386.1]] },
  { name: "LY6", ring: [[-514.8, 440.3], [-506.6, 450.6], [-518.8, 460.3], [-509.2, 472.7], [-519.4, 480.6], [-529.0, 468.3], [-541.9, 478.5], [-550.1, 468.3], [-537.1, 458.0], [-547.5, 444.5], [-537.2, 436.7], [-526.9, 449.9]] },
  { name: "LY7", ring: [[-440.0, 440.6], [-431.7, 450.8], [-444.0, 460.5], [-434.3, 472.9], [-444.6, 480.8], [-454.1, 468.5], [-467.0, 478.7], [-475.3, 468.5], [-462.2, 458.2], [-472.6, 444.8], [-462.4, 436.9], [-452.0, 450.1]] },
  { name: "LY8", ring: [[-292.1, 444.4], [-283.9, 454.7], [-296.1, 464.4], [-286.5, 476.8], [-296.7, 484.7], [-306.3, 472.4], [-319.2, 482.6], [-327.4, 472.4], [-314.4, 462.0], [-324.8, 448.6], [-314.5, 440.8], [-304.2, 454.0]] },
  { name: "LY9", ring: [[-200.9, 445.4], [-191.6, 454.6], [-202.6, 465.7], [-191.6, 476.9], [-200.9, 485.9], [-211.8, 474.8], [-223.5, 486.4], [-232.8, 477.2], [-221.0, 465.4], [-232.9, 453.3], [-223.6, 444.3], [-211.8, 456.3]] },
  { name: "D1", ring: [[-16.9, 308.7], [-12.1, 289.5], [24.9, 303.0], [31.1, 287.4], [49.1, 292.5], [40.2, 314.4], [60.3, 321.2], [55.5, 336.4], [32.1, 328.6], [27.7, 342.8], [13.7, 338.1], [18.8, 321.5]] },
  { name: "D2", ring: [[5.0, 401.8], [10.1, 386.0], [-25.7, 374.7], [-19.7, 356.1], [16.8, 367.6], [22.6, 349.6], [41.2, 355.5], [34.5, 376.3], [53.7, 382.4], [48.4, 398.9], [24.4, 391.4], [19.6, 406.4]] },
  { name: "D3", ring: [[-94.3, 326.3], [-89.9, 309.0], [-68.9, 314.1], [-65.5, 292.5], [-48.8, 295.9], [-53.2, 316.1], [-17.2, 326.6], [-22.0, 344.8], [-52.2, 335.0], [-58.0, 352.6], [-71.9, 348.2], [-67.8, 332.7]] },
  { name: "D4", ring: [[-177.5, 395.0], [-179.9, 376.2], [-135.5, 370.6], [-137.8, 352.3], [-119.7, 350.1], [-117.0, 371.6], [-96.3, 369.0], [-93.9, 388.0], [-120.1, 391.2], [-118.3, 405.5], [-133.1, 407.4], [-135.3, 389.7]] },
  { name: "D5", ring: [[-163.6, 471.3], [-167.4, 451.8], [-146.1, 447.6], [-150.1, 427.6], [-135.5, 424.7], [-132.3, 440.9], [-84.7, 431.5], [-81.0, 450.1], [-121.1, 458.0], [-117.2, 477.5], [-133.3, 480.7], [-136.3, 465.9]] },
  { name: "D6", ring: [[-46.1, 442.0], [-58.3, 433.3], [-64.8, 425.5], [-69.9, 414.7], [-71.9, 402.5], [-65.8, 386.3], [-45.4, 378.2], [-32.5, 382.3], [-19.9, 393.1], [-10.7, 412.3], [-11.4, 428.2], [-18.6, 439.7], [-30.5, 445.5]] },
];

export const DORMS: { name: string; ring: World[]; pos: World }[] = DORMS_M.map(({ name, ring }) => {
  const pts = ring.map(([e, n]) => fromReal(e, n));
  const pos: World = [
    pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
    pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
  ];
  return { name, ring: pts, pos };
});

/** The part of the slab with something on it (buildings, courts, dorms), for fitting the camera: x and z ranges. */
export const CONTENT_BOUNDS = (() => {
  const pts: World[] = [
    ...AREA_PLACES.flatMap((p) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sz]) => localToWorld(p, sx * p.hx, sz * p.hz)),
    ),
    ...DORMS.flatMap((d) => d.ring),
  ];
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return { x: [Math.min(...xs), Math.max(...xs)] as [number, number], z: [Math.min(...zs), Math.max(...zs)] as [number, number] };
})();
