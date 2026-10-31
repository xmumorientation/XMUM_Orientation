"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  A3_PORCH_HALF_M,
  A_FRONT_SIDE,
  A_PORCH_OUT_M,
  BLOCK_PLINTH,
  BLOCKS,
  BRIDGE,
  COLORS,
  FLAG,
  grandstandRect,
  LANDMARK_SCALE,
  PLATEAU_H,
  STATUE,
  STATUE_ROT_Y,
  UNITS_PER_M,
  courtyardWall,
  type World,
} from "./geo";
import { TanKahKeeStatue } from "./statue";
import {
  A3_ROWS,
  makeA3Centre,
  makeA3Facade,
  makeGableFacade,
  makeGridFacade,
  makeRoofTiles,
  makeXmumFlag,
} from "./textures";

// DRAFT: the buildings and landmarks. The A-row, placed and sized from OSM footprints, is modelled on Ben's photos:
// A3 (FlatBlock) on its own, and A1, A2, A4 and A5 alike (GableBlock), in A3's colours.

const at = ([x, z]: World): [number, number, number] => [x, 0, z];

function Box({
  size,
  pos,
  color,
  rotY = 0,
  material,
  emissive,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  color?: string;
  rotY?: number;
  material?: THREE.Material | THREE.Material[];
  emissive?: { color: string; intensity: number };
}) {
  return (
    <mesh position={pos} rotation-y={rotY} castShadow receiveShadow material={material}>
      <boxGeometry args={size} />
      {!material && (
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          emissive={emissive?.color ?? "#000000"}
          emissiveIntensity={emissive?.intensity ?? 0}
        />
      )}
    </mesh>
  );
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One tier of a Chinese roof over a rectangle (A3): from the eaves (half sizes ox, oz) it rises by h over a
 * band w wide to an inner rectangle, left open for the storey above or a flat top. The slope is concave (flat at
 * the eaves, steep near the top) and the outer corners turn up, as on a Minnan roof. heightAt gives the roof height
 * at a point (for the ridges).
 */
function tierRoofGeometry(ox: number, oz: number, w: number, h: number, lift: number) {
  const lin = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const axis = (o: number) => [...lin(-o, w - o, 12), ...lin(w - o, o - w, 6).slice(1), ...lin(o - w, o, 12).slice(1)];
  const xs = axis(ox);
  const zs = axis(oz);
  const at = (x: number, z: number) => {
    const t = Math.min(1, Math.max(0, Math.min(ox - Math.abs(x), oz - Math.abs(z)) / w));
    const k = Math.min(Math.abs(x) / ox, Math.abs(z) / oz);
    return { t, y: h * Math.pow(t, 1.6) + lift * Math.pow(smoothstep(0.55, 1, k), 2) * Math.pow(1 - t, 2) };
  };
  const pos: number[] = [];
  const uv: number[] = [];
  for (const z of zs)
    for (const x of xs) {
      const { t, y } = at(x, z);
      pos.push(x, y, z);
      uv.push(0, t * 3);
    }
  const n = xs.length;
  const idx: number[] = [];
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs((xs[i] + xs[i + 1]) / 2) < ox - w && Math.abs((zs[j] + zs[j + 1]) / 2) < oz - w) continue;
      const a = j * n + i;
      const c = a + n;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, heightAt: (x: number, z: number) => at(x, z).y };
}

const H_BLOCK = 5;

type BlockProps = { position: [number, number, number]; rotY: number; seed: number; glow: number };

type Facade = { map: THREE.Texture; emissiveMap: THREE.Texture };

/** Merges boxes and extrusions into one geometry (one draw call). */
function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

const PLINTH = BLOCK_PLINTH.h;

/** Rotations about +Y that turn a part built on a block's +Z side to each of its four sides. */
const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const fourSides = (parts: THREE.BufferGeometry[]) => TURNS.flatMap((a) => parts.map((g) => g.clone().rotateY(a)));
/** The rotation about +Y that turns a block's +Z side to `side` (degrees from its long side, as geo.ts A_FRONT_SIDE). */
const toSide = (side: number) => ((90 - side) * Math.PI) / 180;

/**
 * A1, A2, A4 and A5 (Ben's photos; all four alike), as shares of the walls' half width `s`: a corner tower `tower`
 * wide at each corner, a gable on each side `gable` wide each way from the middle, and round each corner a red roof
 * that rises from its eaves (where the gables start) to its ridge, `ridge` out from the corner.
 */
