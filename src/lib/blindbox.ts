import { signPayloadStable, verifyToken } from "./signed-token";

// Blind-box QR tokens. Payload: { k: "bb2", a: assignmentId, v: qrVersion }.
// The token is an HMAC of that payload, recomputed whenever a link is needed
// and never stored, so Admin can preview any link without invalidating it.
// "Regenerate" bumps qr_version in the database, which kills the old QR.
// The QR encodes /blindbox?t=<token>; the page verifies the signature and the
// RPCs (fn_bb_preview / fn_open_blind_box) check the version, stock and limits.

export function blindBoxToken(assignmentId: number, version: number): string {
  return signPayloadStable({ k: "bb2", a: assignmentId, v: version });
}

export function verifyBlindBoxToken(
  token: string
): { valid: true; assignmentId: number; version: number } | { valid: false } {
  const res = verifyToken(token);
  if (!res.valid) return { valid: false };
  const { k, a, v } = res.payload as { k?: string; a?: unknown; v?: unknown };
  if (k !== "bb2" || !Number.isInteger(a) || !Number.isInteger(v)) {
    return { valid: false };
  }
  return { valid: true, assignmentId: a as number, version: v as number };
}

export function blindBoxUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/blindbox?t=${encodeURIComponent(token)}`;
}

export function blindBoxUrlFor(assignmentId: number, version: number): string {
  return blindBoxUrl(blindBoxToken(assignmentId, version));
}
