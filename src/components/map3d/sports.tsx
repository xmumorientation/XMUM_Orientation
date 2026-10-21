"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  B1_NORTH_BAYS,
  CARPARK,
  PITCH_M,
  SPORTS,
  TRACK,
  TRACK_M,
  TRACK_LIGHTS_M,
  TRACK_NORTH,
  UNITS_PER_M,
  trackToWorld,
  type CourtBlock,
  type Sport,
} from "./geo";
import { makeGlow } from "./textures";

// DRAFT: the outdoor courts between the track and B1. Each block in
// geo.ts SPORTS is split into courts side by side. Line markings use the
// standard court sizes (in metres) scaled to fit the block, so the courts
// keep real proportions; posts, nets and goals are drawn a little taller
// than life so they read at map zoom. Colours follow an aerial photo of the
// campus: blue-grey hard courts, the tennis courts lightest.

/** Equipment height exaggeration (heights only; positions stay to scale). */
const LIFT = 1.6;

type Spec = { L: number; W: number; area: string; court: string; line: string; key?: string };

/** Playing area (length along the court's long axis, width) in metres, and paint. */
export const SPEC: Record<Sport, Spec> = {
  tennis: { L: 23.77, W: 10.97, area: "#6f7b8c", court: "#7d8c9c", line: "#f5f5f0" },
  basketball: { L: 28, W: 15, area: "#5b6875", court: "#657a87", line: "#f5f5f0", key: "#90949b" },
  // small-sided futsal: three fit across a 40 m block
  futsal: { L: 25, W: 12, area: "#5e6a74", court: "#687680", line: "#f5f5f0" },
  // not visible in the photo; same court family, a little warmer
  volleyball: { L: 18, W: 9, area: "#6a7480", court: "#7a8590", line: "#f5f5f0" },
};

export type Cell = {
  sport: Sport;
  cx: number;
  cz: number;
  /** true when the court's long axis runs along world X */
  alongX: boolean;
  /** world units per metre for this court's markings */
  s: number;
};

export function courtCells(b: CourtBlock): Cell[] {
  const alongX = b.long === "x";
  const [x0, x1] = b.x;
  const [z0, z1] = b.z;
  const spanL = alongX ? x1 - x0 : z1 - z0;
  const spanW = (alongX ? z1 - z0 : x1 - x0) / b.count;
  const spec = SPEC[b.sport];
  // real size, unless the court's share of the block is too small for it
  const s = Math.min(UNITS_PER_M, (spanL * 0.9) / spec.L, (spanW * 0.88) / spec.W);
  const mid = alongX ? (x0 + x1) / 2 : (z0 + z1) / 2;
  const start = alongX ? z0 : x0;
  return Array.from({ length: b.count }, (_, i) => {
    const across = start + spanW * (i + 0.5);
    return { sport: b.sport, cx: alongX ? mid : across, cz: alongX ? across : mid, alongX, s };
  });
}

// ── Ground paint ─────────────────────────────────────────────────────────