const GABLE_PLAN = { tower: 0.26, gable: 0.54, ridge: 0.95 };
/** Heights over the eaves (world units): the gables' apex, the red roofs' ridge, the atrium's glass and its roof. */
const GABLE_RISE = { apex: 2.4, ridge: 2.0, glass: 0.2, dome: 0.2 };
/**
 * The porches of A1, A2, A4 and A5 (photos), alike front and back (and on A5's east side): `half` wide each way, a
 * white canopy `canopy` thick on four square columns `col` thick and `h` tall, standing geo.ts A_PORCH_OUT_M out past
 * the plinth; `steps` steps `run` deep down from the front and east ones (the back's are geo.ts NORTH_STAIRS).
 */
const GABLE_PORCH = { half: 0.62, h: 1.3, canopy: 0.25, col: 0.14, steps: 4, run: 0.12 };

/**
 * The red roof round a block's (s, s) corner (photos: a quarter ring seen from above): from a lip `r0` out from the
 * corner, over the terrace round the tower, its eaves at `r1` rise `rise` (concave) to its ridge at `R`.
 */
function cornerRoofGeometry(s: number, r0: number, r1: number, R: number, eave: number, rise: number) {
  const [nr, na] = [10, 16];
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= nr; j++) {
    const r = r0 + ((R - r0) * j) / nr;
    const k = Math.max(0, (r - r1) / (R - r1));
    const y = eave + 0.04 + (rise - 0.04) * Math.pow(k, 1.25);
    for (let i = 0; i <= na; i++) {
      const a = (Math.PI / 2) * (i / na);
      pos.push(s - r * Math.cos(a), y, s - r * Math.sin(a));
      uv.push((i / na) * 4, ((r - r0) / (R - r0)) * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nr; j++) {
    for (let i = 0; i < na; i++) {
      const a = j * (na + 1) + i;
      const c = a + na + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The atrium's glass (photos): in plan a four-pointed star, the square less a circle `R` round each corner (where the
 * red roofs stop), its points on the sides behind the gables. A band of glass stands from the eaves to `top`, under a
 * low roof up to `peak` in the middle, round a skylight.
 */
function atriumGeometry(s: number, R: number, eave: number, top: number, peak: number) {
  const a = s - R;
  const quarter: [number, number][] = [[-a, s]];
  for (let i = 0; i < 12; i++) {
    const t = ((Math.PI / 2) * i) / 12;
    quarter.push([s - R * Math.cos(t), s - R * Math.sin(t)]);
  }
  // the same for the other three sides, each turned a quarter on from the last
  const outline = [0, 1, 2, 3].flatMap((q) =>
    quarter.map(([x, z]) => {
      let p: [number, number] = [x, z];
      for (let k = 0; k < q; k++) p = [p[1], -p[0]];
      return p;
    }),
  );
  const band = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z))), {
    depth: top - eave,
    bevelEnabled: false,
  })
    .rotateX(Math.PI / 2)
    .translate(0, top, 0);
  const pos: number[] = [];
  outline.forEach(([x, z], i) => {
    const [x2, z2] = outline[(i + 1) % outline.length];
    pos.push(0, peak, 0, x, top, z, x2, top, z2);
  });
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  roof.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  roof.computeVertexNormals();
  const skylight = new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.12, 20).translate(0, peak - 0.03, 0);
  return [band, roof, skylight];
}

/**
 * One porch of a gable block on its +Z wall at `s` (local units): the canopy and columns (`trim`), the canopy's dark
 * flat top (`deck`), and, unless the porch stands on the back landing (`steps` null), its floor and the steps down
 * (`stone`): straight, or fanning out (A5's east side, photo).
 */
function gablePorch(s: number, steps: "straight" | "fan" | null) {
  const { half, h, canopy, col, steps: n, run } = GABLE_PORCH;
  const edge = s + BLOCK_PLINTH.out;
  const front = edge + A_PORCH_OUT_M * UNITS_PER_M;
  const top = PLINTH + h;
  const trim = [
    boxAt(2 * half, canopy, front - s + 0.05, 0, top + canopy / 2, (s - 0.05 + front) / 2),
    ...[-(half - 0.1), -0.32 * half, 0.32 * half, half - 0.1].map((x) =>
      boxAt(col, h, col, x, PLINTH + h / 2, front - 0.12),
    ),
  ];
  const deck = [boxAt(2 * half - 0.16, 0.04, front - s - 0.1, 0, top + canopy + 0.01, (s + front) / 2)];
  const stone = steps
    ? [
        boxAt(2 * (half + 0.2), PLINTH, front - edge + 0.01, 0, PLINTH / 2, (edge + front) / 2),
        ...Array.from({ length: n }, (_, k) => {
          const y = (PLINTH * (n - k)) / (n + 1);
          const w = half + 0.25 + (steps === "fan" ? 0.14 * (k + 1) : 0);
          return boxAt(2 * w, y, run, 0, y / 2, front + (k + 0.5) * run);
        }),
      ]
    : [];
  return { trim, deck, stone };
}

