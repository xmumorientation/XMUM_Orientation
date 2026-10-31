import { invalidate } from "@react-three/fiber";
import * as THREE from "three";

// DRAFT: textures drawn on canvases at runtime, so the scene needs no image
// files or network requests.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function brick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#b9472f";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,232,205,0.35)";
  ctx.lineWidth = 1;
  const rowH = 7;
  for (let r = 0, yy = y; yy < y + h; r++, yy += rowH) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
    for (let xx = x + (r % 2) * 8; xx < x + w; xx += 16) {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, Math.min(yy + rowH, y + h));
      ctx.stroke();
    }
  }
}

type Grid = { rows: number; cols: number; wall: string; glass: string; repeat: [number, number] };

/**
 * `rows` x `cols` square windows on a plain `wall`, tiled `repeat` times (A3's storey under its upper roof). The
 * emissive map lights only some windows, so the walls stay dark at night.
 */
export function makeGridFacade(seed: number, { rows, cols, wall, glass, repeat }: Grid) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const [e, ectx] = canvas(S, S);
  const r = rng(seed);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);
  const cw = S / cols;
  const rh = S / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [wx, wy, ww, wh] = [x * cw + cw * 0.22, y * rh + rh * 0.23, cw * 0.56, rh * 0.56];
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, ww, wh);
      if (r() < 0.55) {
        ectx.fillStyle = r() < 0.7 ? "#ffc875" : "#fff0c8";
        ectx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      }
    }
  }
  const map = texture(c);
  const emissiveMap = texture(e);
  for (const t of [map, emissiveMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return { map, emissiveMap };
}

/**
 * A3's walls (Ben's photos and street view), as shares of their height from the ground: an arcade, a band of tall
 * windows, four floors, then arched windows under the eaves, with a string course under the tall windows and under the
 * floors. buildings.tsx stops the lower wings and the porches on these lines.
 */
export const A3_ROWS = { arcade: 0.25, tall: [0.27, 0.45], floors: [0.47, 0.89], storeys: 4 } as const;

const A3_WALL = "#e8dcc6";
const A3_TRIM = "#f3ecdd";
const A3_GLASS = "#3a4552";
const A3_FRAME = "#8c3a2b";
const LIT = ["#ffc875", "#fff0c8"];

/** A window's outline with a round head: `x`, `w` across, from `bottom` up to `top`; the head is `ry` high. */
function headPath(ctx: CanvasRenderingContext2D, x: number, w: number, bottom: number, top: number, ry: number) {
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.lineTo(x, top + ry);
  ctx.ellipse(x + w / 2, top + ry, w / 2, ry, 0, Math.PI, 0);
  ctx.lineTo(x + w, bottom);
  ctx.closePath();
}

/** Dark glass in a red frame (photos), with `mullions` upright bars and, if given, a transom that far down. */
function framed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mullions: number,
  transom?: number,
) {
  ctx.fillStyle = A3_GLASS;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = A3_FRAME;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 1; k <= mullions; k++) {
    ctx.moveTo(x + (w * k) / (mullions + 1), y);
    ctx.lineTo(x + (w * k) / (mullions + 1), y + h);
  }
  if (transom !== undefined) {
    ctx.moveTo(x, y + h * transom);
    ctx.lineTo(x + w, y + h * transom);
  }
  ctx.stroke();
}

/**
 * A3's long walls: one tile is four `bay`s wide (world units) and the whole wall `height` high, so it repeats across
 * only. Each bay has an arch on the ground floor, a tall window, four windows over pale panels and an arched window
 * under the eaves, in red frames; its edges are a shade paler (the pilasters, where buildings.tsx draws none). The
 * emissive map lights only some windows, so the walls stay dark at night.
 */