/** Paint every court block onto the ground canvas (world-unit transform). */
export function drawCourts(ctx: CanvasRenderingContext2D) {
  // one paved area under all four blocks, a brown kerb between the rows and a
  // planted strip between the west and east blocks (as in the aerial photo)
  const xs = SPORTS.flatMap((b) => b.x);
  const zs = SPORTS.flatMap((b) => b.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  ctx.fillStyle = "#59636d";
  ctx.fillRect(x0 - 0.25, z0 - 0.25, x1 - x0 + 0.5, z1 - z0 + 0.5);
  const south = SPORTS.filter((b) => b.x[1] < (x0 + x1) / 2);
  const north = SPORTS.filter((b) => b.x[0] > (x0 + x1) / 2);
  const rowGap = [Math.max(...south.map((b) => b.x[1])), Math.min(...north.map((b) => b.x[0]))];
  ctx.fillStyle = "#937e6e";
  ctx.fillRect(rowGap[0], z0 - 0.25, rowGap[1] - rowGap[0], z1 - z0 + 0.5);
  const west = SPORTS.filter((b) => b.z[1] < (z0 + z1) / 2);
  const east = SPORTS.filter((b) => b.z[0] > (z0 + z1) / 2);
  const colGap = [Math.max(...west.map((b) => b.z[1])), Math.min(...east.map((b) => b.z[0]))];
  ctx.fillStyle = "#6f8a45";
  ctx.fillRect(x0 - 0.25, colGap[0] + 0.15, x1 - x0 + 0.5, colGap[1] - colGap[0] - 0.3);

  // next to the track's north end: footpath, concrete pad, outdoor gym mat
  const { footpath, pad, gym } = TRACK_NORTH;
  ctx.fillStyle = "#e0a875";
  ctx.fillRect(footpath.x[0], footpath.z[0], footpath.x[1] - footpath.x[0], footpath.z[1] - footpath.z[0]);
  ctx.fillStyle = "#d8cfc6";
  ctx.fillRect(pad.x[0], pad.z[0], pad.x[1] - pad.x[0], pad.z[1] - pad.z[0]);
  ctx.fillStyle = "#3a4642";
  ctx.fillRect(gym.x[0], gym.z[0], gym.x[1] - gym.x[0], gym.z[1] - gym.z[0]);

  for (const b of SPORTS) {
    const spec = SPEC[b.sport];
    ctx.fillStyle = spec.area;
    ctx.fillRect(b.x[0], b.z[0], b.x[1] - b.x[0], b.z[1] - b.z[0]);
    for (const c of courtCells(b)) {
      ctx.save();
      ctx.translate(c.cx, c.cz);
      if (!c.alongX) ctx.rotate(Math.PI / 2);
      ctx.scale(c.s, c.s); // now in metres, long axis along +x
      ctx.lineWidth = 0.07 / c.s;
      ctx.strokeStyle = spec.line;
      ctx.fillStyle = spec.court;
      ctx.fillRect(-spec.L / 2, -spec.W / 2, spec.L, spec.W);
      MARKINGS[b.sport](ctx, spec);
      ctx.restore();
    }
  }
}

const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

const MARKINGS: Record<Sport, (ctx: CanvasRenderingContext2D, s: Spec) => void> = {
  tennis(ctx, { L, W }) {
    ctx.strokeRect(-L / 2, -W / 2, L, W);
    const singles = 8.23 / 2;
    line(ctx, -L / 2, -singles, L / 2, -singles);
    line(ctx, -L / 2, singles, L / 2, singles);
    for (const sx of [-6.4, 6.4]) line(ctx, sx, -singles, sx, singles);
    line(ctx, -6.4, 0, 6.4, 0);
    line(ctx, 0, -W / 2 - 0.9, 0, W / 2 + 0.9); // net line
  },
  basketball(ctx, { L, W, key }) {
    const hx = L / 2;
    for (const sgn of [-1, 1]) {
      // painted key
      ctx.fillStyle = key ?? "#b8654a";
      ctx.fillRect(sgn > 0 ? hx - 5.8 : -hx, -2.45, 5.8, 4.9);
      ctx.strokeRect(sgn > 0 ? hx - 5.8 : -hx, -2.45, 5.8, 4.9);
      ctx.beginPath();
      ctx.arc(sgn * (hx - 5.8), 0, 1.8, 0, Math.PI * 2);
      ctx.stroke();
      // three-point line: straight parts 0.9 m in from the sidelines, then the arc
      const bx = sgn * (hx - 1.575);
      const r = 6.75;
      const y = W / 2 - 0.9;
      const dx = Math.sqrt(r * r - y * y);
      line(ctx, sgn * hx, -y, bx - sgn * dx, -y);
      line(ctx, sgn * hx, y, bx - sgn * dx, y);
      const a = Math.atan2(y, -sgn * dx);
      ctx.beginPath();
      if (sgn > 0) ctx.arc(bx, 0, r, a, 2 * Math.PI - a);
      else ctx.arc(bx, 0, r, -a, a);
      ctx.stroke();
    }
    ctx.strokeRect(-hx, -W / 2, L, W);
    line(ctx, 0, -W / 2, 0, W / 2);
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.stroke();
  },
  futsal(ctx, { L, W }) {
    ctx.strokeRect(-L / 2, -W / 2, L, W);
    line(ctx, 0, -W / 2, 0, W / 2);
    ctx.beginPath();
    ctx.arc(0, 0, 0.075 * L, 0, Math.PI * 2);
    ctx.stroke();
    // penalty areas: quarter circles from each post joined by a short line
    const r = 0.15 * L;
    const post = Math.min(1.5, 0.06 * L);
    for (const sgn of [-1, 1]) {
      const gx = sgn * (L / 2);
      ctx.beginPath();
      ctx.moveTo(gx, -post - r);
      ctx.arc(gx, -post, r, -Math.PI / 2, sgn > 0 ? -Math.PI : 0, sgn > 0);
      ctx.lineTo(gx - sgn * r, post);
      ctx.arc(gx, post, r, sgn > 0 ? Math.PI : 0, Math.PI / 2, sgn > 0);
      ctx.stroke();
    }
  },
  volleyball(ctx, { L, W }) {
    ctx.strokeRect(-L / 2, -W / 2, L, W);
    line(ctx, 0, -W / 2 - 1, 0, W / 2 + 1);
    for (const sx of [-3, 3]) line(ctx, sx, -W / 2, sx, W / 2);
  },
};

// ── 3D equipment ─────────────────────────────────────────────────────────

/** Turn a court-local point (metres along the long axis, metres across) into world [x, z]. */
function toCell(c: Cell, along: number, across: number): [number, number] {
  return c.alongX ? [c.cx + along * c.s, c.cz + across * c.s] : [c.cx + across * c.s, c.cz + along * c.s];
}

const WHITE = "#f4f4f2";

function Post({
  at,
  h,
  r = 0.035,
  color = "#d9d9d9",
}: {
  at: [number, number];
  h: number;
  r?: number;
  color?: string;
}) {
  return (
    <mesh position={[at[0], h / 2, at[1]]} castShadow>
      <cylinderGeometry args={[r, r, h, 6]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
    </mesh>
  );
}

/** A thin vertical panel spanning two ground points (nets, fences). */
function Panel({
  a,
  b,
  y0,
  y1,
  material,
}: {
  a: [number, number];
  b: [number, number];
  y0: number;
  y1: number;
  material: THREE.Material;
}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rot = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (
    <mesh
      position={[(a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2]}
      rotation-y={rot}
      material={material}
      castShadow
    >
      <planeGeometry args={[len, y1 - y0]} />
    </mesh>
  );
}

function meshTexture(diamond: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (diamond) {
    ctx.moveTo(0, 0);
    ctx.lineTo(32, 32);
    ctx.moveTo(32, 0);
    ctx.lineTo(0, 32);
  } else {
    ctx.moveTo(0, 1);
    ctx.lineTo(32, 1);
    ctx.moveTo(1, 0);
    ctx.lineTo(1, 32);
  }
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function useMaterials() {
  return useMemo(() => {
    const fenceAlpha = meshTexture(true);
    fenceAlpha.repeat.set(40, 4);
    const netAlpha = meshTexture(false);
    netAlpha.repeat.set(30, 3);
    return {
      fence: new THREE.MeshStandardMaterial({
        color: "#2f4a3c",
        alphaMap: fenceAlpha,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.3,
      }),
      net: new THREE.MeshStandardMaterial({
        color: "#1d1d1f",
        alphaMap: netAlpha,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
      goalNet: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        alphaMap: netAlpha,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
        roughness: 0.8,
      }),
      tape: new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 }),
    };
  }, []);
}

type Mats = ReturnType<typeof useMaterials>;

function Equipment({ c, mats }: { c: Cell; mats: Mats }) {
  const h = (m: number) => m * c.s * LIFT;
  const spec = SPEC[c.sport];
  if (c.sport === "tennis" || c.sport === "volleyball") {
    const tennis = c.sport === "tennis";
    const half = spec.W / 2 + (tennis ? 0.914 : 1);
    const top = h(tennis ? 1.07 : 2.43);
    const bottom = tennis ? 0.02 : h(1.43);
    const a = toCell(c, 0, -half);
    const b = toCell(c, 0, half);
    return (
      <group>
        <Post at={a} h={top + 0.02} />
        <Post at={b} h={top + 0.02} />
        <Panel a={a} b={b} y0={bottom} y1={top} material={mats.net} />
        <Panel a={a} b={b} y0={top - 0.03} y1={top} material={mats.tape} />
      </group>
    );
  }
  if (c.sport === "basketball") {
    return (
      <group>
        {[-1, 1].map((sgn) => {
          const pole = toCell(c, sgn * (spec.L / 2 + 1.0), 0);
          const board = toCell(c, sgn * (spec.L / 2 - 1.2), 0);
          const rim = toCell(c, sgn * (spec.L / 2 - 1.575), 0);
          const boardW = 1.8 * c.s * LIFT;
          const boardH = 1.05 * c.s * LIFT;
          const rotY = c.alongX ? Math.PI / 2 : 0;
          return (
            <group key={sgn}>
              <Post at={pole} h={h(3.4)} r={0.045} color="#3b3f46" />
              {/* arm from the pole to the board */}
              <mesh
                position={[(pole[0] + board[0]) / 2, h(3.3), (pole[1] + board[1]) / 2]}
                rotation-y={c.alongX ? 0 : Math.PI / 2}
              >
                <boxGeometry args={[Math.hypot(pole[0] - board[0], pole[1] - board[1]), 0.04, 0.04]} />
                <meshStandardMaterial color="#3b3f46" />
              </mesh>
              <mesh position={[board[0], h(3.05) + boardH / 2 - 0.02, board[1]]} rotation-y={rotY} castShadow>
                <boxGeometry args={[boardW, boardH, 0.03]} />
                <meshStandardMaterial color={WHITE} roughness={0.3} />
              </mesh>
              <mesh position={[rim[0], h(3.05), rim[1]]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.23 * c.s * LIFT, 0.012, 6, 16]} />
                <meshStandardMaterial color="#e8662c" roughness={0.4} />
              </mesh>
            </group>
          );
        })}
      </group>
    );
  }
  // futsal goals at both ends, mouths facing the centre
  return (
    <group>
      {[-1, 1].map((sgn) => (
        <Goal
          key={sgn}
          at={toCell(c, sgn * (spec.L / 2), 0)}
          facing={c.alongX ? [-sgn, 0] : [0, -sgn]}
          w={3 * c.s * LIFT}
          h={h(2)}
          depth={1 * c.s * LIFT}
          net={mats.goalNet}
        />
      ))}
    </group>
  );
}

/** A goal: two posts and a crossbar, with a net box behind. `facing` points out of the mouth. */
function Goal({
  at,
  facing,
  w,
  h,
  depth,
  net,
}: {
  at: [number, number];
  facing: [number, number];
  w: number;
  h: number;
  depth: number;
  net: THREE.Material;
}) {
  // local +z = the direction the mouth faces; the net sits on local -z
  const rotY = Math.atan2(facing[0], facing[1]);
  const bar = Math.max(0.035, w * 0.02);
  return (
    <group position={[at[0], 0, at[1]]} rotation-y={rotY}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * w) / 2, h / 2, 0]} castShadow>
          <boxGeometry args={[bar, h, bar]} />
          <meshStandardMaterial color={WHITE} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[w + bar, bar, bar]} />
        <meshStandardMaterial color={WHITE} />
      </mesh>
      <mesh position={[0, h / 2, -depth / 2]} material={net}>
        <boxGeometry args={[w, h, depth]} />
      </mesh>
    </group>
  );
}