/**
 * A1, A2, A4 and A5's walls, roofs, porches and plinth (local units, walls `s` each way from the middle), with porches
 * on the `front` side (degrees, as geo.ts A_FRONT_SIDE) and the back, and on the east side (local +Z) if `east`.
 * `walls`, `towers` and `centre` (the middle bay of each side) wear makeGableFacade's wall, balcony and centre; `trim`
 * is the white stone (pilasters, gables, ridges, porches), `roofs` the red tiles, `glass` the atrium and the porches'
 * decks, `stone` the plinth and the steps. `bay` is the bays' width.
 */
function gableGeometry(s: number, front: number, east: boolean) {
  const H = H_BLOCK;
  const eave = PLINTH + H;
  const tw = GABLE_PLAN.tower * s;
  // two and a half bays from the middle to each tower: half the one in the middle, then two either side of a
  // pilaster (Ben: windows sparser than the photos)
  const bay = (s - tw) / 2.5;
  const R = GABLE_PLAN.ridge * s;
  const r1 = s - GABLE_PLAN.gable * s;
  const { apex, ridge, glass, dome } = GABLE_RISE;

  // the walls: the texture's bays fall between the pilasters, half a bay and then whole bays out from the middle
  const walls = boxAt(2 * s, H, 2 * s, 0, PLINTH + H / 2, 0);
  const uv = walls.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // BoxGeometry's faces, four corners each: +x, -x, +y, -y, +z, -z; the top and bottom take plain wall
    if (Math.floor(i / 4) === 2 || Math.floor(i / 4) === 3) uv.setXY(i, 0.01, 0.235);
    else uv.setX(i, (((2 * uv.getX(i) - 1) * s) / bay + 0.5) / 4);
  }

  // a tower at each corner, a little proud of both walls and past the eaves, its floors in line with the walls'
  const th = H + 0.3;
  const tower = boxAt(tw + 0.06, th, tw + 0.06, s - tw / 2 + 0.03, PLINTH + th / 2, s - tw / 2 + 0.03);
  const tuv = tower.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setY(i, (tuv.getY(i) * th) / H);

  // on each side: the middle bay, the pilasters, the gable with a finial on its apex, and a corner's ridge
  const centre = boxAt(bay, H, 0.12, 0, PLINTH + H / 2, s + 0.04);
  const gable = new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(-(s - r1), 0), new THREE.Vector2(s - r1, 0), new THREE.Vector2(0, apex)]),
    { depth: 0.18, bevelEnabled: false },
  ).translate(0, eave, s - 0.12);
  const arc = Array.from({ length: 13 }, (_, i) => {
    const t = ((Math.PI / 2) * i) / 12;
    return new THREE.Vector3(s - R * Math.cos(t), eave + ridge + 0.03, s - R * Math.sin(t));
  });
  const side = [
    gable,
    boxAt(0.2, 0.3, 0.2, 0, eave + apex + 0.05, s - 0.03),
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 16, 0.05, 5),
    ...[-1, 1].map((sx) => boxAt(0.09, H, 0.05, sx * 1.5 * bay, PLINTH + H / 2, s + 0.025)),
  ];
  const towerRoof = hipGeometry(tw / 2 + 0.09, tw / 2 + 0.09, 0.4, 0.25).translate(
    s - tw / 2 + 0.03,
    PLINTH + th,
    s - tw / 2 + 0.03,
  );

  // the porches: front and back alike, and A5's east one
  const porches = [
    { at: front, ...gablePorch(s, "straight") },
    { at: front + 180, ...gablePorch(s, null) },
    ...(east ? [{ at: 90, ...gablePorch(s, "fan") }] : []),
  ];
  const turned = (key: "trim" | "deck" | "stone") =>
    porches.flatMap((p) => p[key].map((g) => g.rotateY(toSide(p.at))));

  return {
    walls: merge([walls]),
    towers: merge(fourSides([tower])),
    centre: merge(fourSides([centre])),
    trim: merge([...fourSides(side), ...turned("trim")]),
    roofs: merge(fourSides([cornerRoofGeometry(s, r1 - 0.15, r1, R, eave, ridge), towerRoof])),
    glass: merge([...atriumGeometry(s, R, eave, eave + ridge + glass, eave + ridge + glass + dome), ...turned("deck")]),
    stone: merge([boxAt(2 * (s + BLOCK_PLINTH.out), PLINTH, 2 * (s + BLOCK_PLINTH.out), 0, PLINTH / 2, 0), ...turned("stone")]),
    bay,
  };
}

