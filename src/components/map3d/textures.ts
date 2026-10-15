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

function archWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * Jiageng-style facade: cream render, red-brick base and pilasters, arched
 * windows, an arcade on the ground floor. Returns the colour map and a
 * matching emissive map (lit windows for dusk and night).
 */
export function makeFacade(cols: number, floors: number, seed: number) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [e, ectx] = canvas(S, S);
  const r = rng(seed);
  ctx.fillStyle = "#f2e6cf";
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, S, S);

  const corniceH = S * 0.04;
  const baseH = S * 0.1;
  const pw = S * 0.05;
  ctx.fillStyle = "#fbf7ee";
  ctx.fillRect(0, 0, S, corniceH);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, corniceH, S, 3);
  brick(ctx, 0, S - baseH, S, baseH);
  const pilasters = cols >= 4 ? [0, S / 2 - pw / 2, S - pw] : [0, S - pw];
  for (const x of pilasters) brick(ctx, x, corniceH + 3, pw, S - baseH - corniceH - 3);

  // window columns, kept clear of the pilasters
  const spans: [number, number][] =
    pilasters.length === 3
      ? [
          [pw, S / 2 - pw / 2],
          [S / 2 + pw / 2, S - pw],
        ]
      : [[pw, S - pw]];
  const perSpan = Math.max(1, Math.round(cols / spans.length));
  const top = corniceH + 10;
  const bottom = S - baseH;
  const floorH = (bottom - top) / floors;

  for (let f = 0; f < floors; f++) {
    const ground = f === floors - 1;
    const fy = top + f * floorH;
    // floor line
    ctx.fillStyle = "rgba(160,130,100,0.25)";
    ctx.fillRect(pw, fy + floorH - 2, S - pw * 2, 2);
    for (const [a, b] of spans) {
      const colW = (b - a) / perSpan;
      for (let k = 0; k < perSpan; k++) {
        const ww = colW * (ground ? 0.66 : 0.5);
        const wh = floorH * (ground ? 0.82 : 0.58);
        const wx = a + k * colW + (colW - ww) / 2;
        const wy = fy + (ground ? floorH - wh - 2 : floorH * 0.2);
        archWindow(ctx, wx, wy, ww, wh);
        ctx.fillStyle = ground ? "#4a3f38" : "#3f4d5c";
        ctx.fill();
        ctx.strokeStyle = "#fffaf0";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (r() < (ground ? 0.8 : 0.55)) {
          archWindow(ectx, wx + 2, wy + 2, ww - 4, wh - 4);
          ectx.fillStyle = r() < 0.7 ? "#ffc875" : "#fff0c8";
          ectx.fill();
        }
      }
    }
  }
  const map = texture(c);
  const emissiveMap = texture(e);
  return { map, emissiveMap };
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

function star(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rot = -Math.PI / 2,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Jalur Gemilang (Malaysia), 2:1. */
export function makeMalaysiaFlag() {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const sh = H / 14;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#cc0001";
    ctx.fillRect(0, i * sh, W, sh + 0.5);
  }
  ctx.fillStyle = "#010066";
  ctx.fillRect(0, 0, W / 2, sh * 8);
  const cy = sh * 4;
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(W * 0.17, cy, sh * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#010066";
  ctx.beginPath();
  ctx.arc(W * 0.17 + sh * 0.8, cy, sh * 2.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffcc00";
  star(ctx, W * 0.33, cy, 14, sh * 2.6, sh * 1.15);
  return texture(c);
}

/** Flag of China, 3:2. */
export function makeChinaFlag() {
  const W = 384;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#de2910";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffde00";
  const u = H / 20;
  star(ctx, 5 * u, 5 * u, 5, 3 * u, 1.15 * u);
  for (const [x, y] of [
    [10, 2],
    [12, 4],
    [12, 7],
    [10, 9],
  ]) {
    const a = Math.atan2(5 - y, 5 - x);
    star(ctx, x * u, y * u, 5, u, 0.38 * u, a);
  }
  return texture(c);
}
