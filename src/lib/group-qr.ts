import QRCode from "qrcode";

import { themeFromColor } from "@/components/freshie/groupTheme";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The group's printable card: group name, QR, group colour. No password on it:
 * the QR never changes, but Admin can give the group a new password.
 * `url` comes from GET /api/group-join.
 */
const qrCards = new Map<string, Promise<string>>();

export function groupQrPng(label: string, url: string, color: string): Promise<string> {
  const key = JSON.stringify([label, url, color]);
  const cached = qrCards.get(key);
  if (cached) return cached;
  if (qrCards.size >= 12) {
    const oldest = qrCards.keys().next().value;
    if (oldest !== undefined) qrCards.delete(oldest);
  }
  const card = renderGroupQr(label, url, color).catch((error: unknown) => {
    qrCards.delete(key);
    throw error;
  });
  qrCards.set(key, card);
  return card;
}

async function renderGroupQr(label: string, url: string, color: string): Promise<string> {
  const theme = themeFromColor(color);
  const img = document.createElement("canvas");
  await QRCode.toCanvas(img, url, { width: 640, margin: 1, errorCorrectionLevel: "M" });

  const outer = 48;
  const qrPad = 32;
  const radius = 56;
  const innerW = img.width + qrPad * 2;
  const width = innerW + outer * 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.toDataURL("image/png");

  const labelSize = 72;
  const top = 36;
  const header = top + labelSize + 36;
  canvas.width = width;
  canvas.height = header + img.height + qrPad * 2 + outer;

  roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
  ctx.fillStyle = theme.accent;
  ctx.fill();

  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${labelSize}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.fillText(label, canvas.width / 2, top + labelSize / 2, innerW);

  const boxX = outer;
  const boxY = header;
  roundRect(ctx, boxX, boxY, innerW, img.height + qrPad * 2, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(img, boxX + qrPad, boxY + qrPad);
  return canvas.toDataURL("image/png");
}

export function saveGroupQr(groupId: number, png: string) {
  const link = document.createElement("a");
  link.href = png;
  link.download = `group${groupId}.png`;
  link.click();
}
