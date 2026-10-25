import { signPayloadStable, verifyToken } from "./signed-token";
import { siteUrl } from "./site-url";

// Blind-box QR tokens. Payload: { k: "bb3", s: sellerId, v: qrVersion }.
// ONE code per seller (an account or a station), covering the box type the
// seller holds. A seller with TWO OR MORE live box types gets one code per
// type instead, { k: "bb4", s, v, a: assignmentId }, so a Freshie scans the
// code of the box they want and can only buy that one (the page shows just
// that assignment). A seller with one type, and the Spot, keep the bb3 code
// that is already printed. The token is an HMAC of that payload, recomputed whenever a
// link is needed and never stored, so Admin can preview any link without
// invalidating it. "Regenerate" bumps the seller's qr_version in the database,
// which kills the old QR.
// The QR encodes /blindbox?t=<token>. The page is public: it verifies the
// signature, and the RPCs (fn_bb_seller_preview / fn_bb_buy) check the version,
// stock and limits for a signed-in Freshie group.

export function blindBoxToken(sellerId: number, version: number, assignmentId?: number): string {
  return assignmentId === undefined
    ? signPayloadStable({ k: "bb3", s: sellerId, v: version })
    : signPayloadStable({ k: "bb4", s: sellerId, v: version, a: assignmentId });
}

export function verifyBlindBoxToken(
  token: string
): { valid: true; sellerId: number; version: number; assignmentId?: number } | { valid: false } {
  const res = verifyToken(token);
  if (!res.valid) return { valid: false };
  const { k, s, v, a } = res.payload as { k?: string; s?: unknown; v?: unknown; a?: unknown };
  if ((k !== "bb3" && k !== "bb4") || !Number.isInteger(s) || !Number.isInteger(v)) {
    return { valid: false };
  }
  if (k === "bb4") {
    if (!Number.isInteger(a)) return { valid: false };
    return { valid: true, sellerId: s as number, version: v as number, assignmentId: a as number };
  }
  return { valid: true, sellerId: s as number, version: v as number };
}

export function blindBoxUrl(token: string): string {
  return `${siteUrl()}/blindbox?t=${encodeURIComponent(token)}`;
}

export function blindBoxUrlFor(sellerId: number, version: number, assignmentId?: number): string {
  return blindBoxUrl(blindBoxToken(sellerId, version, assignmentId));
}
