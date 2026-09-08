import { supabaseServer } from "@/lib/supabase/server";
import type {
  AdminTeam,
  CurrentUserContext,
  GameDay,
  UserRole,
} from "@/lib/types";

interface ContextRow {
  user_id: string;
  role: UserRole;
  group_id: number | null;
  station_id: number | null;
  day: GameDay | null;
  admin_team: AdminTeam | null;
  permissions: string[];
}

// Canonical server-side allocation resolver. Ownership-sensitive routes must
// derive group/station from this authenticated context instead of trusting a
// group_id or station_id supplied by the browser.
export async function resolveCurrentUserContext(): Promise<CurrentUserContext | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .rpc("fn_current_user_context")
    .single();
  if (error || !data) return null;

  const row = data as ContextRow;
  return {
    userId: row.user_id,
    role: row.role,
    groupId: row.group_id,
    stationId: row.station_id,
    day: row.day,
    adminTeam: row.admin_team,
    permissions: row.permissions ?? [],
  };
}

export async function requireCurrentUserContext(
  allowedRoles?: UserRole[]
): Promise<CurrentUserContext | null> {
  const context = await resolveCurrentUserContext();
  if (!context) return null;
  if (allowedRoles && !allowedRoles.includes(context.role)) return null;
  return context;
}

export function requireAssignedGroup(
  context: CurrentUserContext
): number | null {
  return context.groupId;
}

export function requireAssignedStation(
  context: CurrentUserContext,
  day: GameDay
): number | null {
  return context.day === day ? context.stationId : null;
}
