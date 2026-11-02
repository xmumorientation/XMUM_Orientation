"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { bar, paint } from "./footbridge";
import { CAMPUS_FENCE, EAST_GATE, MAIN_GATE } from "./geo";
import { groundY } from "./terrain";

// The main gate on Jalan Sunsuria, where the statue looks (Ben's photos and Esri imagery, 2026-11-02): two guard
// houses, each a flat stone roof on round columns with a glazed booth in its two outer bays, either side of a black
// iron gate under a gold arch; in front, an oval fountain with the university's name on a dark granite wall. The
// campus fence runs on from the guard houses round the campus (CAMPUS_FENCE in geo.ts).
// The east gate by B1 (Ben's photos): a small white guard house with a tiled hip roof and the name on a navy panel, on
// an island between the lanes, with barrier arms (EAST_GATE in geo.ts).
// The gates are modelled in real metres (z out toward the road), drawn MAIN_GATE.scale times larger. Six meshes:
// stone and iron, gold, railings, glass, and the two signs' faces.

const CREAM = "#ebe2d0";
const COLUMN = "#e3d8c4";
const STONE = "#c8bfb0";
const IRON = "#1c1d20";
const GRANITE = "#262422";
const WATER = "#76aec4";
const SPRAY = "#e6f3f7";
const GOLD = "#caa04a";
const GLASS = "#2c3742";
const WHITE = "#f4f2ed";
const TILE = "#c9653c";
const RIDGE = "#a8502e";
const NAVY = "#1f2b5e";
const SHRUB = "#4d8a3e";
const ARM = ["#d3302c", "#f4f4f4"];

/**
 * A guard house (metres, from its middle; `x` is its middle's distance from the gate's): roof size, the columns
 * (x along the front and back rows, z of the rows, radius), the floor slab, the column shafts, the roof's underside
 * and its layers, the booth (x from the inner side's column to the outer one, z of its front) and its windows.
 */
const HOUSE = {
  x: 16.5,
  w: 12,
  d: 9,
  cols: [-4.8, -1.6, 1.6, 4.8],
  colZ: 3.4,
  colR: 0.42,
  floor: 0.18,
  shaft: [0.48, 3.8],
  soffit: 4.1,
  roof: [4.25, 5.15, 5.3],
  booth: [-1.6, 4.8],
  boothZ: 3.1,
  window: [1.1, 3.3],
};
/** The iron gate between the guard houses: its posts' x, the main gate's half width and height, the side gates'. */
const GATE = { post: 4.6, half: 4.15, h: 2.7, sideH: 2.4, arch: 0.9 };
/** The fountain: its middle's z, its basin's half sizes (an oval: straight sides, round ends), rim and water heights. */
const FOUNTAIN = { z: 10, half: [5, 3.25], ledge: [5.6, 3.85, 0.2], rim: [0.35, 0.55], water: 0.42 };
/** The granite wall with the name, standing in the fountain's back half. */
const SIGN = { w: 6.4, h: 1.75, t: 0.5, z: 8.8 };
/** The campus fence (metres): its stone plinth, the railing's height, the posts' and the pillars' spacing and sizes. */
const FENCE = { plinth: 0.35, wall: 0.4, h: 2.2, post: 3, postW: 0.1, pillar: 0.55, pillarH: 2.6 };
/** Metres between the railings' bars. */
const BAR = 0.3;
/**
 * The east gate's guard house (metres): its walls across (x) and along the lanes (z), plinth and wall heights, the
 * roof's overhang and rise, the name panel on its front, and how far in from the island's inner end it stands.
 */
const LODGE = { w: 5.5, d: 7, plinth: 0.25, wall: 3.1, eave: 0.6, rise: 1.9, sign: [4.6, 1.3], inset: 0.8 };