export function makeA3Facade(seed: number, bay: number, height: number) {
  const B = 64;
  const W = 4 * B;
  const S = 512;
  const [c, ctx] = canvas(W, S);
  const [e, ectx] = canvas(W, S);
  const r = rng(seed);
  const y = (f: number) => S * (1 - f);
  // a round head's height on the canvas for a half width `rx`, so it is round on the wall
  const ry = (rx: number) => (rx * S * bay) / (B * height);
  const { arcade, tall, floors, storeys } = A3_ROWS;
  ctx.fillStyle = A3_WALL;
  ctx.fillRect(0, 0, W, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, W, S);
  ctx.fillStyle = A3_TRIM;
  for (const [a, b] of [
    [arcade, tall[0]],
    [tall[1], floors[0]],
    [0.985, 1],
  ])
    ctx.fillRect(0, y(b), W, y(a) - y(b));
  ctx.fillStyle = "#d3cab9";
  ctx.fillRect(0, y(0.02), W, y(0) - y(0.02));
  const light = (draw: () => void, chance: number, colours = LIT) => {
    if (r() >= chance) return;
    draw();
    ectx.fillStyle = colours[r() < 0.7 ? 0 : 1];
    ectx.fill();
  };
  const fh = (floors[1] - floors[0]) / storeys;
  for (let k = 0; k < 4; k++) {
    const bx = k * B;
    const cx = bx + B / 2;
    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(bx, 0, 5, S);
    ctx.fillRect(bx + B - 5, 0, 5, S);
    // the arcade
    const aw = B * 0.36;
    headPath(ctx, cx - aw / 2, aw, y(0.02), y(0.22), ry(aw / 2));
    ctx.fillStyle = "#3b3631";
    ctx.fill();
    ctx.strokeStyle = "#f4eee2";
    ctx.lineWidth = 3;
    ctx.stroke();
    light(() => headPath(ectx, cx - aw / 2 + 2, aw - 4, y(0.02), y(0.22) + 2, ry(aw / 2 - 2)), 0.75);
    // the tall windows
    const tw = B * 0.34;
    framed(ctx, cx - tw / 2, y(0.44), tw, y(0.285) - y(0.44), 1, 0.3);
    light(() => {
      ectx.beginPath();
      ectx.rect(cx - tw / 2 + 2, y(0.44) + 2, tw - 4, y(0.285) - y(0.44) - 4);
    }, 0.6);
    // the floors: a pale panel under each window
    const ww = B * 0.32;
    for (let i = 0; i < storeys; i++) {
      const f0 = floors[0] + i * fh;
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(cx - ww / 2, y(f0 + 0.16 * fh), ww, y(f0 + 0.04 * fh) - y(f0 + 0.16 * fh));
      framed(ctx, cx - ww / 2, y(f0 + 0.82 * fh), ww, y(f0 + 0.2 * fh) - y(f0 + 0.82 * fh), 1, 0.3);
      light(() => {
        ectx.beginPath();
        ectx.rect(cx - ww / 2 + 2, y(f0 + 0.82 * fh) + 2, ww - 4, y(f0 + 0.2 * fh) - y(f0 + 0.82 * fh) - 4);
      }, 0.55);
    }
    // arched windows under the eaves
    const hw = B * 0.28;
    headPath(ctx, cx - hw / 2, hw, y(0.905), y(0.975), ry(hw / 2));
    ctx.fillStyle = A3_GLASS;
    ctx.fill();
    ctx.strokeStyle = A3_FRAME;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const orange = ["#ffb35c", "#ffd08a"];
    light(() => headPath(ectx, cx - hw / 2 + 2, hw - 4, y(0.905), y(0.975) + 2, ry(hw / 2 - 2)), 0.6, orange);
  }
  const map = texture(c);
  const emissiveMap = texture(e);
  for (const t of [map, emissiveMap]) t.wrapS = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

/**
 * The middle of A3's long walls, between its two thick pilasters (`width` x `height`, world units): glass doors and
 * the tall windows behind the porch, a big arched window over three floors, the emblem over it, a wide window, and
 * three arched windows under the eaves (street view). The arch and the doors are lit at night.
 */
export function makeA3Centre(width: number, height: number) {
  const W = 128;
  const S = 512;
  const [c, ctx] = canvas(W, S);
  const [e, ectx] = canvas(W, S);
  const y = (f: number) => S * (1 - f);
  const ry = (rx: number) => (rx * S * width) / (W * height);
  const { tall, floors } = A3_ROWS;
  ctx.fillStyle = A3_WALL;
  ctx.fillRect(0, 0, W, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, W, S);
  ctx.fillStyle = A3_TRIM;
  for (const [a, b] of [
    [tall[1], floors[0]],
    [0.985, 1],
  ])
    ctx.fillRect(0, y(b), W, y(a) - y(b));
  const glow = (x: number, top: number, w: number, bottom: number, colour = "#ffd9a0") => {
    ectx.fillStyle = colour;
    ectx.fillRect(x + 2, top + 2, w - 4, bottom - top - 4);
  };
  // glass doors and the tall windows above them
  const gx = W * 0.08;
  const gw = W * 0.84;
  framed(ctx, gx, y(0.24), gw, y(0.02) - y(0.24), 3, 0.3);
  glow(gx, y(0.24), gw, y(0.02));
  framed(ctx, gx, y(0.44), gw, y(0.285) - y(0.44), 3, 0.5);
  glow(gx, y(0.44), gw, y(0.285));
  // the big arch over three floors, a grid of red bars
  const ax = W * 0.1;
  const aw = W * 0.8;
  const [bottom, top] = [y(floors[0] + 0.025), y(0.755)];
  const head = ry(aw / 2);
  headPath(ctx, ax, aw, bottom, top, head);
  ctx.fillStyle = A3_GLASS;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = A3_FRAME;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 1; k < 6; k++) {
    ctx.moveTo(ax + (aw * k) / 6, top);
    ctx.lineTo(ax + (aw * k) / 6, bottom);
  }
  for (let yy = bottom - 16; yy > top; yy -= 16) {
    ctx.moveTo(ax, yy);
    ctx.lineTo(ax + aw, yy);
  }
  ctx.stroke();
  ctx.restore();
  headPath(ctx, ax, aw, bottom, top, head);
  ctx.strokeStyle = A3_FRAME;
  ctx.lineWidth = 3;
  ctx.stroke();
  headPath(ectx, ax + 3, aw - 6, bottom, top + 3, head - 3);
  ectx.fillStyle = "#ffd9a0";
  ectx.fill();
  // the emblem, a gold ring, and a wide window over it
  const er = W * 0.11;
  ctx.beginPath();
  ctx.ellipse(W / 2, y(0.785), er, ry(er), 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f4eee2";
  ctx.fill();
  ctx.strokeStyle = "#b8923f";
  ctx.lineWidth = 3;
  ctx.stroke();
  framed(ctx, gx, y(0.875), gw, y(0.812) - y(0.875), 3);
  glow(gx, y(0.875), gw, y(0.812), "#ffc875");
  // three arched windows under the eaves
  const hw = W * 0.22;
  for (const k of [-1, 0, 1]) {
    const x = W / 2 + k * W * 0.29 - hw / 2;
    headPath(ctx, x, hw, y(0.905), y(0.975), ry(hw / 2));
    ctx.fillStyle = A3_GLASS;
    ctx.fill();
    ctx.strokeStyle = A3_FRAME;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    headPath(ectx, x + 2, hw - 4, y(0.905), y(0.975) + 2, ry(hw / 2 - 2));
    ectx.fillStyle = "#ffb35c";
    ectx.fill();
  }
  return { map: texture(c), emissiveMap: texture(e) };
}

/**
 * A1, A2, A4 and A5's walls (Ben's photos; all four alike), as shares of their height from the ground: a colonnade
 * under a band, then five floors.
 */
const GABLE_ROWS = { colonnade: 0.205, band: [0.22, 0.25], storeys: 5 } as const;

/**
 * A1, A2, A4 and A5's walls in A3's colours (photos), for walls `height` high (world units). `wall`: one tile four
 * bays wide, a colonnade on the ground floor and a slim window in a red frame on each floor, the bays' edges a shade
 * paler (the pilasters). `balcony`: a corner tower's side, a deep balcony on each floor. `centre`: the middle bay,
 * `width` wide, in a white frame: glass doors, a wide window on each floor and an arched one on the top floor. The
 * emissive maps light only some windows, as in makeA3Facade; the doors always.
 */
export function makeGableFacade(seed: number, width: number, height: number) {
  const S = 512;
  const r = rng(seed);
  const y = (f: number) => S * (1 - f);
  const { colonnade, band, storeys } = GABLE_ROWS;
  const fh = (1 - band[1]) / storeys;
  const floor = (i: number) => band[1] + i * fh;
  /** A canvas and its emissive twin, `w` wide, with the base, the band and the cornice. */
  const start = (w: number) => {
    const [c, ctx] = canvas(w, S);
    const [e, ectx] = canvas(w, S);
    ctx.fillStyle = A3_WALL;
    ctx.fillRect(0, 0, w, S);
    ectx.fillStyle = "#000";
    ectx.fillRect(0, 0, w, S);
    ctx.fillStyle = A3_TRIM;
    ctx.fillRect(0, y(band[1]), w, y(band[0]) - y(band[1]));
    ctx.fillRect(0, 0, w, y(0.985));
    ctx.fillStyle = "#d3cab9";
    ctx.fillRect(0, y(0.02), w, y(0) - y(0.02));
    return { c, ctx, e, ectx };
  };
  const light = (ectx: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number, chance: number) => {
    if (r() >= chance) return;
    ectx.fillStyle = LIT[r() < 0.7 ? 0 : 1];
    ectx.fillRect(x + 2, top + 2, w - 4, bottom - top - 4);
  };
  /** A dark opening of the colonnade, `w` wide in the middle of `x0`..`x0 + span`. */
  const opening = (ctx: CanvasRenderingContext2D, ectx: CanvasRenderingContext2D, x0: number, span: number, w: number) => {
    const x = x0 + (span - w) / 2;
    ctx.fillStyle = "#3b3631";
    ctx.fillRect(x, y(colonnade), w, y(0.02) - y(colonnade));
    light(ectx, x, y(colonnade), w, y(0.02), 0.7);
  };
  const wrap = (d: { c: HTMLCanvasElement; e: HTMLCanvasElement }, repeat: boolean) => {
    const out = { map: texture(d.c), emissiveMap: texture(d.e) };
    if (repeat) for (const t of [out.map, out.emissiveMap]) t.wrapS = THREE.RepeatWrapping;
    return out;
  };

  // the walls: four bays a tile
  const B = 64;
  const wall = start(4 * B);
  for (let k = 0; k < 4; k++) {
    const bx = k * B;
    wall.ctx.fillStyle = "#efe6d4";
    wall.ctx.fillRect(bx, 0, 4, S);
    wall.ctx.fillRect(bx + B - 4, 0, 4, S);
    opening(wall.ctx, wall.ectx, bx, B, B * 0.45);
    const ww = B * 0.24;
    const wx = bx + (B - ww) / 2;
    for (let i = 0; i < storeys; i++) {
      const f0 = floor(i);
      wall.ctx.fillStyle = "#efe6d6";
      wall.ctx.fillRect(wx - 3, y(f0 + 0.15 * fh), ww + 6, y(f0 + 0.03 * fh) - y(f0 + 0.15 * fh));
      framed(wall.ctx, wx, y(f0 + 0.85 * fh), ww, y(f0 + 0.2 * fh) - y(f0 + 0.85 * fh), 0, 0.28);
      light(wall.ectx, wx, y(f0 + 0.85 * fh), ww, y(f0 + 0.2 * fh), 0.55);
    }
  }

  // a corner tower's side: a balcony on each floor, its rail and its back wall's window
  const T = 128;
  const balcony = start(T);
  opening(balcony.ctx, balcony.ectx, 0, T, T * 0.7);
  for (let i = 0; i < storeys; i++) {
    const f0 = floor(i);
    const [x0, x1] = [T * 0.1, T * 0.9];
    balcony.ctx.fillStyle = "#4a4540";
    balcony.ctx.fillRect(x0, y(f0 + 0.9 * fh), x1 - x0, y(f0 + 0.08 * fh) - y(f0 + 0.9 * fh));
    framed(balcony.ctx, T * 0.3, y(f0 + 0.8 * fh), T * 0.4, y(f0 + 0.3 * fh) - y(f0 + 0.8 * fh), 1);
    light(balcony.ectx, T * 0.3, y(f0 + 0.8 * fh), T * 0.4, y(f0 + 0.3 * fh), 0.5);
    balcony.ctx.fillStyle = A3_TRIM;
    balcony.ctx.fillRect(x0, y(f0 + 0.3 * fh), x1 - x0, y(f0 + 0.08 * fh) - y(f0 + 0.3 * fh));
  }

  // the middle bay: a white frame round glass doors, wide windows and an arched one on top
  const C = 128;
  const centre = start(C);
  const ry = (rx: number) => (rx * S * width) / (C * height);
  centre.ctx.fillStyle = A3_TRIM;
  centre.ctx.fillRect(0, 0, C, S);
  const [gx, gw] = [C * 0.16, C * 0.68];
  framed(centre.ctx, gx, y(colonnade), gw, y(0.02) - y(colonnade), 3, 0.25);
  centre.ectx.fillStyle = "#ffd9a0";
  centre.ectx.fillRect(gx + 2, y(colonnade) + 2, gw - 4, y(0.02) - y(colonnade) - 4);
  for (let i = 0; i < storeys - 1; i++) {
    const f0 = floor(i);
    framed(centre.ctx, gx, y(f0 + 0.85 * fh), gw, y(f0 + 0.2 * fh) - y(f0 + 0.85 * fh), 2, 0.3);
    light(centre.ectx, gx, y(f0 + 0.85 * fh), gw, y(f0 + 0.2 * fh), 0.6);
  }
  const top = floor(storeys - 1);
  const [ax, aw] = [C * 0.24, C * 0.52];
  headPath(centre.ctx, ax, aw, y(top + 0.15 * fh), y(top + 0.92 * fh), ry(aw / 2));
  centre.ctx.fillStyle = A3_GLASS;
  centre.ctx.fill();
  centre.ctx.strokeStyle = A3_FRAME;
  centre.ctx.lineWidth = 2.5;
  centre.ctx.stroke();
  headPath(centre.ectx, ax + 2, aw - 4, y(top + 0.15 * fh), y(top + 0.92 * fh) + 2, ry(aw / 2 - 2));
  centre.ectx.fillStyle = "#ffb35c";
  centre.ectx.fill();

  return { wall: wrap(wall, true), balcony: wrap(balcony, false), centre: wrap(centre, false) };
}

/** B1's wall textures: one tile is this many metres wide and as high as the walls (their roof). */
export const B1_WALL_W = 12;

/**
 * B1's walls (photos): `glazed`, the activity centre behind its floor bands: a brick base up to the podium, then
 * glass walls with dark mullions and brick piers on the ground floor and the first floor, white where the bands'
 * slabs meet the wall. `hall`, the sports hall at the east end: brick with glass doors at the bottom, white walls
 * and a band of high windows. Heights in metres (b1.tsx). As on the A-row, the emissive maps light only some panes.
 */
export function makeB1Walls(
  seed: number,
  y: { podium: number; roof: number; bandA: readonly number[]; bandB: readonly number[] },
) {
  const W = 512;
  const H = 256;
  const mx = W / B1_WALL_W;
  const my = H / y.roof;
  const r = rng(seed);
  const make = (paint: (ctx: CanvasRenderingContext2D, ectx: CanvasRenderingContext2D) => void) => {
    const [c, ctx] = canvas(W, H);
    const [e, ectx] = canvas(W, H);
    ectx.fillStyle = "#000";
    ectx.fillRect(0, 0, W, H);
    paint(ctx, ectx);
    const map = texture(c);
    const emissiveMap = texture(e);
    for (const t of [map, emissiveMap]) t.wrapS = THREE.RepeatWrapping;
    return { map, emissiveMap };
  };
  /** A rectangle from x0 to x1 metres along the wall and y0 to y1 metres up. */
  const rect = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) =>
    ctx.fillRect(x0 * mx, H - y1 * my, (x1 - x0) * mx, (y1 - y0) * my);
  const panes = (
    ctx: CanvasRenderingContext2D,
    ectx: CanvasRenderingContext2D,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    pane: number,
    lit: number,
  ) => {
    const g = ctx.createLinearGradient(0, H - y1 * my, 0, H - y0 * my);
    g.addColorStop(0, "#71879a");
    g.addColorStop(1, "#46576a");
    ctx.fillStyle = g;
    rect(ctx, x0, x1, y0, y1);
    ctx.fillStyle = "#2c3642";
    for (let x = x0; x <= x1 + 1e-6; x += pane) rect(ctx, x - 0.06, x + 0.06, y0, y1);
    rect(ctx, x0, x1, y1 - 0.12, y1);
    for (let x = x0; x < x1 - 1e-6; x += pane) {
      if (r() >= lit) continue;
      ectx.fillStyle = r() < 0.7 ? "#ffc875" : "#fff0c8";
      rect(ectx, x + 0.1, x + pane - 0.1, y0 + 0.1, y1 - 0.2);
    }
  };
  const white = (ctx: CanvasRenderingContext2D, y0: number, y1: number) => {
    ctx.fillStyle = "#f4f2ec";
    rect(ctx, 0, B1_WALL_W, y0, y1);
  };
  const brickRect = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number) =>
    brick(ctx, x0 * mx, H - y1 * my, (x1 - x0) * mx, (y1 - y0) * my);

  const glazed = make((ctx, ectx) => {
    const [g0, g1] = [y.podium, y.bandA[0]];
    const [f0, f1] = [y.bandA[1], y.bandB[0]];
    white(ctx, 0, y.roof);
    brickRect(ctx, 0, B1_WALL_W, 0, g0);
    // ground floor: glass, a brick pier every 6 m
    panes(ctx, ectx, 0, B1_WALL_W, g0, g1, 1.2, 0.75);
    brickRect(ctx, 0, 1.2, g0, g1);
    brickRect(ctx, 6, 7.2, g0, g1);
    // first floor: glass with brick panels
    panes(ctx, ectx, 0, B1_WALL_W, f0, f1, 1.2, 0.6);
    brickRect(ctx, 4.8, 6, f0, f1);
    brickRect(ctx, 10.8, 12, f0, f1);
  });
  const hall = make((ctx, ectx) => {
    const high = y.roof - 3.6;
    white(ctx, 0, y.roof);
    ctx.fillStyle = "rgba(120,110,100,0.18)";
    for (let x = 0; x < B1_WALL_W; x += 3) rect(ctx, x, x + 0.05, 4, high);
    brickRect(ctx, 0, B1_WALL_W, 0, 4);
    for (const x of [2.2, 8.2]) panes(ctx, ectx, x, x + 2.4, 0, 3, 1.2, 0.8);
    panes(ctx, ectx, 0, B1_WALL_W, high, high + 2.2, 1.5, 0.45);
  });
  return { glazed, hall };
}

