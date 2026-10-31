"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  A3_PORCH_HALF_M,
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
  makeFacade,
  makeGridFacade,
  makeRoofTiles,
  makeXmumFlag,
} from "./textures";

// DRAFT: the buildings and landmarks. A1–A5 follow the Jiageng style of
// Xiamen University (cream walls, red brick, curved red-tile roofs with
// upturned eaves) as courtyard blocks, placed and sized from OSM footprints.

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
 * A hipped roof around a courtyard: a ring that rises from the outer and
 * inner eaves to a square ridge. The slope is concave (flat at the eaves,
 * steep near the ridge) and the outer corners turn up, as on a Minnan roof.
 */
function ringRoofGeometry(sOut: number, sIn: number, h: number, lift: number) {
  const lin = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const coords = [...lin(-sOut, -sIn, 14), ...lin(-sIn, sIn, 8).slice(1), ...lin(sIn, sOut, 14).slice(1)];
  const n = coords.length;
  const half = (sOut - sIn) / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = coords[i];
      const z = coords[j];
      const m = Math.max(Math.abs(x), Math.abs(z));
      const dOut = sOut - m;
      const dIn = m - sIn;
      const t = Math.min(1, Math.max(0, Math.min(dOut, dIn) / half));
      let y = h * Math.pow(t, 1.6);
      if (dOut < dIn) {
        const k = Math.min(Math.abs(x), Math.abs(z)) / sOut;
        y += lift * Math.pow(smoothstep(0.55, 1, k), 2) * Math.pow(1 - t, 2);
      }
      pos.push(x, y, z);
      uv.push(0, t * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const cx = (coords[i] + coords[i + 1]) / 2;
      const cz = (coords[j] + coords[j + 1]) / 2;
      if (Math.abs(cx) < sIn && Math.abs(cz) < sIn) continue; // courtyard
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
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
 * One tier of a Chinese roof over a rectangle (A3): from the eaves (half sizes ox, oz) it rises by h over a
 * band w wide to an inner rectangle, left open for the storey above or a flat top. Concave slope and
 * upturned outer corners, as in ringRoofGeometry. heightAt gives the roof height at a point (for the ridges).
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

/** A wall whose emissive map lights its windows at night. */
function FacadeMaterial({ maps, glow }: { maps: Facade; glow: number }) {
  return <meshStandardMaterial {...maps} emissive="#ffffff" emissiveIntensity={glow} roughness={0.85} />;
}

/** The ridge of a courtyard block's roof, as a distance from its centre. */
const ridgeOf = (s: number) => (s + 0.7 + s * 0.42 - 0.35) / 2;

/**
 * The courtyard block (A1, A2, A4, A5): walls round a garden court under a ring roof with a red ridge.
 * `s` is the half width of the walls; the roof's eaves reach 0.7 further. `lift` turns up the roof's corners.
 */
function Courtyard({ s, outer, court, lift, glow }: { s: number; outer: Facade; court: Facade; lift: number; glow: number }) {
  const inner = s * 0.42;
  const H = H_BLOCK;
  const tiles = useMemo(makeRoofTiles, []);
  const roof = useMemo(() => ringRoofGeometry(s + 0.7, inner - 0.35, 1.9, lift), [s, inner, lift]);
  const r = ridgeOf(s);
  const facades: [number, number, number, number][] = [
    [0, s, 0, 2 * s],
    [0, -s, Math.PI, 2 * s],
    [s, 0, Math.PI / 2, 2 * s],
    [-s, 0, -Math.PI / 2, 2 * s],
  ];
  const courtWalls: [number, number, number][] = [
    [0, inner, Math.PI],
    [0, -inner, 0],
    [inner, 0, -Math.PI / 2],
    [-inner, 0, Math.PI / 2],
  ];
  return (
    <>
      <Box
        size={[2 * (s + BLOCK_PLINTH.out), BLOCK_PLINTH.h, 2 * (s + BLOCK_PLINTH.out)]}
        pos={[0, BLOCK_PLINTH.h / 2, 0]}
        color="#d3cab9"
      />
      {facades.map(([x, z, ry, w], i) => (
        <mesh key={i} position={[x, H / 2 + 0.3, z]} rotation-y={ry} castShadow receiveShadow>
          <planeGeometry args={[w, H]} />
          <FacadeMaterial maps={outer} glow={glow} />
        </mesh>
      ))}
      {courtWalls.map(([x, z, ry], i) => (
        <mesh key={i} position={[x, H / 2 + 0.3, z]} rotation-y={ry} receiveShadow>
          <planeGeometry args={[2 * inner, H]} />
          <FacadeMaterial maps={court} glow={glow} />
        </mesh>
      ))}
      {/* courtyard garden */}
      <mesh position={[0, 0.31, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2 * inner, 2 * inner]} />
        <meshStandardMaterial color="#7d9a55" roughness={1} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial color="#3f8f3b" flatShading roughness={0.9} />
      </mesh>
      {/* roof */}
      <mesh geometry={roof} position={[0, H + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={tiles} roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* ridge */}
      {[0, 1].map((k) =>
        [-1, 1].map((sgn) => (
          <Box
            key={`${k}${sgn}`}
            size={[2 * r + 0.3, 0.22, 0.24]}
            pos={k ? [sgn * r, H + 0.3 + 1.96, 0] : [0, H + 0.3 + 1.96, sgn * r]}
            rotY={k ? Math.PI / 2 : 0}
            color="#9b1b14"
          />
        )),
      )}
    </>
  );
}

const CORNERS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** A1, A2 and A4: cream walls, brick pilasters, arched windows; the ridge ends in swallowtails at each corner. */
function JiagengBlock({ position, rotY, s, seed, glow }: BlockProps & { s: number }) {
  const outer = useMemo(() => makeFacade(6, 5, seed), [seed]);
  const court = useMemo(() => makeFacade(2, 5, seed + 3), [seed]);
  const r = ridgeOf(s);
  return (
    <group position={position} rotation-y={rotY}>
      <Courtyard s={s} outer={outer} court={court} lift={0.85} glow={glow} />
      {CORNERS.map(([sx, sz]) => {
        const dir = new THREE.Vector3(sx, 1.3, sz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * (r + 0.2), H_BLOCK + 0.3 + 2.25, sz * (r + 0.2)]}
            quaternion={q}
            castShadow
          >
            <coneGeometry args={[0.1, 0.8, 5]} />
            <meshStandardMaterial color="#9b1b14" roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Merges boxes and extrusions into one geometry (one draw call). */
function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A curved Dutch gable (photo) standing on y = 0, 2w wide: curved shoulders, a neck, a round top. */
function dutchGable(w: number) {
  const n = w * 0.58;
  const sh = new THREE.Shape();
  sh.moveTo(-w, 0);
  sh.lineTo(w, 0);
  sh.lineTo(w, 0.3);
  sh.quadraticCurveTo(n, 0.3, n, 0.85);
  sh.lineTo(n, 1.3);
  sh.absarc(0, 1.3, n, 0, Math.PI, false);
  sh.lineTo(-n, 0.85);
  sh.quadraticCurveTo(-n, 0.3, -w, 0.3);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false, curveSegments: 10 });
}

const A5_WALL = { wall: "#f4f1ea", glass: "#4f6072", repeat: [1, 1] as [number, number] };
const PLINTH = BLOCK_PLINTH.h;
/** Corner towers: half width, height (they rise past the eaves) and inset of their centres from the walls. */
const A5_TOWER = { half: 0.65, h: H_BLOCK + 1.4, inset: 0.5 };
/** Entrance: the bay stands `out` past the wall, beyond the eaves (0.7); porch, steps and ramps in front. */
const A5_BAY = { half: 1.3, out: 0.75 };
const A5_PORCH = { half: 1.6, depth: 1.25, steps: 3, stepRun: 0.25, stepHalf: 1.1, ramp: 1.2 };

/**
 * A5 (photo): white walls with square windows, a tower with a small hipped roof at each corner, and the main
 * entrance on the side facing the track (local +Z): a bay under a curved Dutch gable with a gabled roof
 * behind it, a porch on columns over glass doors, then steps between two ramps.
 */
function A5Block({ position, rotY, s, seed, glow }: BlockProps & { s: number }) {
  const H = H_BLOCK;
  const y0 = PLINTH;
  const towerAt = s - A5_TOWER.inset;
  const front = s + A5_BAY.out;
  const maps = useMemo(
    () => ({
      outer: makeGridFacade(seed, { rows: 6, cols: 6, ...A5_WALL }),
      court: makeGridFacade(seed + 3, { rows: 6, cols: 2, ...A5_WALL }),
      tower: makeGridFacade(seed + 5, { rows: 8, cols: 1, ...A5_WALL }),
      bay: makeGridFacade(seed + 6, { rows: 6, cols: 2, ...A5_WALL }),
    }),
    [seed],
  );
  const geo = useMemo(() => {
    const { half: th, h: tH } = A5_TOWER;
    const { half: bh } = A5_BAY;
    const p = A5_PORCH;
    const top = PLINTH + H_BLOCK;
    const towers = merge(
      CORNERS.map(([sx, sz]) => boxAt(2 * th, tH, 2 * th, sx * towerAt, PLINTH + tH / 2, sz * towerAt)),
    );
    // white trim: the porch roof and its columns
    const trim = merge([
      boxAt(2 * p.half - 0.2, 0.16, p.depth + 0.05, 0, PLINTH + 1.3, front + p.depth / 2 - 0.02),
      ...[-1.35, -0.8, 0.8, 1.35].map((x) => boxAt(0.16, 1.22, 0.16, x, PLINTH + 0.61, front + p.depth - 0.15)),
    ]);
    // stone: the porch floor, steps down its middle and a ramp each side
    const rampW = p.half - p.stepHalf;
    const rampSide = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(p.ramp, 0), new THREE.Vector2(0, PLINTH)]);
    const stone = merge([
      boxAt(2 * p.half, PLINTH, p.depth, 0, PLINTH / 2, front + p.depth / 2),
      ...Array.from({ length: p.steps }, (_, k) => {
        const h = (PLINTH * (p.steps - k)) / (p.steps + 1);
        return boxAt(2 * p.stepHalf, h, p.stepRun, 0, h / 2, front + p.depth + (k + 0.5) * p.stepRun);
      }),
      ...[-1, 1].map((sg) =>
        new THREE.ExtrudeGeometry(rampSide, { depth: rampW, bevelEnabled: false })
          .rotateY(-Math.PI / 2)
          .translate(sg * p.stepHalf + (sg > 0 ? rampW : 0), 0, front + p.depth),
      ),
    ]);
    // the gable, and a gabled roof behind it that runs back into the main roof
    const roofSide = new THREE.Shape([new THREE.Vector2(-bh, 0), new THREE.Vector2(bh, 0), new THREE.Vector2(0, 1.3)]);
    const gableRoof = new THREE.ExtrudeGeometry(roofSide, { depth: 1.6, bevelEnabled: false }).translate(0, top, front - 1.8);
    const gable = dutchGable(bh).translate(0, top, front - 0.2);
    return { towers, trim, stone, gableRoof, gable };
  }, [towerAt, front]);
  return (
    <group position={position} rotation-y={rotY}>
      <Courtyard s={s} outer={maps.outer} court={maps.court} lift={0} glow={glow} />
      <mesh geometry={geo.towers} castShadow receiveShadow>
        <FacadeMaterial maps={maps.tower} glow={glow} />
      </mesh>
      {CORNERS.map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[sx * towerAt, 0, sz * towerAt]}>
          <HipRoof hx={A5_TOWER.half + 0.15} hz={A5_TOWER.half + 0.15} h={0.8} y={y0 + A5_TOWER.h} top={0.2} />
        </group>
      ))}
      {/* entrance bay, from the ground up to the eaves */}
      <mesh position={[0, (y0 + H) / 2, (s + front) / 2]} castShadow receiveShadow>
        <boxGeometry args={[2 * A5_BAY.half, y0 + H, A5_BAY.out]} />
        <FacadeMaterial maps={maps.bay} glow={glow} />
      </mesh>
      <mesh geometry={geo.gable} castShadow receiveShadow>
        <meshStandardMaterial color="#f8f5ee" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.gableRoof} castShadow receiveShadow>
        <meshStandardMaterial color="#c8452c" roughness={0.6} flatShading />
      </mesh>
      <Box
        size={[0.45, 0.5, 0.06]}
        pos={[0, y0 + H + 1.25, front + 0.01]}
        color="#4d5d70"
        emissive={{ color: "#ffcf86", intensity: glow * 0.9 }}
      />
      <Box
        size={[1.4, 1.0, 0.04]}
        pos={[0, y0 + 0.5, front + 0.02]}
        color="#4d5d70"
        emissive={{ color: "#ffcf86", intensity: glow * 0.9 }}
      />
      <mesh geometry={geo.trim} castShadow receiveShadow>
        <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.stone} castShadow receiveShadow>
        <meshStandardMaterial color="#d3cab9" roughness={0.9} />
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

