"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { drawB1Crossing, drawB1Grounds } from "./b1";
import {
  A_FRONT,
  B1_PLACE,
  BLOCKS,
  COLORS,
  EXTENT,
  FOOTPATH_W,
  FOOTPATHS,
  FUNFAIR_LAND,
  GROUND,
  LAKE,
  LANDMARK_SCALE,
  PITCH_M,
  type Placed,
  STATUE,
  TRACK,
  TRACK_M,
  toWorld,
  UNITS_PER_M,
  type Img,
  type World,
} from "./geo";
import { campusTrees, plantation, thinForLite } from "./plants";
import { drawCarPark, drawCourts } from "./sports";
import { BED } from "./statue";
import { makeSoil } from "./textures";

// DRAFT: the flat parts of the map (roads, paths, lawns, lakebeds, track)
// are painted onto one top-down canvas and laid on the ground plane.

// canvas px per world unit (lite mode: about a quarter of the pixels)
const PX_FULL = 20;
const PX_LITE = 10;

/** The darker outline on each side of a walkway (world units, about 1.1 m). */
const PATH_EDGE = 0.16;
/** The kerb round the grey paving (world units, about 0.6 m). */
const KERB = 0.09;

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function makeGroundTexture(lite: boolean): THREE.CanvasTexture {
  const PX = lite ? PX_LITE : PX_FULL;
  const canvas = document.createElement("canvas");
  canvas.width = EXTENT.x * 2 * PX;
  canvas.height = EXTENT.z * 2 * PX;
  const ctx = canvas.getContext("2d")!;
  const r = rng(11);

  // world (x, z) → canvas px
  ctx.setTransform(PX, 0, 0, PX, EXTENT.x * PX, EXTENT.z * PX);

  const img = (pts: readonly Img[]) => pts.map(toWorld);
  const trace = (pts: readonly World[]) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(x, z);
      else ctx.lineTo(x, z);
    });
  };
  const poly = (pts: readonly World[], color: string) => {
    trace(pts);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const stroke = (pts: readonly World[], width: number, color: string) => {
    trace(pts);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  const blob = (w: readonly World[]) => {
    const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.beginPath();
    const start = mid(w[w.length - 1], w[0]);
    ctx.moveTo(start[0], start[1]);
    w.forEach((p, i) => {
      const m = mid(p, w[(i + 1) % w.length]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    });
    ctx.closePath();
  };
  /** Small light and dark flecks inside the current clip, so flat fills read as grass or soil. */
  const speckle = (count: number, x0: number, z0: number, x1: number, z1: number, light: string, dark: string) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = r() < 0.5 ? light : dark;
      ctx.beginPath();
      ctx.ellipse(
        x0 + r() * (x1 - x0),
        z0 + r() * (z1 - z0),
        0.08 + r() * 0.26,
        0.06 + r() * 0.18,
        r() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  };
  const bounds = (w: readonly World[]) => {
    return [
      Math.min(...w.map((p) => p[0])),
      Math.min(...w.map((p) => p[1])),
      Math.max(...w.map((p) => p[0])),
      Math.max(...w.map((p) => p[1])),
    ] as const;
  };

  // plantation ring
  ctx.fillStyle = COLORS.plantation;
  ctx.fillRect(-EXTENT.x, -EXTENT.z, EXTENT.x * 2, EXTENT.z * 2);
  speckle(9000, -EXTENT.x, -EXTENT.z, EXTENT.x, EXTENT.z, "rgba(150,190,90,0.13)", "rgba(10,40,10,0.13)");
  ctx.strokeStyle = "rgba(60,40,20,0.22)";
  ctx.lineWidth = 0.5;
  for (let z = -EXTENT.z + 2.2 + 1.56; z < EXTENT.z; z += 3.6 * 0.87) {
    ctx.beginPath();
    ctx.moveTo(-EXTENT.x, z);
    ctx.lineTo(EXTENT.x, z);
    ctx.stroke();
  }

  poly(img(GROUND.road), COLORS.road);
  // Inside the outer road it is all lawn for now (Ben, 2026-10-17): only the walkways are paved.
  const base = img(GROUND.base);
  poly(base, COLORS.lawn);
  ctx.save();
  trace(base);
  ctx.clip();
  {
    const [x0, z0, x1, z1] = bounds(base);
    speckle(Math.round((x1 - x0) * (z1 - z0) * 2.4), x0, z0, x1, z1, "rgba(200,210,120,0.14)", "rgba(70,90,30,0.13)");
  }
  ctx.restore();
  poly(img(GROUND.roadNotch), COLORS.road);
  // inside the outer road only from here on
  ctx.save();
  trace(base);
  ctx.clip();
  // The walkways (OSM): every outline first, then every fill, so walks that meet join into one, as in the art.
  for (const p of FOOTPATHS) stroke(p, FOOTPATH_W + 2 * PATH_EDGE, COLORS.pathEdge);
  for (const p of FOOTPATHS) stroke(p, FOOTPATH_W, COLORS.path);
  drawAFront(ctx);
  ctx.restore();

  // the funfair's land: lawn, like the lake park
  poly(FUNFAIR_LAND, COLORS.lawn);
  ctx.save();
  trace(FUNFAIR_LAND);
  ctx.clip();
  {
    const [x0, z0, x1, z1] = bounds(FUNFAIR_LAND);
    speckle(Math.round((x1 - x0) * (z1 - z0) * 2.4), x0, z0, x1, z1, "rgba(200,210,120,0.14)", "rgba(70,90,30,0.13)");
  }
  ctx.restore();
  drawB1Grounds(ctx);

  // dashed centre line around the outer road
  const ring = img(GROUND.road.map((p, i) => [(p[0] + GROUND.base[i][0]) / 2, (p[1] + GROUND.base[i][1]) / 2] as const));
  ctx.setLineDash([1.6, 1.4]);
  stroke([...ring, ring[0]], 0.18, COLORS.roadLine);
  ctx.setLineDash([]);

  // the lake (OSM): sandy shore, then a lakebed that gets deeper toward the middle
  {
    blob(LAKE);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = COLORS.shore;
    ctx.stroke();
    const cx = LAKE.reduce((s, p) => s + p[0], 0) / LAKE.length;
    const cz = LAKE.reduce((s, p) => s + p[1], 0) / LAKE.length;
    const rad = Math.max(...LAKE.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
    const g = ctx.createRadialGradient(cx, cz, rad * 0.1, cx, cz, rad);
    g.addColorStop(0, COLORS.lakeDeep);
    g.addColorStop(0.55, "#3a87b5");
    g.addColorStop(1, COLORS.lakeShallow);
    blob(LAKE);
    ctx.fillStyle = g;
    ctx.fill();
  }

  drawTrack(ctx);
  drawCarPark(ctx);
  drawB1Crossing(ctx);
  drawCourts(ctx);

  // soft shade under trees and buildings (cheap ambient occlusion)
  const trees = lite ? [...thinForLite(campusTrees()), ...thinForLite(plantation())] : [...campusTrees(), ...plantation()];
  for (const t of trees) {
    const rad = (t.kind === "oil" ? 1.9 : t.kind === "palm" ? 1.2 : 1.6) * t.s;
    const g = ctx.createRadialGradient(t.x, t.z, 0, t.x, t.z, rad);
    g.addColorStop(0, "rgba(0,0,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(t.x - rad, t.z - rad, rad * 2, rad * 2);
  }
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 1.4 * PX;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  // a footprint's shadow; canvas y is world z, so the canvas turns by -rotY
  const foot = (p: Placed, grow: number) => {
    ctx.save();
    ctx.translate(p.pos[0], p.pos[1]);
    ctx.rotate(-p.rotY);
    ctx.fillRect(-p.hx - grow, -p.hz - grow, 2 * (p.hx + grow), 2 * (p.hz + grow));
    ctx.restore();
  };
  for (const b of BLOCKS) foot(b, b.flat ? 0.1 : -0.3);
  foot(B1_PLACE, 0.1);
  // the statue's round flower bed
  ctx.beginPath();
  ctx.arc(STATUE[0], STATUE[1], BED.r * UNITS_PER_M * LANDMARK_SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = lite ? 4 : 8;
  return tex;
}

/** Joints every `step` world units across a paved rectangle, square to its sides (corners in order round it). */
function drawPaving(ctx: CanvasRenderingContext2D, [o, a, , b]: readonly World[], step: number) {
  const along = (p: World): [World, number] => {
    const len = Math.hypot(p[0] - o[0], p[1] - o[1]);
    return [[(p[0] - o[0]) / len, (p[1] - o[1]) / len], len];
  };
  const [ua, la] = along(a);
  const [ub, lb] = along(b);
  ctx.beginPath();
  for (let s = step; s < la; s += step) {
    ctx.moveTo(o[0] + ua[0] * s, o[1] + ua[1] * s);
    ctx.lineTo(b[0] + ua[0] * s, b[1] + ua[1] * s);
  }
  for (let t = step; t < lb; t += step) {
    ctx.moveTo(o[0] + ub[0] * t, o[1] + ub[1] * t);
    ctx.lineTo(a[0] + ub[0] * t, a[1] + ub[1] * t);
  }
  ctx.strokeStyle = "rgba(90,80,70,0.18)";
  ctx.lineWidth = 0.05;
  ctx.stroke();
}

/**
 * The paving in front of the A-row (geo.ts A_FRONT): every kerb first, so pieces that meet join into one, then the
 * forecourts and the statue's plaza, the terrace and walks, and the crossing over the terrace on A3's axis.
 */
function drawAFront(ctx: CanvasRenderingContext2D) {
  const { courts, strips, crossing } = A_FRONT;
  const trace = (pts: readonly World[], close: boolean) => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    if (close) ctx.closePath();
  };
  const court = (c: readonly World[]) => {
    trace(c, true);
    ctx.fillStyle = COLORS.plaza;
    ctx.fill();
    drawPaving(ctx, c, 0.6);
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  ctx.strokeStyle = COLORS.kerb;
  ctx.lineWidth = 2 * KERB;
  for (const c of [...courts, crossing]) {
    trace(c, true);
    ctx.stroke();
  }
  for (const s of strips) {
    trace(s.line, false);
    ctx.lineWidth = s.width + 2 * KERB;
    ctx.stroke();
  }
  for (const c of courts) court(c);
  for (const s of strips) {
    trace(s.line, false);
    ctx.lineWidth = s.width;
    ctx.strokeStyle = COLORS.paving;
    ctx.stroke();
    // joints across the walk, about every 3.7 m
    ctx.setLineDash([0.04, 0.55]);
    ctx.strokeStyle = "rgba(90,80,70,0.18)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  court(crossing);
  ctx.restore();
}

/** Standard 400 m track and pitch (geo.ts TRACK_M / PITCH_M), scaled to TRACK.length. */
function drawTrack(ctx: CanvasRenderingContext2D) {
  const [cx, cz] = toWorld(TRACK.center);
  const s = TRACK.length / TRACK_M.length; // world units per metre
  ctx.save();
  ctx.translate(cx, cz);
  ctx.rotate((TRACK.angleDeg * Math.PI) / 180);
  ctx.scale(s, TRACK.width / TRACK_M.width);
  const outerR = TRACK_M.width / 2;
  const half = TRACK_M.straight / 2;
  const ring = (r: number) => {
    ctx.beginPath();
    ctx.moveTo(-half, -r);
    ctx.lineTo(half, -r);
    ctx.arc(half, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-half, r);
    ctx.arc(-half, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
  };

  ring(outerR);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  // lane lines, from the kerb outwards
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 0.07 / s;
  for (let i = 0; i <= TRACK_M.lanes; i++) {
    ring(TRACK_M.kerbR + i * TRACK_M.lane);
    ctx.stroke();
  }

  // infield grass with mowing stripes across the pitch
  ring(TRACK_M.kerbR);
  ctx.fillStyle = COLORS.field;
  ctx.fill();
  ctx.save();
  ring(TRACK_M.kerbR);
  ctx.clip();
  ctx.fillStyle = COLORS.fieldLight;
  for (let x = -TRACK_M.length / 2, i = 0; x < TRACK_M.length / 2; x += 7.5, i++) {
    if (i % 2) ctx.fillRect(x, -outerR, 7.5, outerR * 2);
  }
  // the north end (+x) is red synthetic from the goal line to the kerb, for field events
  ctx.fillStyle = COLORS.track;
  ctx.fillRect(PITCH_M.length / 2, -outerR, outerR * 2, outerR * 2);
  ctx.restore();

  // pitch markings
  const L = PITCH_M.length / 2;
  const W = PITCH_M.width / 2;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 0.1 / s;
  ctx.strokeRect(-L, -W, L * 2, W * 2);
  ctx.beginPath();
  ctx.moveTo(0, -W);
  ctx.lineTo(0, W);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 9.15, 0, Math.PI * 2);
  ctx.stroke();
  for (const sgn of [-1, 1]) {
    ctx.strokeRect(sgn > 0 ? L - 16.5 : -L, -20.16, 16.5, 40.32);
    ctx.strokeRect(sgn > 0 ? L - 5.5 : -L, -9.16, 5.5, 18.32);
    // penalty arc outside the box
    const spot = sgn * (L - 11);
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (sgn > 0) ctx.arc(spot, 0, 9.15, Math.PI - a, Math.PI + a);
    else ctx.arc(spot, 0, 9.15, -a, a);
    ctx.stroke();
  }
  ctx.restore();
}

export function Ground({ lite = false }: { lite?: boolean }) {
  const tex = useMemo(() => makeGroundTexture(lite), [lite]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[EXTENT.x * 2, EXTENT.z * 2]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

/** The diorama base: layers of soil under the ground plane. */
export function Slab() {
  const soil = useMemo(() => makeSoil(), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2a1c14", roughness: 1 }), []);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }), [soil]);
  // No top face: the ground plane covers it. Drawn 0.01 below the ground, it showed through in flickering dark
  // bands on phones, where the depth buffer can't tell two layers that close apart at map distances.
  const none = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const H = 7;
  return (
    <mesh position-y={-H / 2} material={[side, side, none, dark, side, side]} receiveShadow>
      <boxGeometry args={[EXTENT.x * 2, H, EXTENT.z * 2]} />
    </mesh>
  );
}
