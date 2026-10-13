import { signPayloadStable, verifyToken } from "./signed-token";

// Blind-box QR tokens. Payload: { k: "bb3", s: sellerId, v: qrVersion }.
// ONE code per seller (an account or a station), covering every box type the
// seller holds. The token is an HMAC of that payload, recomputed whenever a
// link is needed and never stored, so Admin can preview any link without
// invalidating it. "Regenerate" bumps the seller's qr_version in the database,
// which kills the old QR.
// The QR encodes /blindbox?t=<token>. The page is public: it verifies the
// signature, and the RPCs (fn_bb_seller_preview / fn_bb_buy) check the version,
// stock and limits for a signed-in Freshie group.

export function blindBoxToken(sellerId: number, version: number): string {
  return signPayloadStable({ k: "bb3", s: sellerId, v: version });
}

export function verifyBlindBoxToken(
  token: string
): { valid: true; sellerId: number; version: number } | { valid: false } {
  const res = verifyToken(token);
  if (!res.valid) return { valid: false };
  const { k, s, v } = res.payload as { k?: string; s?: unknown; v?: unknown };
  if (k !== "bb3" || !Number.isInteger(s) || !Number.isInteger(v)) {
    return { valid: false };
  }
  return { valid: true, sellerId: s as number, version: v as number };
}

export function blindBoxUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/blindbox?t=${encodeURIComponent(token)}`;
}

export function blindBoxUrlFor(sellerId: number, version: number): string {
  return blindBoxUrl(blindBoxToken(sellerId, version));
}