/** Courts' posts, nets, goals and hoops, fences round each block, and floodlights. */
export function SportsCourts({ glow }: { glow: number }) {
  const mats = useMaterials();
  const cells = useMemo(() => SPORTS.flatMap(courtCells), []);
  const glowTex = useMemo(makeGlow, []);
  const fenceH = 3.2 * UNITS_PER_M * LIFT;
  return (
    <group>
      {cells.map((c, i) => (
        <Equipment key={i} c={c} mats={mats} />
      ))}
      {SPORTS.filter((b) => b.fence).map((b, i) => {
        const corners: [number, number][] = [
          [b.x[0], b.z[0]],
          [b.x[1], b.z[0]],
          [b.x[1], b.z[1]],
          [b.x[0], b.z[1]],
        ];
        return (
          <group key={i}>
            {corners.map((p, k) => (
              <group key={k}>
                <Panel a={p} b={corners[(k + 1) % 4]} y0={0} y1={fenceH} material={mats.fence} />
                <Post at={p} h={fenceH + 0.03} r={0.03} color="#2f4a3c" />
              </group>
            ))}
          </group>
        );
      })}
      <Floodlights glow={glow} glowTex={glowTex} />
      <ParkedCars />
      <OutdoorGym />
    </group>
  );
}

/** A few low exercise frames on the gym mat. */
function OutdoorGym() {
  const { gym } = TRACK_NORTH;
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 2; i++)
      for (let k = 0; k < 3; k++) {
        out.push([
          gym.x[0] + ((i + 0.5) * (gym.x[1] - gym.x[0])) / 2,
          gym.z[0] + ((k + 0.5) * (gym.z[1] - gym.z[0])) / 3,
        ]);
      }
    return out;
  }, [gym]);
  const h = 1.8 * UNITS_PER_M * LIFT;
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={(i % 3) * 0.6}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.16, h / 2, 0]} castShadow>
              <boxGeometry args={[0.04, h, 0.04]} />
              <meshStandardMaterial color={i % 2 ? "#2f8f6a" : "#e0a12e"} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, h, 0]} castShadow>
            <boxGeometry args={[0.36, 0.04, 0.04]} />
            <meshStandardMaterial color={i % 2 ? "#2f8f6a" : "#e0a12e"} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── B1's service road and parking ────────────────────────────────────────

