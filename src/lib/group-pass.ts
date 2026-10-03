/**
 * Signed, expiring group Homepage pass.
 *
 * Cookie (httpOnly): base64url(JSON).base64url(HMAC-SHA256)
 *   { g: groupId, e: expUnixSeconds, j: jti, v: version }
 *
 * Wristband/ticket QR → redeem API → sets cookie. Guessing /group/N without
 * a valid pass is denied. Edge-safe (Web Crypto) so middleware can verify.
 *
 * Revoke/rotate: bump per-group version (see group-pass-store). Cookies and
 * codes with a lower version fail. Redeeming a higher-version code advances
 * the group version so older passes die.
 */

export const GROUP_PASS_COOKIE = "xmum_group_pass";

/** Default TTL: 12 hours (D-day session). Override with GROUP_PASS_TTL_SECONDS. */
export const DEFAULT_GROUP_PASS_TTL_SECONDS = 12 * 60 * 60;

const DEV_FALLBACK_SECRET =
  "dev-only-group-pass-secret-do-not-use-in-prod";

export type GroupPassPayload = {
  /** Group id matching /group/[id] */
  g: string;
  /** Expiry (unix seconds) */
  e: number;
  /** Unique id for this pass instance */
  j: string;
  /** Version — must meet current group version after rotate */
  v: number;
};

export type GroupCodeEntry = {
  groupId: string;
  version: number;
};

export type PassVerifyOk = {
  ok: true;
  pass: GroupPassPayload;
};

export type PassVerifyFail = {
  ok: false;
  reason: "missing" | "malformed" | "bad_sig" | "expired" | "payload";
};

function te() {
  return new TextEncoder();
}

function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  // btoa is available in Edge + browsers; Node 18+ also has it on global
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(u8).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const str =
    typeof atob === "function"
      ? atob(b64 + pad)
      : Buffer.from(b64 + pad, "base64").toString("binary");
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

/** Demo codes — accepted only when ENABLE_DEMO_GROUP_CODES is on (default OFF). */
export const DEMO_GROUP_CODES: Record<string, GroupCodeEntry> = {
  "DEMO-GROUP-1": { groupId: "demo-1", version: 1 },
  "DEMO-GROUP-3": { groupId: "demo-3", version: 1 },
};

/**
 * Production-style static allowlist (wristband batch codes).
 * Prefer signed QR payloads in the field; this table is for known counter codes.
 * Empty by default — populate via env or replace with DB lookup later.
 */
export const STATIC_GROUP_CODES: Record<string, GroupCodeEntry> = {};

/**
 * Group passwords from GROUP_PASSWORDS.
 * Format: `password:groupId` or `password:groupId:version`, comma-separated.
 * Each password opens exactly one group (`/group/{groupId}`).
 * Passwords are matched exactly after trim (case-sensitive).
 */
export function groupPasswordsFromEnv(
  raw: string | undefined = process.env.GROUP_PASSWORDS
): Record<string, GroupCodeEntry> {
  if (!raw?.trim()) return {};
  const out: Record<string, GroupCodeEntry> = {};
  for (const part of raw.split(",")) {
    const bits = part.split(":").map((s) => s.trim());
    const code = bits[0];
    const groupId = bits[1];
    if (!code || !groupId) continue;
    const version = bits[2] ? Number(bits[2]) : 1;
    if (!Number.isFinite(version) || version < 1) continue;
    out[code] = { groupId, version: Math.floor(version) };
  }
  return out;
}

export function groupPassSecret(): string {
  const s = process.env.GROUP_PASS_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_SECRET;
  throw new Error("GROUP_PASS_SECRET not configured");
}

export function groupPassTtlSeconds(): number {
  const raw = process.env.GROUP_PASS_TTL_SECONDS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 60 && n <= 7 * 24 * 3600) return Math.floor(n);
  }
  return DEFAULT_GROUP_PASS_TTL_SECONDS;
}

/** Demo fake codes: default OFF. Only "true" / "1" enable. */
export function demoGroupCodesEnabled(): boolean {
  const v = process.env.ENABLE_DEMO_GROUP_CODES?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    te().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signBody(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, te().encode(body));
  return b64urlFromBytes(sig);
}

async function verifyBody(
  body: string,
  sigB64: string,
  secret: string
): Promise<boolean> {
  const key = await hmacKey(secret);
  const sig = bytesFromB64url(sigB64);
  // crypto.subtle.verify wants an ArrayBufferView; copy to guarantee ArrayBuffer
  const sigCopy = new Uint8Array(sig);
  return crypto.subtle.verify("HMAC", key, sigCopy, te().encode(body));
}

function randomJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64urlFromBytes(bytes);
}