/**
 * A1, A2, A4 and A5, all alike (Ben's photos, aerial and satellite views), in A3's colours: square, six floors over a
 * colonnade, tall pilasters, slim windows in red frames, a tower with a small red roof at each corner and a framed bay
 * in the middle of each side; on each side a white gable up past the roof; between the gables, round each corner, a
 * red tiled roof that sweeps up from its eaves to a white ridge; in the middle the atrium's glass, star-shaped, round a
 * skylight. A porch on the front (`front`, toward the lawn) and on the back (on the landing before geo.ts
 * NORTH_STAIRS), alike, and on A5 one more on the east side, toward the track (`east`).
 */
function GableBlock({ position, rotY, s, seed, glow, front, east }: BlockProps & { s: number; front: number; east: boolean }) {
  const geo = useMemo(() => gableGeometry(s, front, east), [s, front, east]);
  const tiles = useMemo(makeRoofTiles, []);
  // Only the windows glow at night (emissive map), as on A3.
  const [wall, tower, centre] = useMemo(() => {
    const f = makeGableFacade(seed, geo.bay, H_BLOCK);
    return [f.wall, f.balcony, f.centre].map(
      (maps) => new THREE.MeshStandardMaterial({ ...maps, roughness: 0.8, emissive: new THREE.Color("#ffffff") }),
    );
  }, [seed, geo]);
  for (const m of [wall, tower, centre]) m.emissiveIntensity = glow;
  return (
    <group position={position} rotation-y={rotY}>
      <mesh geometry={geo.stone} castShadow receiveShadow>
        <meshStandardMaterial color="#d3cab9" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.walls} material={wall} castShadow receiveShadow />
      <mesh geometry={geo.towers} material={tower} castShadow receiveShadow />
      <mesh geometry={geo.centre} material={centre} castShadow receiveShadow />
      <mesh geometry={geo.trim} castShadow receiveShadow>
        <meshStandardMaterial color="#f4efe4" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.roofs} castShadow receiveShadow>
        <meshStandardMaterial map={tiles} roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.glass} castShadow receiveShadow>
        <meshStandardMaterial color="#7f8d9b" roughness={0.35} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** One tier of A3's roof: red tiles, white hip ridges; `top` closes it with a flat roof in a white ridge frame. */
function RoofTier(p: { ox: number; oz: number; w: number; h: number; lift: number; y: number; top?: boolean }) {
  const { ox, oz, w, h, lift, y, top } = p;
  const tiles = useMemo(makeRoofTiles, []);
  const { geometry, ridges } = useMemo(() => {
    const r = tierRoofGeometry(ox, oz, w, h, lift);
    const hips = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([sx, sz]) => {
      const pts = Array.from({ length: 11 }, (_, i) => {
        const x = sx * (ox - (i / 10) * w);
        const z = sz * (oz - (i / 10) * w);
        return new THREE.Vector3(x, r.heightAt(x, z) + 0.05, z);
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.08, 5);
    });
    return { geometry: r.geometry, ridges: hips };
  }, [ox, oz, w, h, lift]);
  const ix = ox - w;
  const iz = oz - w;
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial map={tiles} roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {ridges.map((g, i) => (
        <mesh key={i} geometry={g} castShadow>
          <meshStandardMaterial color="#f4f1ea" roughness={0.7} />
        </mesh>
      ))}
      {top && (
        <>
          <Box size={[2 * ix, 0.08, 2 * iz]} pos={[0, h - 0.03, 0]} color="#b8432c" />
          {[-1, 1].map((sg) => (
            <Box key={`x${sg}`} size={[0.18, 0.24, 2 * iz + 0.18]} pos={[sg * ix, h + 0.06, 0]} color="#f4f1ea" />
          ))}
          {[-1, 1].map((sg) => (
            <Box key={`z${sg}`} size={[2 * ix + 0.18, 0.24, 0.18]} pos={[0, h + 0.06, sg * iz]} color="#f4f1ea" />
          ))}
        </>
      )}
    </group>
  );
}

type V3 = [number, number, number];

/**
 * A3's walls: their height above the plinth, and how many bays of windows each half of a wall has between pilasters,
 * past the bay in the middle: three along the long walls, two along the end walls (Ben: sparser than the photos).
 */
const A3_H = 7.4;
const A3_BAYS = 3;
const A3_END_BAYS = 2;
/** How far A3's long walls stand inside its footprint: the plinth in front of them is the porches' terrace. */
const A3_RECESS = 0.55;
/**
 * A3's corners (aerial photo, street view): the long and the end walls stop `w` short of each corner, where a lower
 * block stands `back` behind both, `floors` floors over the tall windows, under a small red roof.
 */