const BAY = { w: 2.5 * UNITS_PER_M, d: 5 * UNITS_PER_M };

/**
 * One row of bays along B1's south face (the rest of the strip is the service road), and the row along the north
 * side of B1's north road (B1_NORTH_BAYS; b1.tsx paints them).
 */
function bays() {
  const [, x1] = CARPARK.x;
  const [z0, z1] = CARPARK.z;
  const n = Math.floor((z1 - z0) / BAY.w);
  const south = Array.from({ length: n }, (_, i) => ({ x: x1 - BAY.d / 2, z: z0 + (i + 0.5) * BAY.w }));
  return [...south, ...B1_NORTH_BAYS.map(([x, z]) => ({ x, z }))];
}

export function drawCarPark(ctx: CanvasRenderingContext2D) {
  const [x0, x1] = CARPARK.x;
  const [z0, z1] = CARPARK.z;
  const [r0, r1] = CARPARK.road;
  if (x1 - x0 < BAY.d * 1.6) return;
  // the road, from B1's west road (a round corner on its outer side) to the east road
  ctx.fillStyle = "#7f725f";
  ctx.beginPath();
  ctx.roundRect(x0, r0, x1 - x0, r1 - r0, [1.2, 0, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 0.05;
  for (let z = z0; z <= z1 + 1e-6; z += BAY.w) {
    ctx.beginPath();
    ctx.moveTo(x1 - BAY.d, z);
    ctx.lineTo(x1, z);
    ctx.stroke();
  }
  // centre line of the service road
  const road = (x0 + x1 - BAY.d) / 2;
  ctx.setLineDash([0.5, 0.4]);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.moveTo(road, r0 + 1.2);
  ctx.lineTo(road, r1 - 0.3);
  ctx.stroke();
  ctx.setLineDash([]);
}

const CAR_COLORS = ["#e9e9e9", "#1f2328", "#9aa3ad", "#b3262a", "#2d4e7e", "#d8d2c4", "#5a5f66"];

function ParkedCars() {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const cabins = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => {
    if (CARPARK.x[1] - CARPARK.x[0] < BAY.d * 1.6) return [];
    let seed = 41;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return bays()
      .filter(() => r() < 0.62)
      .map((b) => ({ ...b, color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] }));
  }, []);
  useLayoutEffect(() => {
    if (!bodies.current || !cabins.current) return;
    const L = 4.4 * UNITS_PER_M;
    const W = 1.8 * UNITS_PER_M;
    const H = 1.4 * UNITS_PER_M * LIFT;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    cars.forEach((car, i) => {
      // long axis along X, nose toward the aisle
      m.makeScale(L, H * 0.55, W).setPosition(car.x, (H * 0.55) / 2 + 0.02, car.z);
      bodies.current!.setMatrixAt(i, m);
      bodies.current!.setColorAt(i, c.set(car.color));
      m.makeScale(L * 0.55, H * 0.45, W * 0.9).setPosition(car.x, H * 0.55 + (H * 0.45) / 2, car.z);
      cabins.current!.setMatrixAt(i, m);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    cabins.current.instanceMatrix.needsUpdate = true;
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
  }, [cars]);
  if (!cars.length) return null;
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, cars.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={cabins} args={[undefined, undefined, cars.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2a3440" roughness={0.15} metalness={0.5} />
      </instancedMesh>
    </group>
  );
}

/** A floodlight pole with its lamp head turned toward `target`. */
function Floodlight({
  at,
  target,
  glow,
  height = 3.6,
}: {
  at: [number, number];
  target: [number, number];
  glow: number;
  height?: number;
}) {
  const toward = Math.atan2(target[0] - at[0], target[1] - at[1]);
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, height, 6]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.35} />
      </mesh>
      <group position={[0, height + 0.12, 0]} rotation-y={toward}>
        <mesh rotation-x={0.35}>
          <boxGeometry args={[0.6, 0.34, 0.08]} />
          <meshStandardMaterial color="#e9eef2" emissive="#fff6e0" emissiveIntensity={glow * 1.2} />
        </mesh>
      </group>
    </group>
  );
}