/** Hipped roof over a hx x hz rectangle: a four-sided frustum, red tiles, rising to a white ridge. */
function HipRoof({ hx, hz, h, y, top = 0.35 }: { hx: number; hz: number; h: number; y: number; top?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(top * Math.SQRT2, Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4);
    g.scale(hx, 1, hz);
    g.computeVertexNormals();
    return g;
  }, [hx, hz, h, top]);
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geo} position={[0, h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#c8452c" roughness={0.6} flatShading />
      </mesh>
      <Box size={[2 * hx * top + 0.2, 0.18, 2 * hz * top + 0.2]} pos={[0, h + 0.09, 0]} color="#f4f1ea" />
    </group>
  );
}

type V3 = [number, number, number];

/**
 * A3's walls: their height above the plinth, and their bays between pilasters each side of a double one in the middle
 * (photos): six along the long walls, four along the end walls.
 */
const A3_H = 7.4;
const A3_BAYS = 6;
const A3_END_BAYS = 4;
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
  const bay = mx / A3_BAYS;
  const endBay = mz / A3_END_BAYS;
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

  // pilasters from the ground to the eaves: thicker either side of the middle, flush with the walls' ends
  const pilasters = (n: number, b: number, end: number, out: number, along: "x" | "z") => {
    for (let k = 1; k <= n; k++) {
      const [w, d] = k === 1 ? [0.3, 0.16] : [0.2, 0.12];
      const p = k === n ? end - w / 2 : k * b;
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
  const centreW = 2 * bay - 0.3;
  const long = new THREE.PlaneGeometry(centreW, H).translate(0, PLINTH + H / 2, wz + 0.03);
  const end = new THREE.PlaneGeometry(2 * endBay - 0.3, H).translate(0, PLINTH + H / 2, hx + 0.03).rotateY(Math.PI / 2);
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
        ) : b.name === "A5" ? (
          <A5Block
            key={b.name}
            position={[b.pos[0], PLATEAU_H, b.pos[1]]}
            rotY={b.rotY}
            s={courtyardWall(b)}
            seed={i + 1}
            glow={glow}
          />
        ) : (
          <JiagengBlock
            key={b.name}
            position={[b.pos[0], PLATEAU_H, b.pos[1]]}
            rotY={b.rotY}
            s={courtyardWall(b)}
            seed={i + 1}
            glow={glow}
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
