export type Permission =
  | "dashboard.view"
  | "inventory.view"
  | "map.view"
  | "map.update"
  | "lighting.view"
  | "timer.view"
  | "group.resources.view"
  | "blindbox.claim"
  | "blindbox.open"
  | "nfc.scan"
  | "attendance.manage"
  | "gameplay.day1"
  | "gameplay.day2"
  | "gameplay.puzzle_verify"
  | "admin.access"
  | "operations.manage"
  | "accounts.manage"
  | "allocation.manage"
  | "configuration.manage"
  | "timer.manage"
  | "logs.token"
  | "logs.puzzle"
  | "logs.blindbox"
  | "logs.nfc"
  | "logs.game"
  | "logs.audit"
  | "corrections.manage"
  | "nfc.recovery"
  | "token.view"
  | "token.play"
  | "token.manage";

export interface RoutePermission {
  prefix: string;
  anyOf: Permission[];
}

// Ordered most-specific-first. Middleware and navigation both use permission
// values returned by fn_current_user_context; this map only associates URLs
// with capabilities and never infers a role.
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  { prefix: "/admin/operations", anyOf: ["operations.manage"] },
  { prefix: "/admin", anyOf: ["admin.access"] },
  { prefix: "/committee", anyOf: ["operations.manage"] },
  { prefix: "/bigscreen", anyOf: ["admin.access"] },
  { prefix: "/register-counter", anyOf: ["accounts.manage"] },
  { prefix: "/guardian", anyOf: ["gameplay.puzzle_verify"] },
  { prefix: "/gm", anyOf: ["gameplay.day1", "gameplay.day2"] },
  { prefix: "/attendance", anyOf: ["attendance.manage"] },
  { prefix: "/checkin", anyOf: ["map.update"] },
  { prefix: "/transactions", anyOf: ["group.resources.view", "logs.token"] },
  { prefix: "/token", anyOf: ["token.view", "token.play", "token.manage"] },
  { prefix: "/inventory", anyOf: ["inventory.view"] },
  { prefix: "/lighting", anyOf: ["lighting.view"] },
  { prefix: "/activate", anyOf: ["nfc.scan"] },
  { prefix: "/blindbox", anyOf: ["blindbox.claim"] },
  { prefix: "/map", anyOf: ["map.view"] },
];

export function hasPermission(
  permissions: readonly string[],
  permission: Permission
): boolean {
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: readonly string[],
  required: readonly Permission[]
): boolean {
  return required.some((permission) => permissions.includes(permission));
}

export function permissionsForPath(pathname: string): Permission[] | null {
  const match = ROUTE_PERMISSIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
  return match?.anyOf ?? null;
}
