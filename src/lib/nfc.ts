import { hashToken, signPayload, verifyToken } from "./signed-token";

import type { ProjectorLocation } from "./types";

// One-time NFC activation tokens (FR-9.1/9.2), built on the shared
// signed-token helper. Payload: { k: "nfc", l: location }.

export { hashToken };

export function generateNfcToken(location: ProjectorLocation): {
  token: string;
  tokenHash: string;
} {
  const token = signPayload({ k: "nfc", l: location });
  return { token, tokenHash: hashToken(token) };
}

export function verifyNfcToken(
  token: string
): { valid: true; location: ProjectorLocation } | { valid: false } {
  const res = verifyToken(token);
  if (!res.valid) return { valid: false };
  const { k, l } = res.payload as { k?: string; l?: string };
  // tokens minted before the blind-box refactor have no `k` field
  if (k !== undefined && k !== "nfc") return { valid: false };
  if (l !== "B1" && l !== "A3" && l !== "TF") return { valid: false };
  return { valid: true, location: l };
}

export function nfcUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/activate?t=${encodeURIComponent(token)}`;
}