/** A box `w` x `h` x `d` standing on y, its middle at (x, z). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
}

/** An oval: straight sides, round ends, `hx` by `hz` half sizes (hx >= hz), in the shape's x-y plane. */
function oval(hx: number, hz: number) {
  const s = new THREE.Shape();
  const run = hx - hz;
  s.moveTo(-run, -hz);
  s.lineTo(run, -hz);
  s.absarc(run, 0, hz, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-run, hz);
  s.absarc(-run, 0, hz, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

/** A hip roof over a `w` x `d` rectangle (d >= w): eaves at y0, a ridge along z `rise` higher, faces facing out. */
function hipRoof(w: number, d: number, y0: number, rise: number, color: string) {
  const [hx, hz] = [w / 2, d / 2];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const [a, b, c, e] = [v(-hx, y0, -hz), v(hx, y0, -hz), v(hx, y0, hz), v(-hx, y0, hz)];
  // the ridge's front and back ends
  const [r0, r1] = [v(0, y0 + rise, hz - hx), v(0, y0 + rise, hx - hz)];
  const faces: [THREE.Vector3[], THREE.Vector3][] = [
    [[e, c, r0], v(0, 0, 1)],
    [[b, a, r1], v(0, 0, -1)],
    [[c, b, r1, r0], v(1, 0, 0)],
    [[a, e, r0, r1], v(-1, 0, 0)],
  ];
  const pos: number[] = [];
  for (const [f, out] of faces) {
    for (let i = 1; i < f.length - 1; i++) {
      const tri = [f[0], f[i], f[i + 1]];
      const n = new THREE.Vector3().subVectors(tri[1], tri[0]).cross(new THREE.Vector3().subVectors(tri[2], tri[0]));
      if (n.dot(out) < 0) tri.reverse();
      for (const p of tri) pos.push(p.x, p.y, p.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return paint(g, color);
}

/** A flat slab of a shape (optionally with a hole), from y0 to y1, lying in the x-z plane. */
function slab(shape: THREE.Shape, y0: number, y1: number, color: string, hole?: THREE.Shape) {
  if (hole) shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 });
  return paint(g.rotateX(-Math.PI / 2).translate(0, y0, FOUNTAIN.z), color);
}

/** A railing between two points at the same height, y0 to y1: one quad, bars from its uv (u in bars along it). */
function railing(a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, spacing: number) {
  const g = new THREE.BufferGeometry();
  const p = [a.x, a.y + y0, a.z, b.x, b.y + y0, b.z, b.x, b.y + y1, b.z, a.x, a.y + y1, a.z];
  const u = a.distanceTo(b) / spacing;
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g.toNonIndexed();
}

type Parts = { solid: THREE.BufferGeometry[]; gold: THREE.BufferGeometry[]; rails: THREE.BufferGeometry[]; glass: THREE.BufferGeometry[] };

/** One guard house; `s` is +1 for the east one and -1 for the west one, so its booth is always on the outer side. */
function guardHouse(s: number, out: Parts) {
  const X = (lx: number) => s * (HOUSE.x + lx);
  const { w, d, floor, colZ, colR, soffit, roof } = HOUSE;
  out.solid.push(box(w + 0.4, floor, d + 0.4, X(0), 0, 0, STONE));
  for (const lx of HOUSE.cols) {
    for (const z of [-colZ, colZ]) {
      const [y0, y1] = HOUSE.shaft;
      out.solid.push(
        box(0.95, y0 - floor, 0.95, X(lx), floor, z, COLUMN),
        paint(new THREE.CylinderGeometry(colR, colR, y1 - y0, 14).translate(X(lx), (y0 + y1) / 2, z), COLUMN),
        box(0.95, soffit - y1, 0.95, X(lx), y1, z, COLUMN),
      );
    }
  }
  // the booth fills the two outer bays; its windows look out front and back, and down the road at its outer end
  const [b0, b1] = HOUSE.booth;
  const { boothZ } = HOUSE;
  out.solid.push(box(b1 - b0, soffit - floor, 2 * boothZ, X((b0 + b1) / 2), floor, 0, CREAM));
  const [wy0, wy1] = HOUSE.window;
  for (let i = 1; i < HOUSE.cols.length; i++) {
    const [c0, c1] = [HOUSE.cols[i - 1], HOUSE.cols[i]];
    if (c0 < b0 || c1 > b1) continue;
    for (const z of [-boothZ - 0.03, boothZ + 0.03]) {
      out.glass.push(box(c1 - c0 - 1.1, wy1 - wy0, 0.06, X((c0 + c1) / 2), wy0, z, GLASS));
      out.solid.push(box(0.08, wy1 - wy0, 0.1, X((c0 + c1) / 2), wy0, z, IRON));
    }
  }
  out.glass.push(box(0.06, wy1 - wy0, 4, X(b1 + 0.03), wy0, 0, GLASS));
  // a door onto the passage under the inner bay
  out.glass.push(box(0.06, 2.3, 1.1, X(b0 - 0.03), floor, -1.2, GLASS));
  // the roof: a recessed band, the deep fascia, a thin cap
  out.solid.push(
    box(w - 0.5, roof[0] - soffit, d - 0.5, X(0), soffit, 0, CREAM),
    box(w, roof[1] - roof[0], d, X(0), roof[0], 0, CREAM),
    box(w + 0.3, roof[2] - roof[1], d + 0.3, X(0), roof[1], 0, COLUMN),
  );
  // the side gate from the booth to the iron post, under the inner bay and on to the main gate
  const inner = HOUSE.x + b0;
  const a = new THREE.Vector3(s * (GATE.post + 0.45), 0, 0);
  const b = new THREE.Vector3(s * inner, 0, 0);
  out.rails.push(railing(a, b, 0.1, GATE.sideH, BAR));
  const len = inner - GATE.post - 0.45;
  const mid = s * (GATE.post + 0.45 + len / 2);
  out.solid.push(box(len, 0.1, 0.1, mid, 0.06, 0, IRON), box(len, 0.1, 0.1, mid, GATE.sideH - 0.08, 0, IRON));
}

/** The middle: two iron posts, the main gate under a gold arch with scrolls and spear tips. */
function mainGate(out: Parts) {
  const { post, half, h, arch } = GATE;
  for (const s of [-1, 1]) {
    out.solid.push(
      box(0.9, 3.3, 0.9, s * post, 0, 0, IRON),
      paint(new THREE.ConeGeometry(0.68, 0.45, 4).rotateY(Math.PI / 4).translate(s * post, 3.3 + 0.225, 0), IRON),
    );
    out.gold.push(paint(new THREE.SphereGeometry(0.17, 10, 8).translate(s * post, 3.88, 0), GOLD));
  }
  out.rails.push(railing(new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0), 0.12, h, BAR));
  out.solid.push(
    box(2 * half, 0.12, 0.12, 0, 0.06, 0, IRON),
    box(2 * half, 0.12, 0.12, 0, h - 0.1, 0, IRON),
    box(0.14, h, 0.14, 0, 0, 0, IRON),
  );
  // spear tips along the top rail
  for (let x = -half + BAR / 2; x < half; x += BAR) {
    out.gold.push(paint(new THREE.ConeGeometry(0.05, 0.22, 6).translate(x, h + 0.11, 0), GOLD));
  }
  // the arch: from the top rail at the posts up to `arch` higher in the middle, with taller tips along it
  const archY = (x: number) => h + arch * Math.cos((Math.PI * x) / (2 * half));
  const n = 20;
  for (let i = 0; i < n; i++) {
    const [x0, x1] = [-half + (2 * half * i) / n, -half + (2 * half * (i + 1)) / n];
    out.gold.push(bar(new THREE.Vector3(x0, archY(x0), 0), new THREE.Vector3(x1, archY(x1), 0), 0.12, GOLD));
  }
  for (let x = -half + 0.6; x < half - 0.3; x += 0.6) {
    out.gold.push(paint(new THREE.ConeGeometry(0.06, 0.34, 6).translate(x, archY(x) + 0.2, 0), GOLD));
  }
  // scrolls under the arch, and a medallion in the middle
  for (const x of [-3.3, -2.3, -1.3, 1.3, 2.3, 3.3]) {
    const r = (archY(x) - h) / 2 - 0.04;
    out.gold.push(paint(new THREE.TorusGeometry(r, 0.035, 4, 16).translate(x, h + r + 0.04, 0), GOLD));
  }
  out.gold.push(paint(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 20).rotateX(Math.PI / 2).translate(0, h + 0.45, 0), GOLD));
}

/** The fountain in front of the gate, its granite wall and a row of jets. */
function fountain(out: Parts) {
  const [hx, hz] = FOUNTAIN.half;
  const [lx, lz, lh] = FOUNTAIN.ledge;
  const [rw, rh] = FOUNTAIN.rim;
  out.solid.push(
    slab(oval(lx, lz), 0, lh, STONE),
    slab(oval(hx, hz), lh, rh, CREAM, oval(hx - rw, hz - rw)),
    slab(oval(hx - rw, hz - rw), lh, FOUNTAIN.water, WATER),
    box(SIGN.w, SIGN.h, SIGN.t, 0, FOUNTAIN.water, SIGN.z, GRANITE),
  );
  for (let x = -2.4; x <= 2.41; x += 0.8) {
    out.solid.push(paint(new THREE.ConeGeometry(0.07, 0.5, 6).translate(x, FOUNTAIN.water + 0.25, SIGN.z + 0.95), SPRAY));
  }
}

/**
 * The east gate's guard house, its middle at the origin (z out toward the road), with a lawn of shrubs in front and a
 * barrier arm across each lane. `lane` is how far the lanes reach either side (metres); returns its name panel's face.
 */
function eastLodge(out: Parts, lane: number, island: number) {
  const { w, d, plinth, wall, eave, rise } = LODGE;
  const top = plinth + wall;
  const roof = top + 0.22;
  out.solid.push(
    box(w + 0.3, plinth, d + 0.3, 0, 0, 0, STONE),
    box(w, wall, d, 0, plinth, 0, WHITE),
    box(w + 2 * eave, 0.22, d + 2 * eave, 0, top, 0, WHITE),
    hipRoof(w + 2 * eave, d + 2 * eave, roof, rise, TILE),
    box(0.22, 0.14, d - w + 0.2, 0, roof + rise - 0.04, 0, RIDGE),
    // the little vent on the ridge (Ben's photo)
    box(0.7, 0.55, 0.7, 0, roof + rise - 0.15, 0, WHITE),
  );
  // a dark window band down each side, a door and a window at the back
  for (const sx of [-1, 1]) out.glass.push(box(0.06, 1.2, d - 1.6, sx * (w / 2 + 0.03), plinth + 1, 0, GLASS));
  out.glass.push(box(1, 2.2, 0.06, -1.3, plinth, -d / 2 - 0.03, GLASS), box(1.8, 1.2, 0.06, 1, plinth + 1, -d / 2 - 0.03, GLASS));
  // shrubs on the lawn in front
  for (const [x, z] of [[-1.6, 0.6], [0, 1.4], [1.6, 0.6]]) {
    out.solid.push(paint(new THREE.IcosahedronGeometry(0.65, 0).scale(1, 0.7, 1).translate(x, 0.4, d / 2 + 2.6 + z), SHRUB));
  }
  // a barrier arm across each lane, beside the house's front, red and white
  for (const sx of [-1, 1]) {
    const x0 = sx * (island - 0.35);
    const z = d / 2 - 1;
    out.solid.push(box(0.3, 1.1, 0.3, x0, 0, z, WHITE), box(0.42, 0.3, 0.42, x0, 0.85, z, ARM[0]));
    const n = 8;
    const step = (lane - island) / n;
    for (let i = 0; i < n; i++) out.solid.push(box(step, 0.1, 0.1, x0 + sx * (0.3 + step * (i + 0.5)), 0.95, z, ARM[i % 2]));
  }
  const [sw, sh] = LODGE.sign;
  return new THREE.PlaneGeometry(sw, sh).translate(0, plinth + 1.2 + sh / 2, d / 2 + 0.02);
}

/** The campus fence in world units: plinth, rails, posts and pillars into `out.solid`, the bars into `out.rails`. */
function campusFence(out: Parts) {
  const s = MAIN_GATE.scale;
  const { plinth, wall, h, postW, pillar, pillarH } = FENCE;
  /** A box along a to b (world), `w` wide and `t` tall, standing `y` above the ground there. */
  const along = (a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, y: number, color: string) => {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(len + w, t, w)
      .rotateY(-Math.atan2(b.z - a.z, b.x - a.x))
      .translate((a.x + b.x) / 2, (a.y + b.y) / 2 + y + t / 2, (a.z + b.z) / 2);
    return paint(g, color);
  };
  const pillarAt = (p: THREE.Vector3) =>
    out.solid.push(
      box(pillar * s, pillarH * s, pillar * s, p.x, p.y, p.z, CREAM),
      box((pillar + 0.12) * s, 0.12 * s, (pillar + 0.12) * s, p.x, p.y + pillarH * s, p.z, COLUMN),
    );
  for (const run of CAMPUS_FENCE) {
    const pts = run.map(([x, z]) => new THREE.Vector3(x, groundY(x, z), z));
    let toPost = 0;
    for (let i = 1; i < pts.length; i++) {
      // pieces of at most 2 units, each level at its own ground height
      const n = Math.ceil(pts[i - 1].distanceTo(pts[i]) / 2);
      for (let k = 0; k < n; k++) {
        const a = pts[i - 1].clone().lerp(pts[i], k / n);
        const b = pts[i - 1].clone().lerp(pts[i], (k + 1) / n);
        a.y = b.y = groundY((a.x + b.x) / 2, (a.z + b.z) / 2);
        out.solid.push(
          along(a, b, wall * s, plinth * s, 0, STONE),
          along(a, b, 0.07 * s, 0.07 * s, (plinth + 0.12) * s, IRON),
          along(a, b, 0.07 * s, 0.07 * s, (h - 0.1) * s, IRON),
        );
        out.rails.push(railing(a, b, plinth * s, h * s, BAR * s));
        const len = a.distanceTo(b);
        for (let t = toPost; t < len; t += FENCE.post * s) {
          const p = a.clone().lerp(b, t / len);
          out.solid.push(box(postW * s, h * s, postW * s, p.x, p.y, p.z, IRON));
        }
        toPost = (toPost - len) % (FENCE.post * s);
        if (toPost < 0) toPost += FENCE.post * s;
      }
    }
    // a pillar at each end and at each corner
    pts.forEach((p) => pillarAt(p));
  }
}

/**
 * The university's name in English and Chinese: in gold on dark granite (the main gate), or in white on navy with the
 * crest (the east gate).
 */
function signTexture(kind: "main" | "east") {
  const east = kind === "east";
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = east ? 290 : 280;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = east ? NAVY : GRANITE;
  ctx.fillRect(0, 0, c.width, c.height);
  if (!east) {
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.25)";
      ctx.fillRect(((i * 733) % 1024) + 0.5, ((i * 397) % 280) + 0.5, 2, 2);
    }
  }
  if (east) {
    ctx.fillStyle = "#ffffff";
  } else {
    const gold = ctx.createLinearGradient(0, 30, 0, 250);
    gold.addColorStop(0, "#f4d98a");
    gold.addColorStop(1, "#b98a35");
    ctx.fillStyle = gold;
  }
  // the text's middle and width: beside the crest on the east gate's panel
  const [mid, max] = east ? [600, 760] : [512, 940];
  if (east) {
    ctx.strokeStyle = "#ffffff";
    for (const [r, w] of [[105, 7], [80, 3]] as const) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(125, 145, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = 'bold 74px "Songti SC", STSong, "Noto Serif CJK SC", "Noto Serif SC", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("厦大", 125, 148);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (text: string, font: string, y: number) => {
    ctx.font = font;
    const k = Math.min(1, max / ctx.measureText(text).width);
    ctx.save();
    ctx.translate(mid, y);
    ctx.scale(k, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  fit("XIAMEN UNIVERSITY MALAYSIA", '600 64px Georgia, "Times New Roman", serif', east ? 88 : 74);
  const zh = 'bold 120px "Songti SC", STSong, "Noto Serif CJK SC", "Noto Serif SC", serif';
  fit(east ? "厦门大学马来西亚分校" : "厦門大學馬來西亞分校", zh, east ? 200 : 186);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Vertical bars: white where a bar is, for the railings' alpha map. */
function barTexture() {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 16, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(5, 0, 6, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function gateGeometry() {
  const parts: Parts = { solid: [], gold: [], rails: [], glass: [] };
  guardHouse(1, parts);
  guardHouse(-1, parts);
  mainGate(parts);
  fountain(parts);
  const sign = new THREE.PlaneGeometry(SIGN.w - 0.1, SIGN.h - 0.1).translate(
    0,
    FOUNTAIN.water + SIGN.h / 2,
    SIGN.z + SIGN.t / 2 + 0.01,
  );
  // into the world: on the ground at the gate's middle, turned and scaled
  const [gx, gz] = MAIN_GATE.pos;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(gx, groundY(gx, gz), gz),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), MAIN_GATE.rotY),
    new THREE.Vector3().setScalar(MAIN_GATE.scale),
  );
  for (const list of Object.values(parts)) for (const g of list) g.applyMatrix4(m);
  sign.applyMatrix4(m);
  // the east gate's guard house, on its island's inner part, facing the road (+z)
  const lodge: Parts = { solid: [], gold: [], rails: [], glass: [] };
  const { x, half, island } = EAST_GATE;
  const k = MAIN_GATE.scale;
  const eastSign = eastLodge(lodge, half / k, island.half / k);
  const lz = island.z[0] + (LODGE.inset + LODGE.d / 2) * k;
  const lm = new THREE.Matrix4().compose(
    new THREE.Vector3(x, groundY(x, lz), lz),
    new THREE.Quaternion(),
    new THREE.Vector3().setScalar(k),
  );
  for (const [key, list] of Object.entries(lodge) as [keyof Parts, THREE.BufferGeometry[]][]) {
    for (const g of list) parts[key].push(g.applyMatrix4(lm));
  }
  eastSign.applyMatrix4(lm);
  campusFence(parts);
  const merge = (list: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(list)!;
    g.computeVertexNormals();
    return g;
  };
  return {
    solid: merge(parts.solid),
    gold: merge(parts.gold),
    rails: merge(parts.rails),
    glass: merge(parts.glass),
    sign,
    eastSign,
  };
}

/** The main gate, the east gate and the campus fence. `glow` lights the windows and the names at dusk and night. */
export function MainGate({ glow }: { glow: number }) {
  const geo = useMemo(gateGeometry, []);
  const tex = useMemo(() => ({ sign: signTexture("main"), eastSign: signTexture("east"), bars: barTexture() }), []);
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
      for (const t of Object.values(tex)) t.dispose();
    },
    [geo, tex],
  );
  return (
    <>
      <mesh geometry={geo.solid} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.75} />
      </mesh>
      <mesh geometry={geo.gold} castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh geometry={geo.rails} castShadow>
        <meshStandardMaterial
          color={IRON}
          alphaMap={tex.bars}
          alphaTest={0.5}
          side={THREE.DoubleSide}
          roughness={0.5}
          metalness={0.4}
        />
      </mesh>
      <mesh geometry={geo.glass}>
        <meshStandardMaterial vertexColors roughness={0.15} metalness={0.3} emissive="#ffcf8a" emissiveIntensity={glow * 0.7} />
      </mesh>
      {([["sign", 0.35], ["eastSign", 0.25]] as const).map(([key, k]) => (
        <mesh key={key} geometry={geo[key]}>
          <meshStandardMaterial
            map={tex[key]}
            emissiveMap={tex[key]}
            emissive="#ffffff"
            emissiveIntensity={glow * k}
            roughness={0.4}
            metalness={0.2}
          />
        </mesh>
      ))}
    </>
  );
}