const A3_CORNER = { w: 0.75, back: 0.2, floors: 3 };
/**
 * A3's porches (photos), alike on both long sides: six round columns `r` round and `h` tall, three each side of the
 * doors at `cols` of the porch's half width, under a beam `beam` high and `t` deep whose front bows out `bow` at the
 * middle; the porch's ends stand `depth` out from the wall.
 */
const A3_PORCH = { depth: 0.5, bow: 0.18, cols: [0.3, 0.6, 0.9], r: 0.12, h: 2.2, beam: 0.45, t: 0.26 };
/** Steps down from the front porch's terrace to the paving: as many as A5's, a little deeper. */
const A3_STEPS = { n: 5, run: 0.12, cheek: 0.18 };

/**
 * A box of A3's walls from corner `a` to corner `b` (the smaller coordinates first), UV'd for makeA3Facade: u counts
 * the texture's tiles (four bays: whole bays of about `bayX` across the sides facing ±z, `bayZ` across those facing
 * ±x), v the share of the walls' height above the plinth, so floors line up from box to box.
 */
function a3WallBox(a: V3, b: V3, bayX: number, bayZ: number) {
  const g = boxAt(b[0] - a[0], b[1] - a[1], b[2] - a[2], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry's faces, four corners each: +x, -x, +y, -y, +z, -z
  const bays = [(b[2] - a[2]) / bayZ, (b[2] - a[2]) / bayZ, 0, 0, (b[0] - a[0]) / bayX, (b[0] - a[0]) / bayX];
  for (let i = 0; i < uv.count; i++) {
    const n = bays[Math.floor(i / 4)];
    const v = (a[1] - PLINTH + uv.getY(i) * (b[1] - a[1])) / A3_H;
    // the top and bottom take plain wall
    if (!n) uv.setXY(i, 0.01, 0.26);
    else uv.setXY(i, (uv.getX(i) * Math.max(1, Math.round(n))) / 4, v);
  }
  return g;
}

/**
 * A hipped roof `rh` high on y = 0 over a 2rx x 2rz rectangle, its ridge `ridge` of the width and along z; the
 * hipped ends are as steep as the long sides.
 */
function hipGeometry(rx: number, rz: number, rh: number, ridge: number) {
  const g = new THREE.CylinderGeometry(Math.SQRT2, Math.SQRT2, rh, 4, 1).rotateY(Math.PI / 4);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const inset = rx * (1 - ridge);
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? rx * ridge : rx), p.getY(i) + rh / 2, p.getZ(i) * (top ? rz - inset : rz));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * One of A3's porches, on its +Z wall at `wz`, `half` wide each way (local units): the columns on bases and under
 * capitals, the bowed beam with a cornice along its top, a beam back to the wall at each end, and a flat deck.
 */
function a3Porch(wz: number, half: number) {
  const { depth, bow, cols, r, h, beam, t } = A3_PORCH;
  const top = PLINTH + h + beam;
  // the beam's front: an arc through its ends and its middle
  const R = (half * half + bow * bow) / (2 * bow);
  const zc = wz + depth + bow - R;
  const front = (x: number) => zc + Math.sqrt(R * R - x * x);
  const xs = Array.from({ length: 17 }, (_, i) => -half + (half * i) / 8);
  /** A band in plan across the porch, from `back(x)` to `fwd(x)`, `thick` deep under `y`. */
  const band = (back: (x: number) => number, fwd: (x: number) => number, thick: number, y: number) => {
    const outline = [
      ...xs.map((x) => new THREE.Vector2(x, back(x))),
      ...[...xs].reverse().map((x) => new THREE.Vector2(x, fwd(x))),
    ];
    return new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: thick, bevelEnabled: false })
      .rotateX(Math.PI / 2)
      .translate(0, y, 0);
  };
  const inner = front(half) - t;
  const parts: THREE.BufferGeometry[] = [
    band((x) => front(x) - t, front, beam, top),
    band((x) => front(x) - t - 0.04, (x) => front(x) + 0.05, 0.08, top + 0.04),
    band(() => wz, (x) => front(x) - t, 0.1, top - 0.08),
    ...[-1, 1].map((sx) => boxAt(t, beam, inner - wz, sx * (half - t / 2), top - beam / 2, (wz + inner) / 2)),
  ];
  for (const f of cols) {
    for (const sx of [-1, 1]) {
      const x = sx * f * half;
      const z = front(x) - t / 2;
      parts.push(
        new THREE.CylinderGeometry(r, r * 1.06, h - 0.2, 12).translate(x, PLINTH + h / 2, z),
        boxAt(2 * r + 0.08, 0.1, 2 * r + 0.08, x, PLINTH + 0.05, z),
        boxAt(2 * r + 0.08, 0.1, 2 * r + 0.08, x, PLINTH + h - 0.05, z),
      );
    }
  }
  return parts;
}

