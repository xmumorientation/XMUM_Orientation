import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

import type { ProjectorLocation } from "./types";

// One-time NFC activation tokens (FR-9.1/9.2).
// Format: base64url(payload).base64url(hmac-sha256(payload, secret))
// payload = { l: location, n: nonce } — the nonce makes every sticker unique
// so spares carry distinct tokens. The DB stores sha256(token) and enforces
// single-use; the HMAC stops anyone minting their own tokens.

function secret(): string {
  const s = process.env.NFC_TOKEN_SECRET;
  if (!s || s.length < 16) throw new Error("NFC_TOKEN_SECRET not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generateNfcToken(location: ProjectorLocation): {
  token: string;
  tokenHash: string;
} {
  const payload = b64url(
    Buffer.from(JSON.stringify({ l: location, n: b64url(randomBytes(12)) }))
  );
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  const token = `${payload}.${sig}`;
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyNfcToken(
  token: string
): { valid: true; location: ProjectorLocation } | { valid: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };
  const [payload, sig] = parts;
  try {
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return { valid: false };
    }
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.l !== "B1" && data.l !== "A3" && data.l !== "TF") {
      return { valid: false };
    }
    return { valid: true, location: data.l };
  } catch {
    return { valid: false };
  }
}

export function nfcUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/activate?t=${encodeURIComponent(token)}`;
}
