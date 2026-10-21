"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  BLOCKS,
  BRIDGE,
  COLORS,
  FLAG,
  grandstandRect,
  LANDMARK_SCALE,
  STATUE,
  STATUE_ROT_Y,
  UNITS_PER_M,
  type World,
} from "./geo";
import { TanKahKeeStatue } from "./statue";
import { makeFacade, makeGridFacade, makeRoofTiles, makeXmumFlag } from "./textures";

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
      <Box size={[2 * s + 0.4, 0.3, 2 * s + 0.4]} pos={[0, 0.15, 0]} color="#d3cab9" />
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
const PLINTH = 0.3;
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

/**
 * A3: the big 9-level block (photo): white walls with square windows, a tall glass bay over a columned
 * entrance, and a two-tier Chinese roof: wide red eaves with upturned corners and white hips, a set-back
 * storey, and a smaller upper tier with a flat top inside a white ridge frame.
 */
function FlatBlock({ position, rotY, hx, hz, seed, glow }: BlockProps & { hx: number; hz: number }) {
  const H = 7.4;
  const eave = H + 0.3;
  // the set-back storey stands on the lower tier's inner edge
  const cx = hx - 1.3;
  const cz = hz - 1.3;
  // Only the windows glow at night (emissive map), as on the other A-blocks.
  const [wall, storey] = useMemo(() => {
    const lit = (maps: ReturnType<typeof makeGridFacade>) =>
      new THREE.MeshStandardMaterial({ ...maps, roughness: 0.8, emissive: new THREE.Color("#ffffff") });
    const across = (half: number) => Math.max(1, Math.round(half * 0.55));
    return [
      lit(makeGridFacade(seed, { rows: 6, cols: 4, wall: "#f1eee7", glass: "#56677a", repeat: [across(hx), 1.5] })),
      lit(makeGridFacade(seed + 7, { rows: 1, cols: 4, wall: "#5d6a78", glass: "#46525f", repeat: [across(cx), 1] })),
    ];
  }, [seed, hx, cx]);
  wall.emissiveIntensity = glow;
  storey.emissiveIntensity = glow;
  // The front (local +Z) faces the statue and the main road.
  const cols = [-1.2, -0.4, 0.4, 1.2];
  return (
    <group position={position} rotation-y={rotY}>
      <Box size={[2 * hx + 0.5, 0.3, 2 * hz + 0.5]} pos={[0, 0.15, 0]} color="#d3cab9" />
      <mesh position={[0, H / 2 + 0.3, 0]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[2 * hx, H, 2 * hz]} />
      </mesh>
      <Box
        size={[1.8, H - 3.3, 0.12]}
        pos={[0, 3.4 + (H - 3.3) / 2, hz + 0.04]}
        color="#4d5d70"
        emissive={{ color: "#ffcf86", intensity: glow * 0.6 }}
      />
      <Box size={[3.4, 2.4, 1.2]} pos={[0, 1.5, hz + 0.6]} color="#f4f1ea" />
      {cols.map((x) => (
        <Box key={x} size={[0.22, 2.2, 0.22]} pos={[x, 1.4, hz + 1.35]} color="#ffffff" />
      ))}
      <Box size={[3.8, 0.25, 1.8]} pos={[0, 2.6, hz + 0.75]} color="#f4f1ea" />
      <HipRoof hx={1.9} hz={0.95} h={0.6} y={2.7} top={0.25} />
      <RoofTier ox={hx + 0.9} oz={hz + 0.9} w={2.2} h={1.3} lift={0.45} y={eave} />
      <Box size={[2 * cx, 1.1, 2 * cz]} pos={[0, eave + 1.2 + 0.55, 0]} material={storey} />
      <RoofTier ox={cx + 0.6} oz={cz + 0.6} w={1.7} h={1.0} lift={0.35} y={eave + 2.3} top />
    </group>
  );
}

export function Blocks({ glow }: { glow: number }) {
  return (
    <>
      {BLOCKS.map((b, i) =>
        b.flat ? (
          <FlatBlock key={b.name} position={at(b.pos)} rotY={b.rotY} hx={b.hx} hz={b.hz} seed={i + 1} glow={glow} />
        ) : b.name === "A5" ? (
          <A5Block
            key={b.name}
            position={at(b.pos)}
            rotY={b.rotY}
            s={(b.hx + b.hz) / 2 - 0.7}
            seed={i + 1}
            glow={glow}
          />
        ) : (
          <JiagengBlock
            key={b.name}
            position={at(b.pos)}
            rotY={b.rotY}
            s={(b.hx + b.hz) / 2 - 0.7}
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
