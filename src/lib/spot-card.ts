import QRCode from "qrcode";

// The printed card for one hidden (Spot) blind box. The "outer box": a dark
// night panel with the Welcome page's holographic edge (cyan, lilac, pink,
// orange from the Vortexa logo), the logo on top, and the box's own QR on a
// white panel. Drawn on a canvas so Admin can download or print it.
// Colours: --vx-* in components/home/vortexa.css.

const CYAN = "#0dfcfd";
const LILAC = "#e0b4fc";
const PINK = "#fe06ab";
const ORANGE = "#fc9e3d";
const YELLOW = "#f2ff0b";
const INK = "#07060b";
const PURPLE = "#2a0f4d";
const TEXT = "#f3f0fa";
const MUTE = "#cfc9dc";

const W = 900;
const H = 1400;
const LOGO_RATIO = 915 / 1600; // public/vortexa-logo.webp

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A four-point sparkle. */
function sparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

const cache = new Map<string, Promise<string>>();

/** The card as a PNG data URL. `n` is the box's number (1, 2, ...); `url` is its QR link. */
export function spotCodeCard(n: number, url: string, logoSrc = "/vortexa-logo.webp"): Promise<string> {
  const key = `${n}|${url}|${logoSrc}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= 40) cache.delete(cache.keys().next().value as string);
  const p = render(n, url, logoSrc).catch((e: unknown) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, p);
  return p;
}

async function render(n: number, url: string, logoSrc: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");

  const [logo, qr] = await Promise.all([
    loadImage(logoSrc).catch(() => null),
    (async () => {
      const c = document.createElement("canvas");
      await QRCode.toCanvas(c, url, { width: 500, margin: 1, errorCorrectionLevel: "M" });
      return c;
    })(),
  ]);

  // Night panel
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, PURPLE);
  bg.addColorStop(0.55, "#120a26");
  bg.addColorStop(1, INK);
  roundRect(ctx, 0, 0, W, H, 70);
  ctx.fillStyle = bg;
  ctx.fill();

  // Soft glow behind the logo and behind the QR
  for (const [x, y, r, c] of [
    [W / 2, 250, 420, "rgba(13,252,253,0.18)"],
    [W * 0.2, 560, 300, "rgba(254,6,171,0.16)"],
    [W * 0.85, 1100, 360, "rgba(224,180,252,0.16)"],
  ] as [number, number, number, string][]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Sparkles
  const colors = [CYAN, LILAC, PINK, ORANGE, YELLOW];
  const stars: [number, number, number][] = [
    [90, 120, 22], [800, 90, 28], [60, 420, 16], [850, 380, 20], [110, 760, 18], [820, 740, 24],
    [70, 1180, 26], [840, 1230, 18], [450, 60, 14], [200, 1330, 14], [700, 1336, 18],
  ];
  stars.forEach(([x, y, r], i) => sparkle(ctx, x, y, r, colors[i % colors.length]));

  // Holographic edge + a thin inner line
  const holo = ctx.createLinearGradient(0, 0, W, H);
  holo.addColorStop(0, CYAN);
  holo.addColorStop(0.35, LILAC);
  holo.addColorStop(0.65, PINK);
  holo.addColorStop(1, ORANGE);
  ctx.lineWidth = 14;
  ctx.strokeStyle = holo;
  roundRect(ctx, 7, 7, W - 14, H - 14, 66);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(224,180,252,0.45)";
  roundRect(ctx, 38, 38, W - 76, H - 76, 44);
  ctx.stroke();

  // Logo
  const logoW = 580;
  const logoH = logoW * LOGO_RATIO;
  if (logo) ctx.drawImage(logo, (W - logoW) / 2, 70, logoW, logoH);

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = ctx.createLinearGradient(160, 0, W - 160, 0);
  title.addColorStop(0, CYAN);
  title.addColorStop(0.4, LILAC);
  title.addColorStop(0.7, PINK);
  title.addColorStop(1, ORANGE);
  ctx.fillStyle = title;
  ctx.font = `900 86px "Arial Black", "Segoe UI", sans-serif`;
  ctx.fillText("HIDDEN BLIND BOX", W / 2, 70 + logoH + 65, W - 120);
  ctx.fillStyle = MUTE;
  ctx.font = `600 34px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("Scan to claim a free blind box", W / 2, 70 + logoH + 130, W - 120);

  // QR on a white panel with a holographic ring
  const pad = 36;
  const panel = qr.width + pad * 2;
  const px = (W - panel) / 2;
  const py = 70 + logoH + 190;
  ctx.lineWidth = 10;
  ctx.strokeStyle = holo;
  roundRect(ctx, px - 12, py - 12, panel + 24, panel + 24, 52);
  ctx.stroke();
  roundRect(ctx, px, py, panel, panel, 40);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(qr, px + pad, py + pad);

  // Number badge
  const label = `No. ${String(n).padStart(2, "0")}`;
  ctx.font = `800 54px ui-monospace, "JetBrains Mono", Consolas, monospace`;
  const bw = ctx.measureText(label).width + 90;
  const bh = 90;
  const bx = (W - bw) / 2;
  const by = H - 72 - bh;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(label, W / 2, by + bh / 2 + 3);

  return canvas.toDataURL("image/png");
}
