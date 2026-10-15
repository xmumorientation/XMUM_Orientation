"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  B1_PLACE,
  BLOCKS,
  BRIDGE,
  COLORS,
  DOME_PLACE,
  FLAGS,
  grandstandRect,
  LETTERS,
  STATUE,
  STATUE_ROT_Y,
  toWorld,
  UNITS_PER_M,
  type World,
} from "./geo";
import { TanKahKeeStatue } from "./statue";
import { makeFacade, makeRoofTiles, makeXmumFlag } from "./textures";

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

const H_BLOCK = 5;

type BlockProps = { position: [number, number, number]; rotY: number; seed: number; glow: number };

/** `s` is the half width of the walls; the roof's eaves reach 0.7 further. */
function JiagengBlock({ position, rotY, s, seed, glow }: BlockProps & { s: number }) {
  const inner = s * 0.42;
  const H = H_BLOCK;
  const outer = useMemo(() => makeFacade(6, 5, seed), [seed]);
  const court = useMemo(() => makeFacade(2, 5, seed + 3), [seed]);
  const tiles = useMemo(makeRoofTiles, []);
  const roof = useMemo(() => ringRoofGeometry(s + 0.7, inner - 0.35, 1.9, 0.85), [s, inner]);
  const r = (s + 0.7 + inner - 0.35) / 2;
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
    <group position={position} rotation-y={rotY}>
      <Box size={[2 * s + 0.4, 0.3, 2 * s + 0.4]} pos={[0, 0.15, 0]} color="#d3cab9" />
      {facades.map(([x, z, ry, w], i) => (
        <mesh key={i} position={[x, H / 2 + 0.3, z]} rotation-y={ry} castShadow receiveShadow>
          <planeGeometry args={[w, H]} />
          <meshStandardMaterial
            map={outer.map}
            emissiveMap={outer.emissiveMap}
            emissive="#ffffff"
            emissiveIntensity={glow}
            roughness={0.85}
          />
        </mesh>
      ))}
      {courtWalls.map(([x, z, ry], i) => (
        <mesh key={i} position={[x, H / 2 + 0.3, z]} rotation-y={ry} receiveShadow>
          <planeGeometry args={[2 * inner, H]} />
          <meshStandardMaterial
            map={court.map}
            emissiveMap={court.emissiveMap}
            emissive="#ffffff"
            emissiveIntensity={glow}
            roughness={0.85}
          />
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
      {/* ridge, with swallowtail ends at each corner */}
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
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz]) => {
        const dir = new THREE.Vector3(sx, 1.3, sz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * (r + 0.2), H + 0.3 + 2.25, sz * (r + 0.2)]}
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

/** A3: the big 9-level block, flat red roof with a pale centre as in the Figma art. */
function FlatBlock({ position, rotY, hx, hz, seed, glow }: BlockProps & { hx: number; hz: number }) {
  const facade = useMemo(() => makeFacade(6, 6, seed), [seed]);
  const mats = useMemo(() => {
    const wall = new THREE.MeshStandardMaterial({
      map: facade.map,
      emissiveMap: facade.emissiveMap,
      emissive: new THREE.Color("#ffffff"),
      roughness: 0.85,
    });
    const top = new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.6 });
    return { wall, list: [wall, wall, top, top, wall, wall] };
  }, [facade]);
  mats.wall.emissiveIntensity = glow;
  const H = 8;
  return (
    <group position={position} rotation-y={rotY}>
      <Box size={[2 * hx + 0.4, 0.3, 2 * hz + 0.4]} pos={[0, 0.15, 0]} color="#d3cab9" />
      <Box size={[2 * hx, H, 2 * hz]} pos={[0, H / 2 + 0.3, 0]} material={mats.list} />
      {[-1, 1].map((sgn) => (
        <Box key={`x${sgn}`} size={[0.4, 0.7, 2 * hz + 0.6]} pos={[sgn * (hx + 0.1), H + 0.65, 0]} color={COLORS.red} />
      ))}
      {[-1, 1].map((sgn) => (
        <Box key={`z${sgn}`} size={[2 * hx + 0.6, 0.7, 0.4]} pos={[0, H + 0.65, sgn * (hz + 0.1)]} color={COLORS.red} />
      ))}
      <Box size={[hx * 1.15, 0.12, hz * 1.15]} pos={[0, H + 0.36, 0]} color={COLORS.white} />
    </group>
  );
}