/**
 * A3's walls, corners, porches and plinth (local units, half sizes `hx` x `hz` of its footprint): `walls` wear
 * makeA3Facade, `centre` (the middle bay of each wall) makeA3Centre; `trim` is the cream stone (pilasters, porches,
 * ridges), `stone` the plinth with the front steps, `roofs` the corners' red roofs. `wz` is where the long walls
 * stand, `bay` their bays' width, `centreW` their middle bay's.
 */
function a3Geometry(hx: number, hz: number) {
  const H = A3_H;
  const { w: cw, back, floors: cf } = A3_CORNER;
  const wz = hz - A3_RECESS;
  // the long walls run to mx, the end walls to mz, either side of the middle
  const mx = hx - cw;
  const mz = wz - cw;
  // the bay in the middle of each wall is as wide as the others
  const bay = mx / (A3_BAYS + 0.5);
  const endBay = mz / (A3_END_BAYS + 0.5);
  const half = A3_PORCH_HALF_M * UNITS_PER_M;
  const { floors, storeys } = A3_ROWS;
  const floorY = (n: number) => PLINTH + H * (floors[0] + (n * (floors[1] - floors[0])) / storeys);

  // two crossed blocks up to the eaves: the long walls' and the end walls'
  const walls = [
    a3WallBox([-mx, PLINTH, -wz], [mx, PLINTH + H, wz], bay, endBay),
    a3WallBox([-hx, PLINTH, -mz], [hx, PLINTH + H, mz], bay, endBay),
  ];
  const trim: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  // a lower block in each corner, set back from both walls, under a small red roof with a white ridge
  const y = floorY(cf);
  const [x0, x1, z0, z1] = [mx, hx - back, mz, wz - back];
  const rx = (x1 - x0) / 2 + 0.12;
  const rz = (z1 - z0) / 2 + 0.12;
  const [rh, ridge] = [0.28, 0.3];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [cx, cz] = [(sx * (x0 + x1)) / 2, (sz * (z0 + z1)) / 2];
      const [ax, bx] = sx > 0 ? [x0, x1] : [-x1, -x0];
      const [az, bz] = sz > 0 ? [z0, z1] : [-z1, -z0];
      walls.push(a3WallBox([ax, PLINTH, az], [bx, y, bz], bay, endBay));
      roofs.push(hipGeometry(rx, rz, rh, ridge).translate(cx, y, cz));
      trim.push(boxAt(2 * rx * ridge + 0.1, 0.08, 2 * (rz - rx * (1 - ridge)) + 0.1, cx, y + rh + 0.04, cz));
    }
  }

  // pilasters from the ground to the eaves: thicker either side of the middle bay, then between the `n` bays each
  // side, the last flush with the wall's end
  const pilasters = (n: number, b: number, end: number, out: number, along: "x" | "z") => {
    for (let k = 0; k <= n; k++) {
      const [w, d] = k === 0 ? [0.3, 0.16] : [0.2, 0.12];
      const p = k === n ? end - w / 2 : b / 2 + k * b;
      for (const s of [-1, 1]) {
        for (const o of [-1, 1]) {
          trim.push(
            along === "x"
              ? boxAt(w, H, d, s * p, PLINTH + H / 2, o * (out + d / 2))
              : boxAt(d, H, w, o * (out + d / 2), PLINTH + H / 2, s * p),
          );
        }
      }
    }
  };
  pilasters(A3_BAYS, bay, mx, wz, "x");
  pilasters(A3_END_BAYS, endBay, mz, hx, "z");
  // the porches: the front's (+Z, the statue), and the same turned round for the back (the lake)
  const porch = a3Porch(wz, half);
  trim.push(...porch, ...porch.map((g) => g.clone().rotateY(Math.PI)));

  // the plinth, and steps down from the front porch's terrace to the paving between two low cheek walls (the back's
  // are geo.ts NORTH_STAIRS, as wide)
  const { n, run, cheek } = A3_STEPS;
  const edge = hz + BLOCK_PLINTH.out;
  const ch = PLINTH + 0.1;
  const stone = [
    boxAt(2 * (hx + BLOCK_PLINTH.out), PLINTH, 2 * edge, 0, PLINTH / 2, 0),
    ...Array.from({ length: n }, (_, k) => {
      const h = (PLINTH * (n - k)) / (n + 1);
      return boxAt(2 * half, h, run, 0, h / 2, edge + (k + 0.5) * run);
    }),
    ...[-1, 1].map((sx) => boxAt(cheek, ch, n * run, sx * (half + cheek / 2), ch / 2, edge + (n * run) / 2)),
  ];

  // the middle bay of each wall between its thick pilasters, just proud of the wall
  const centreW = bay - 0.3;
  const endW = endBay - 0.3;
  const long = new THREE.PlaneGeometry(centreW, H).translate(0, PLINTH + H / 2, wz + 0.03);
  const end = new THREE.PlaneGeometry(endW, H);
  // the end walls' differs a little: the texture keeps its shape, and its plain edges (clamped) fill any gap
  const euv = end.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < euv.count; i++) euv.setX(i, 0.5 + ((euv.getX(i) - 0.5) * endW) / centreW);
  end.translate(0, PLINTH + H / 2, hx + 0.03).rotateY(Math.PI / 2);
  const centre = [long, end].flatMap((g) => [g, g.clone().rotateY(Math.PI)]);
  return {
    walls: merge(walls),
    centre: merge(centre),
    trim: merge(trim),
    stone: merge(stone),
    roofs: merge(roofs),
    wz,
    bay,
    centreW,
  };
}

