import { hashToken, signPayload, verifyToken } from "./signed-token";

// Committee blind-box QR tokens. Payload: { k: "bb", m: profileId }.
// The QR encodes /blindbox?t=<token>; the server verifies the signature
// and the RPC enforces stock + one-claim-per-group-per-member.

export function generateBlindBoxToken(profileId: string): {
  token: string;
  tokenHash: string;
} {
  const token = signPayload({ k: "bb", m: profileId });
  return { token, tokenHash: hashToken(token) };
}

export function verifyBlindBoxToken(
  token: string
): { valid: true; profileId: string } | { valid: false } {
  const res = verifyToken(token);
  if (!res.valid) return { valid: false };
  const { k, m } = res.payload as { k?: string; m?: string };
  if (k !== "bb" || typeof m !== "string") return { valid: false };
  return { valid: true, profileId: m };
}

export function blindBoxUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/blindbox?t=${encodeURIComponent(token)}`;
}

export { hashToken };
