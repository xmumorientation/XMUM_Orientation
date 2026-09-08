import { createHash, randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type AuthAuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.register";

export function identifierHash(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
}

export async function recordAuthAudit({
  action,
  actor = null,
  actorRole = null,
  identifier,
  reason,
}: {
  action: AuthAuditAction;
  actor?: string | null;
  actorRole?: UserRole | null;
  identifier?: string;
  reason?: string;
}) {
  const detail = identifier
    ? { identifier_hash: identifierHash(identifier) }
    : {};
  // Authentication should not fail merely because observability is degraded.
  try {
    await supabaseAdmin()
      .from("audit_log")
      .insert({
        actor,
        actor_role: actorRole,
        action,
        target: actor ? `user:${actor}` : null,
        detail,
        reason: reason ?? null,
        request_id: randomUUID(),
      });
  } catch {
    // A temporary audit outage must not lock users out of authentication.
  }
}