export function Blocks({ glow }: { glow: number }) {
  return (
    <>
      {BLOCKS.map((b, i) =>
        b.flat ? (
          <FlatBlock key={b.name} position={at(b.pos)} rotY={b.rotY} hx={b.hx} hz={b.hz} seed={i + 1} glow={glow} />
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

// ── B1: white and red building by the courts ─────────────────────────────
/** Modelled 7.6 x 14.5 (long side along local Z), then stretched to the OSM footprint. */
export function B1Building({ glow }: { glow: number }) {
  const fins = [-3, -1.5, 0, 1.5, 3];
  const glass = { color: "#ffcf86", intensity: glow * 0.9 };
  const b = B1_PLACE;
  return (
    <group position={at(b.pos)} rotation-y={b.rotY + Math.PI / 2} scale={[(2 * b.hz) / 7.6, 1, (2 * b.hx) / 14.5]}>
      <Box size={[7.6, 6.5, 14.5]} pos={[0, 3.25, 0]} color={COLORS.white} />
      {fins.map((x) => (
        <Box key={x} size={[0.55, 6.5, 0.5]} pos={[x, 3.25, 7.45]} color={COLORS.red} />
      ))}
      {[1.4, 3.1, 4.8].map((y) => (
        <Box key={y} size={[0.08, 0.75, 13]} pos={[3.84, y, 0]} color="#4f5d6c" emissive={glass} />
      ))}
      {[1.4, 3.1, 4.8].map((y) => (
        <Box key={`b${y}`} size={[0.08, 0.75, 13]} pos={[-3.84, y, 0]} color="#4f5d6c" emissive={glass} />
      ))}
      <Box size={[9.2, 0.3, 6.5]} pos={[0.6, 5.3, -6.2]} color={COLORS.white} />
      <Box size={[5.2, 1.8, 8]} pos={[-0.4, 7.4, -1.8]} color="#e6e6e6" />
      <Box size={[5.3, 0.6, 0.08]} pos={[-0.4, 7.4, 2.25]} color="#4f5d6c" emissive={glass} />
      <Box size={[1.5, 1.5, 1.5]} pos={[-0.8, 9.05, 1.2]} color={COLORS.red} />
      <Box size={[1.3, 1.3, 1.3]} pos={[1.2, 8.95, 2.8]} color={COLORS.red} />
      {/* entrance canopy */}
      <Box size={[2.2, 0.2, 3.4]} pos={[4.6, 2.6, 2]} color={COLORS.white} />
      {[-0.5, 4.5].map((z) => (
        <Box key={z} size={[0.15, 2.5, 0.15]} pos={[5.5, 1.3, z - 1]} color={COLORS.red} />
      ))}
    </group>
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

// ── Tan Kah Kee statue and the flags on the plaza (real size) ────────────
export function Statue() {
  return (
    <group position={at(STATUE)} rotation-y={STATUE_ROT_Y} scale={UNITS_PER_M}>
      <TanKahKeeStatue />
    </group>
  );
}

/** A flagpole with a waving flag, in metres: 12 m pole, 2.4 x 1.6 m flag. */
function Flag({ position, texture, phase }: { position: [number, number, number]; texture: THREE.Texture; phase: number }) {
  const w = 2.4;
  const h = 1.6;
  const geo = useMemo(() => new THREE.PlaneGeometry(w, h, 20, 10).translate(w / 2, 0, 0), []);
  const base = useMemo(() => Float32Array.from(geo.getAttribute("position").array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const k = x / w;
      p.setZ(i, (Math.sin(x * 2.2 - t * 3.4 + phase) * 0.16 + Math.sin(x * 4.1 - t * 5.2) * 0.05) * k);
      p.setY(i, base[i * 3 + 1] - k * k * 0.12);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  // the flag faces the default view (from the north-east)
  return (
    <group position={position} rotation-y={Math.PI / 4} scale={UNITS_PER_M}>
      <mesh position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 12, 8]} />
        <meshStandardMaterial color="#dcdcdc" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 12.1, 0]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color="#e8c46a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={geo} position={[0.08, 11.6 - h / 2, 0]} castShadow>
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Two flagpoles, both flying the XMUM flag. */
export function Flags() {
  const xmum = useMemo(makeXmumFlag, []);
  return (
    <>
      {FLAGS.map((f, i) => (
        <Flag key={i} position={at(f)} texture={xmum} phase={i * 1.3} />
      ))}
    </>
  );
}

// ── LakeFront Café: red dome on a small island ───────────────────────────
export function Dome({ glow }: { glow: number }) {
  return (
    <group
      position={at(DOME_PLACE.pos)}
      rotation-y={DOME_PLACE.rotY}
      scale={[DOME_PLACE.hx / 3.6, 0.8, DOME_PLACE.hz / 3.6]}
    >
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.4, 3.6, 0.6, 40]} />
        <meshStandardMaterial color={COLORS.cream} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[2.9, 2.9, 0.7, 40]} />
        <meshStandardMaterial
          color="#33475a"
          roughness={0.15}
          metalness={0.3}
          emissive="#ffc46b"
          emissiveIntensity={glow * 0.8}
        />
      </mesh>
      <mesh position={[0, 1.3, 0]} scale={[3, 1.5, 3]} castShadow>
        <sphereGeometry args={[1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={COLORS.red} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.5, 8]} />
        <meshStandardMaterial color="#f2f2f2" />
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

// ── "XMUM" hedge letters on the lawn ─────────────────────────────────────
type Seg = [number, number, number, number]; // x1, y1, x2, y2 in letter space
const LETTER_SEGS: Record<string, Seg[]> = {
  X: [
    [0, 0, 2.4, 2.6],
    [0, 2.6, 2.4, 0],
  ],
  M: [
    [0, 0, 0, 2.6],
    [2.4, 0, 2.4, 2.6],
    [0, 2.6, 1.2, 1.1],
    [2.4, 2.6, 1.2, 1.1],
  ],
  U: [
    [0, 0.25, 0, 2.6],
    [2.4, 0.25, 2.4, 2.6],
    [0, 0.25, 2.4, 0.25],
  ],
};

export function Letters() {
  const [ax, az] = toWorld(LETTERS[0]);
  const [bx, bz] = toWorld(LETTERS[1]);
  const len = Math.hypot(bx - ax, bz - az);
  const rot = -Math.atan2(bz - az, bx - ax);
  const pitch = len / 4;
  const stroke = 0.6;
  return (
    <group position={[ax, 0, az]} rotation-y={rot}>
      {"XMUM".split("").map((ch, i) =>
        LETTER_SEGS[ch].map(([x1, y1, x2, y2], j) => {
          const l = Math.hypot(x2 - x1, y2 - y1) + stroke;
          const a = Math.atan2(y2 - y1, x2 - x1);
          return (
            <mesh
              key={`${i}-${j}`}
              position={[i * pitch + 0.6 + (x1 + x2) / 2, (y1 + y2) / 2 + 0.3, 0]}
              rotation-z={a}
              castShadow
            >
              <boxGeometry args={[l, stroke, 0.7]} />
              <meshStandardMaterial color={COLORS.letters} roughness={0.9} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}