/** Glazed roof tiles: courses that run parallel to the eaves. */
export function makeRoofTiles() {
  const [c, ctx] = canvas(32, 128);
  const rows = 8;
  const h = 128 / rows;
  for (let i = 0; i < rows; i++) {
    const g = ctx.createLinearGradient(0, i * h, 0, (i + 1) * h);
    g.addColorStop(0, "#e2402c");
    g.addColorStop(0.8, "#c52a1c");
    g.addColorStop(1, "#8e1a12");
    ctx.fillStyle = g;
    ctx.fillRect(0, i * h, 32, h);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Side of the slab: grass, then layers of soil. */
export function makeSoil() {
  const [c, ctx] = canvas(512, 128);
  const r = rng(5);
  const bands: [number, string][] = [
    [0.0, "#3f6b2f"],
    [0.07, "#7d5638"],
    [0.32, "#6b4630"],
    [0.62, "#573826"],
    [0.85, "#3a261b"],
  ];
  bands.forEach(([y, col], i) => {
    const next = bands[i + 1]?.[0] ?? 1;
    ctx.fillStyle = col;
    ctx.fillRect(0, y * 128, 512, (next - y) * 128 + 1);
  });
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? "255,240,220" : "20,10,5"},${0.08 + r() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(r() * 512, 12 + r() * 116, 1 + r() * 3, 1 + r() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}

/** Soft round glow for lamp light pools. */
export function makeGlow() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,210,140,1)");
  g.addColorStop(0.4, "rgba(255,190,110,0.45)");
  g.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c);
}

/** Tileable ripple normal map for the lakes. */
export function makeWaterNormals() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const waves = [
    [3, 1, 0.0, 1.0],
    [1, 4, 1.3, 0.8],
    [5, -2, 2.1, 0.5],
    [-3, 5, 0.7, 0.45],
    [7, 3, 4.0, 0.3],
    [2, -7, 5.2, 0.25],
  ];
  const h = (x: number, y: number) =>
    waves.reduce((s, [kx, ky, p, a]) => s + a * Math.sin(((kx * x + ky * y) / S) * Math.PI * 2 + p), 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
      const i = (y * S + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = texture(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * XMUM flag, 3:2: white with the university badge (public/xmum-logo-badge.webp,
 * the crest and the name) in the middle. The badge loads after the texture is
 * made, so the flag shows plain white for a moment.
 */
export function makeXmumFlag() {
  const W = 600;
  const H = 400;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  const t = texture(c);
  const img = new Image();
  img.onload = () => {
    const s = H * 0.85;
    ctx.drawImage(img, (W - s) / 2, (H - s) / 2, s, s);
    t.needsUpdate = true;
    // Scenes that draw on demand would not show it until the camera moves.
    invalidate();
  };
  img.src = "/xmum-logo-badge.webp";
  return t;
}