/** Tall lights at the outer corners of the court area, lit at dusk and night. */
function Floodlights({ glow, glowTex }: { glow: number; glowTex: THREE.Texture }) {
  const { spots, center } = useMemo(() => {
    const xs = SPORTS.flatMap((b) => b.x);
    const zs = SPORTS.flatMap((b) => b.z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const zm = (z0 + z1) / 2;
    return {
      spots: [
        [x0 - 0.4, z0 - 0.4],
        [x0 - 0.4, zm],
        [x0 - 0.4, z1 + 0.4],
        [x1 + 0.3, z0 - 0.4],
        [x1 + 0.3, z1 + 0.4],
      ] as [number, number][],
      center: [(x0 + x1) / 2, zm] as [number, number],
    };
  }, []);
  return (
    <group>
      {spots.map((p, i) => (
        <Floodlight key={i} at={p} target={center} glow={glow} />
      ))}
      {/* light falling on the courts at night */}
      {glow > 0 &&
        SPORTS.map((b, i) => (
          <mesh
            key={i}
            position={[(b.x[0] + b.x[1]) / 2, 0.06, (b.z[0] + b.z[1]) / 2]}
            rotation-x={-Math.PI / 2}
            renderOrder={2}
          >
            <planeGeometry args={[(b.x[1] - b.x[0]) * 1.5, (b.z[1] - b.z[0]) * 1.5]} />
            <meshBasicMaterial
              map={glowTex}
              transparent
              opacity={Math.min(0.5, glow * 0.12)}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
    </group>
  );
}

// ── Track: football goals and floodlights ────────────────────────────────

export function TrackFixtures({ glow }: { glow: number }) {
  const mats = useMaterials();
  const s = TRACK.length / TRACK_M.length;
  const a = (TRACK.angleDeg * Math.PI) / 180;
  const along: [number, number] = [Math.cos(a), Math.sin(a)];
  const center = trackToWorld(0, 0);
  return (
    <group>
      {[-1, 1].map((sgn) => (
        <Goal
          key={sgn}
          at={trackToWorld((sgn * PITCH_M.length) / 2, 0)}
          facing={[-sgn * along[0], -sgn * along[1]]}
          w={7.32 * s * LIFT}
          h={2.44 * s * LIFT}
          depth={2 * s * LIFT}
          net={mats.goalNet}
        />
      ))}
      {TRACK_LIGHTS_M.map(([lx, ly], i) => (
        <Floodlight key={i} at={trackToWorld(lx, ly)} target={center} glow={glow} height={4.2} />
      ))}
    </group>
  );
}
