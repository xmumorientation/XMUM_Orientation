import { supabaseServer } from "@/lib/supabase/server";
import type { Permission } from "@/lib/permissions";
import type { CurrentUserContext, UserRole } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// Shared role gate for privileged API routes. UI hiding and RLS are the real
// boundaries; this stops a request early with a clear 403 before touching the
// service-role client. Previously copy-pasted into every admin route.
export async function requireRoleDetail(
  roles: UserRole[]
): Promise<{ user: User; role: UserRole; context: CurrentUserContext } | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("fn_current_user_context").single();
  if (!data) return null;
  const row = data as {
    user_id: string; role: UserRole; group_id: number | null;
    station_id: number | null; day: 1 | 2 | null;
    admin_team: "HOF" | "HOGM" | "TECH" | null; permissions: string[];
  };
  if (!roles.includes(row.role)) return null;
  return { user, role: row.role, context: {
    userId: row.user_id, role: row.role, groupId: row.group_id,
    stationId: row.station_id, day: row.day, adminTeam: row.admin_team,
    permissions: row.permissions ?? [],
  }};
}

export async function requireRole(roles: UserRole[]): Promise<User | null> {
  return (await requireRoleDetail(roles))?.user ?? null;
}

export function requireAdmin(): Promise<User | null> {
  return requireRole(["admin"]);
}

export async function requirePermission(permission: Permission) {
  const detail = await requireRoleDetail(["faci", "gm", "admin"]);
  if (!detail?.context.permissions.includes(permission)) return null;
  return { user: detail.user, context: detail.context };
}