/** Build signed cookie value for a group pass. */
export async function mintGroupPass(
  groupId: string,
  version: number,
  opts?: { ttlSeconds?: number; secret?: string }
): Promise<{ token: string; pass: GroupPassPayload }> {
  const ttl = opts?.ttlSeconds ?? groupPassTtlSeconds();
  const secret = opts?.secret ?? groupPassSecret();
  const pass: GroupPassPayload = {
    g: groupId,
    e: Math.floor(Date.now() / 1000) + ttl,
    j: randomJti(),
    v: version,
  };
  const body = b64urlFromBytes(te().encode(JSON.stringify(pass)));
  const sig = await signBody(body, secret);
  return { token: `${body}.${sig}`, pass };
}

/** Verify cookie token: signature + shape + expiry (not version/revoke). */
export async function verifyGroupPassToken(
  token: string | undefined | null,
  opts?: { secret?: string; nowSeconds?: number }
): Promise<PassVerifyOk | PassVerifyFail> {
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [body, sig] = parts;
  let secret: string;
  try {
    secret = opts?.secret ?? groupPassSecret();
  } catch {
    return { ok: false, reason: "bad_sig" };
  }
  const good = await verifyBody(body, sig, secret);
  if (!good) return { ok: false, reason: "bad_sig" };
  try {
    const json = new TextDecoder().decode(bytesFromB64url(body));
    const pass = JSON.parse(json) as Partial<GroupPassPayload>;
    if (
      typeof pass.g !== "string" ||
      !pass.g ||
      typeof pass.e !== "number" ||
      typeof pass.j !== "string" ||
      !pass.j ||
      typeof pass.v !== "number" ||
      !Number.isFinite(pass.v)
    ) {
      return { ok: false, reason: "payload" };
    }
    const now = opts?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (pass.e < now) return { ok: false, reason: "expired" };
    return {
      ok: true,
      pass: { g: pass.g, e: pass.e, j: pass.j, v: pass.v },
    };
  } catch {
    return { ok: false, reason: "payload" };
  }
}

/**
 * Look up a redeemable group code.
 * 1) Demo table when ENABLE_DEMO_GROUP_CODES is on
 * 2) Static allowlist
 * 3) GROUP_PASSWORDS env (`password:groupId`)
 * 4) Signed QR payload: gcode.<body>.<sig> with { k:"gcode", g, v }
 */
export async function lookupGroupCode(
  code: string
): Promise<GroupCodeEntry | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  if (demoGroupCodesEnabled()) {
    const demo = DEMO_GROUP_CODES[trimmed.toUpperCase()];
    if (demo) return demo;
  }

  const staticHit = STATIC_GROUP_CODES[trimmed];
  if (staticHit) return staticHit;

  const envHit = groupPasswordsFromEnv()[trimmed];
  if (envHit) return envHit;

  // Signed wristband/ticket payload
  if (trimmed.startsWith("gcode.")) {
    const raw = trimmed.slice("gcode.".length);
    const parts = raw.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    let secret: string;
    try {
      secret = groupPassSecret();
    } catch {
      return null;
    }
    const good = await verifyBody(parts[0], parts[1], secret);
    if (!good) return null;
    try {
      const json = new TextDecoder().decode(bytesFromB64url(parts[0]));
      const payload = JSON.parse(json) as {
        k?: string;
        g?: string;
        v?: number;
      };
      if (payload.k !== "gcode") return null;
      if (typeof payload.g !== "string" || !payload.g) return null;
      if (typeof payload.v !== "number" || !Number.isFinite(payload.v)) {
        return null;
      }
      return { groupId: payload.g, version: Math.floor(payload.v) };
    } catch {
      return null;
    }
  }

  return null;
}

/** Mint a signed QR code string for a group (staff tooling / tests). */
export async function mintSignedGroupCode(
  groupId: string,
  version: number,
  opts?: { secret?: string }
): Promise<string> {
  const secret = opts?.secret ?? groupPassSecret();
  const payload = { k: "gcode", g: groupId, v: version, n: randomJti() };
  const body = b64urlFromBytes(te().encode(JSON.stringify(payload)));
  const sig = await signBody(body, secret);
  return `gcode.${body}.${sig}`;
}

export function denialReasonMessage(
  reason: string
): { title: string; body: string } {
  switch (reason) {
    case "expired":
      return {
        title: "Pass expired",
        body: "Your group pass has expired. Scan your wristband QR at check-in again to continue.",
      };
    case "revoked":
    case "rotated":
      return {
        title: "Pass no longer valid",
        body: "This group pass was replaced. Scan your wristband QR at check-in to get a fresh pass.",
      };
    case "wrong_group":
      return {
        title: "Wrong group",
        body: "Your pass is for a different group. Scan the wristband QR for your assigned group at check-in.",
      };
    case "missing":
    case "malformed":
    case "bad_sig":
    case "payload":
    default:
      return {
        title: "Group pass required",
        body: "Scan your wristband QR at check-in to open your group page. Guessing the link won’t work.",
      };
  }
}

export function groupPassCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
