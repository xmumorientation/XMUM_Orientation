/**
 * Server-side version / revoke state for group passes.
 *
 * Node-only (API routes + RSC). Not imported by Edge middleware.
 *
 * Rotate/revoke model:
 * - Each group has a current minimum version (default 1, or from last redeem).
 * - Cookie.v must be >= current version AND equal to the version that was
 *   current when minted relative to rotates: we require cookie.v === current
 *   after a rotate bumps past older cookies.
 * - On rotate(groupId): bump version by 1 → all existing cookies for that
 *   group fail until a new code (with the new version) is redeemed.
 * - On redeem of code with version V: if V < current → reject (old code).
 *   If V >= current → accept, set current = V, mint cookie with v=V.
 *   Also revoke prior jtis tracked for that group (optional hardening;
 *   version bump is the primary kill switch for code replace).
 *
 * In-memory: fine for local/single-node. Production should move to Redis/DB
 * (Security Checker note).
 */

import type { GroupPassPayload } from "./group-pass";

type GroupState = {
  version: number;
  /** Latest jtis still considered active for audit; on rotate we clear. */
  activeJtis: Set<string>;
  revokedJtis: Set<string>;
};

const states = new Map<string, GroupState>();

function stateFor(groupId: string): GroupState {
  let s = states.get(groupId);
  if (!s) {
    s = { version: 1, activeJtis: new Set(), revokedJtis: new Set() };
    states.set(groupId, s);
  }
  return s;
}

export function getGroupPassVersion(groupId: string): number {
  return stateFor(groupId).version;
}

/** Ensure current version is at least `version` (e.g. after redeem). */
export function ensureGroupPassVersion(
  groupId: string,
  version: number
): number {
  const s = stateFor(groupId);
  if (version > s.version) {
    // Advancing version invalidates older cookies
    for (const j of s.activeJtis) s.revokedJtis.add(j);
    s.activeJtis.clear();
    s.version = version;
  }
  return s.version;
}

/**
 * Bump version for a group (code replace / revoke).
 * Returns the new version. Old cookies and lower-version codes fail.
 */
export function rotateGroupPassVersion(groupId: string): number {
  const s = stateFor(groupId);
  for (const j of s.activeJtis) s.revokedJtis.add(j);
  s.activeJtis.clear();
  s.version += 1;
  return s.version;
}

export function trackPassJti(groupId: string, jti: string): void {
  const s = stateFor(groupId);
  s.activeJtis.add(jti);
}

export function revokePassJti(groupId: string, jti: string): void {
  const s = stateFor(groupId);
  s.activeJtis.delete(jti);
  s.revokedJtis.add(jti);
}

export type PassCurrency =
  | { current: true }
  | { current: false; reason: "rotated" | "revoked" };

/** Full currency check after HMAC+expiry succeeded. */
export function isGroupPassCurrent(pass: GroupPassPayload): PassCurrency {
  const s = stateFor(pass.g);
  if (s.revokedJtis.has(pass.j)) return { current: false, reason: "revoked" };
  if (pass.v < s.version) return { current: false, reason: "rotated" };
  // pass.v > s.version can happen if store restarted; accept and heal
  if (pass.v > s.version) {
    s.version = pass.v;
  }
  return { current: true };
}

/** Test helper — clear all state. */
export function __resetGroupPassStoreForTests(): void {
  states.clear();
}