/**
 * A3, the big 9-level block (Ben's photos, street view and aerial photos): on all four sides, cream walls between
 * tall pilasters, an arcade on the ground floor, red window frames, arched windows under the eaves and an arched
 * window over three floors in the middle; a lower block under a small red roof in each corner; a porch on each long
 * side, alike (the front faces the statue, the back the lake); and a two-tier Chinese roof all round: a narrow skirt
 * of red eaves with upturned corners and white hips, a short set-back storey of red posts, and a big upper roof with
 * a flat top inside a white ridge frame. The long walls stand A3_RECESS inside the footprint, so the porches stand on
 * the plinth and the back's steps (geo.ts NORTH_STAIRS) still fit before the walk behind.
 */
function FlatBlock({ position, rotY, hx, hz, seed, glow }: BlockProps & { hx: number; hz: number }) {
  const eave = A3_H + PLINTH;
  const geo = useMemo(() => a3Geometry(hx, hz), [hx, hz]);
  // the skirt reaches a little past the walls; the storey stands on its inner edge, the upper roof just past that
  const [ox, oz] = [hx + 0.3, geo.wz + 0.5];
  const skirt = 1.2;
  const cx = ox - skirt;
  const cz = oz - skirt;
  // Only the windows glow at night (emissive map), as on the other A-blocks.
  const [wall, centre, storey] = useMemo(() => {
    const lit = (maps: Facade) =>
      new THREE.MeshStandardMaterial({ ...maps, roughness: 0.8, emissive: new THREE.Color("#ffffff") });
    return [
      lit(makeA3Facade(seed, geo.bay, A3_H)),
      lit(makeA3Centre(geo.centreW, A3_H)),
      lit(
        makeGridFacade(seed + 7, {
          rows: 1,
          cols: 4,
          wall: "#9a3b2a",
          glass: "#38434e",
          repeat: [Math.max(1, Math.round(cx * 0.55)), 1],
        }),
      ),
    ];
  }, [seed, geo, cx]);
  wall.emissiveIntensity = glow;
  centre.emissiveIntensity = glow;
  storey.emissiveIntensity = glow;
  return (
    <group position={position} rotation-y={rotY}>
      <mesh geometry={geo.stone} castShadow receiveShadow>
        <meshStandardMaterial color="#d3cab9" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.walls} material={wall} castShadow receiveShadow />
      <mesh geometry={geo.centre} material={centre} receiveShadow />
      <mesh geometry={geo.trim} castShadow receiveShadow>
        <meshStandardMaterial color="#f4efe4" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.roofs} castShadow receiveShadow>
        <meshStandardMaterial color="#c8452c" roughness={0.6} flatShading />
      </mesh>
      <RoofTier ox={ox} oz={oz} w={skirt} h={0.6} lift={0.3} y={eave} />
      <Box size={[2 * cx, 0.8, 2 * cz]} pos={[0, eave + 0.5 + 0.4, 0]} material={storey} />
      <RoofTier ox={cx + 0.25} oz={cz + 0.25} w={1.7} h={1.1} lift={0.35} y={eave + 1.3} top />
    </group>
  );
}

