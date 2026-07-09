import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

// Generic HMAC-signed one-time tokens, shared by the NFC stickers and the
// committee blind-box QR codes. Format:
//   base64url(payload).base64url(hmac-sha256(payload, NFC_TOKEN_SECRET))
// The DB stores only sha256(token); the full token lives on the physical
// sticker / QR. The HMAC stops anyone minting their own.

function secret(): string {
  const s = process.env.NFC_TOKEN_SECRET;
  if (!s || s.length < 16) throw new Error("NFC_TOKEN_SECRET not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signPayload(payload: Record<string, unknown>): string {
  const body = b64url(
    Buffer.from(
      JSON.stringify({ ...payload, n: b64url(randomBytes(12)) })
    )
  );
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(
  token: string
): { valid: true; payload: Record<string, unknown> } | { valid: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };
  const [body, sig] = parts;
  try {
    const expected = createHmac("sha256", secret()).update(body).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return { valid: false };
    }
    return {
      valid: true,
      payload: JSON.parse(Buffer.from(body, "base64url").toString()),
    };
  } catch {
    return { valid: false };
  }
}
