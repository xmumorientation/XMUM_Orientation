import QRCode from "qrcode";

import { themeFromColor } from "@/components/freshie/groupTheme";
import { groupJoinPath } from "@/lib/group-login";

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

function urlLines(ctx: CanvasRenderingContext2D, url: string, maxWidth: number) {
  let size = 26;
  const font = (n: number) => `600 ${n}px ui-monospace, "JetBrains Mono", monospace`;
  while (size > 16) {
    ctx.font = font(size);
    if (ctx.measureText(url).width <= maxWidth) return { lines: [url], size };
    size -= 1;
  }
  ctx.font = font(16);
  const cut = url.indexOf("?");
  if (cut > 0) {
    const head = url.slice(0, cut);
    const tail = url.slice(cut);
    if (ctx.measureText(head).width <= maxWidth && ctx.measureText(tail).width <= maxWidth) {
      return { lines: [head, tail], size: 16 };
    }
  }
  return { lines: [url], size: 16 };
}

/** Same card Freshie control downloads: password, join link, QR, group colour. */
export async function groupQrPng(groupId: number, code: string, color: string): Promise<string> {
  const url = `${window.location.origin}${groupJoinPath(groupId, code)}`;
  const theme = themeFromColor(color);
  const qrUrl = await QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: "M" });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not draw the QR code"));
    img.src = qrUrl;
  });

  const outer = 48;
  const qrPad = 32;
  const radius = 56;
  const innerW = img.width + qrPad * 2;
  const width = innerW + outer * 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrUrl;

  const fitted = urlLines(ctx, url, innerW);
  const passSize = 84;
  const top = 36;
  const urlGap = 16;
  const urlLineH = fitted.size + 10;
  const header = top + passSize + urlGap + fitted.lines.length * urlLineH + 28;
  canvas.width = width;
  canvas.height = header + img.height + qrPad * 2 + outer;

  roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
  ctx.fillStyle = theme.accent;
  ctx.fill();

  ctx.fillStyle = theme.onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${passSize}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.fillText(code, canvas.width / 2, top + passSize / 2);
  ctx.font = `600 ${fitted.size}px ui-monospace, "JetBrains Mono", monospace`;
  fitted.lines.forEach((line, i) => {
    const y = top + passSize + urlGap + urlLineH * i + urlLineH / 2;
    ctx.fillText(line, canvas.width / 2, y);
  });

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