export function Blocks({ glow }: { glow: number }) {
  return (
    <>
      {BLOCKS.map((b, i) =>
        b.flat ? (
          <FlatBlock
            key={b.name}
            position={[b.pos[0], PLATEAU_H, b.pos[1]]}
            rotY={b.rotY}
            hx={b.hx}
            hz={b.hz}
            seed={i + 1}
            glow={glow}
          />
        ) : (
          <GableBlock
            key={b.name}
            position={[b.pos[0], PLATEAU_H, b.pos[1]]}
            rotY={b.rotY}
            s={courtyardWall(b)}
            seed={i + 1}
            glow={glow}
            front={A_FRONT_SIDE[b.name]}
            east={b.name === "A5"}
          />
        ),
      )}
    </>
  );
}

// ── Grandstand on the track's east side (real footprint, geo.ts) ─────────
export function Grandstand() {
  const g = grandstandRect();
  const len = g.x[1] - g.x[0];
  const depth = g.z[1] - g.z[0];
  const steps = 4;
  const tier = depth / steps;
  const posts = Math.max(3, Math.round(len / 3) + 1);
  // seats rise away from the track (+Z); the roof overhangs the front rows
  return (
    <group position={[(g.x[0] + g.x[1]) / 2, 0, (g.z[0] + g.z[1]) / 2]}>
      {Array.from({ length: steps }, (_, i) => {
        const h = 0.35 + i * 0.32;
        return (
          <Box
            key={i}
            size={[len, h, tier]}
            pos={[0, h / 2, -depth / 2 + tier * (i + 0.5)]}
            color={i % 2 ? COLORS.white : COLORS.red}
          />
        );
      })}
      <Box size={[len + 0.4, 0.14, depth * 0.95]} pos={[0, 2.1, -depth * 0.05]} color={COLORS.white} />
      {Array.from({ length: posts }, (_, i) => (
        <Box
          key={i}
          size={[0.16, 2.1, 0.16]}
          pos={[-len / 2 + (i * len) / (posts - 1), 1.05, depth / 2 - 0.12]}
          color={COLORS.red}
        />
      ))}
    </group>
  );
}

// ── Tan Kah Kee statue and the flags on the plaza (LANDMARK_SCALE x real) ─
export function Statue() {
  return (
    <group position={at(STATUE)} rotation-y={STATUE_ROT_Y} scale={UNITS_PER_M * LANDMARK_SCALE}>
      <TanKahKeeStatue />
    </group>
  );
}

/** The XMUM flag on one big pole, modelled in metres: 15 m pole, 3.6 x 2.4 m flag. */
export function Flag() {
  const w = 3.6;
  const h = 2.4;
  const texture = useMemo(makeXmumFlag, []);
  const geo = useMemo(() => new THREE.PlaneGeometry(w, h, 24, 12).translate(w / 2, 0, 0), []);
  const base = useMemo(() => Float32Array.from(geo.getAttribute("position").array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const k = x / w;
      p.setZ(i, (Math.sin(x * 1.5 - t * 3.4) * 0.24 + Math.sin(x * 2.7 - t * 5.2) * 0.07) * k);
      p.setY(i, base[i * 3 + 1] - k * k * 0.18);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  // the flag faces the default view (from the north-east)
  return (
    <group position={at(FLAG)} rotation-y={Math.PI / 4} scale={UNITS_PER_M * LANDMARK_SCALE}>
      <mesh position={[0, 7.5, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.12, 15, 8]} />
        <meshStandardMaterial color="#dcdcdc" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 15.1, 0]}>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#e8c46a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={geo} position={[0.1, 14.5 - h / 2, 0]} castShadow>
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ── Red footbridge across the lake (OSM) ─────────────────────────────────
export function Bridge() {
  const [[ax, az], [bx, bz]] = BRIDGE;
  const len = Math.hypot(bx - ax, bz - az);
  const rot = -Math.atan2(bz - az, bx - ax);
  const posts = Array.from({ length: 9 }, (_, i) => -len / 2 + (i * len) / 8);
  return (
    <group position={[(ax + bx) / 2, 0, (az + bz) / 2]} rotation-y={rot}>
      <Box size={[len, 0.3, 1.1]} pos={[0, 0.5, 0]} color={COLORS.red} />
      {[-0.5, 0.5].map((z) => (
        <Box key={z} size={[len, 0.1, 0.1]} pos={[0, 1.25, z]} color={COLORS.red} />
      ))}
      {posts.map((x) =>
        [-0.5, 0.5].map((z) => (
          <Box key={`${x}${z}`} size={[0.1, 0.6, 0.1]} pos={[x, 0.95, z]} color={COLORS.red} />
        )),
      )}
      {[-len / 3, 0, len / 3].map((x) => (
        <Box key={x} size={[0.4, 0.45, 0.8]} pos={[x, 0.2, 0]} color="#a3000a" />
      ))}
    </group>
  );
}
