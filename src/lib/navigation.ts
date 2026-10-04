import type { Permission } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

export interface NavigationItem {
  href: string;
  label: string;
  code: string;
  permission?: Permission;
}

// One current-orientation menu definition per role. Freshie entries are kept
// for the roster/public experience; they do not create authentication access.
export const ROLE_NAVIGATION: Record<UserRole, NavigationItem[]> = {
  freshie: [
    { href: "/inventory", label: "My Group", code: "IT", permission: "inventory.view" },
    { href: "/map", label: "Group Location", code: "MP", permission: "map.view" },
  ],
  faci: [
    { href: "/inventory", label: "Inventory", code: "IT", permission: "inventory.view" },
    { href: "/map", label: "Map", code: "MP", permission: "map.view" },
    { href: "/lighting", label: "Lighting Zone", code: "LZ", permission: "lighting.view" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
    { href: "/token", label: "Group Tokens", code: "TK", permission: "token.view" },
  ],
  gm: [
    { href: "/gm/day-1", label: "Day 1", code: "G1", permission: "gameplay.day1" },
    { href: "/gm/day-2", label: "Day 2", code: "G2", permission: "gameplay.day2" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
    { href: "/token", label: "Token System", code: "TK", permission: "token.play" },
  ],
  committee: [
    { href: "/admin/operations", label: "Operations", code: "OP", permission: "operations.manage" },
    { href: "/map", label: "Live Map", code: "MP", permission: "map.view" },
    { href: "/lighting", label: "Lighting Zone", code: "LZ", permission: "lighting.view" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
  ],
  hof: [
    { href: "/admin/accounts", label: "Faci Allocation", code: "FA", permission: "allocation.faci.manage" },
    { href: "/admin/puzzles", label: "Puzzle Inventory", code: "PZ", permission: "puzzle.manage" },
    { href: "/admin/token", label: "Token Corrections", code: "TK", permission: "token.manage" },
    { href: "/admin/correction-reasons", label: "Correction Reasons", code: "CR", permission: "correction_reasons.manage" },
    { href: "/admin/logs", label: "Logs", code: "LG", permission: "logs.audit" },
    { href: "/map", label: "Live Map", code: "MP", permission: "map.view" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
  ],
  hogm: [
    { href: "/gm/day-1", label: "Day 1", code: "G1", permission: "gameplay.day1" },
    { href: "/gm/day-2", label: "Day 2", code: "G2", permission: "gameplay.day2" },
    { href: "/admin/accounts", label: "GM Allocation", code: "GA", permission: "allocation.gm.manage" },
    { href: "/admin/configuration", label: "Gameplay Setup", code: "CF", permission: "configuration.gameplay.manage" },
    { href: "/admin/stations", label: "Stations", code: "ST", permission: "stations.manage" },
    { href: "/admin/puzzles", label: "Puzzle Inventory", code: "PZ", permission: "puzzle.manage" },
    { href: "/admin/token", label: "Tokens", code: "TK", permission: "token.manage" },
    { href: "/admin/correction-reasons", label: "Correction Reasons", code: "CR", permission: "correction_reasons.manage" },
    { href: "/admin/logs", label: "Logs", code: "LG", permission: "logs.audit" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
  ],
  admin: [
    { href: "/admin", label: "Control Room", code: "AD", permission: "admin.access" },
    { href: "/admin/operations", label: "Operations", code: "OP", permission: "operations.manage" },
    { href: "/admin/logs", label: "Logs & Corrections", code: "LG", permission: "logs.audit" },
    { href: "/admin/roster", label: "Freshie Roster", code: "RC", permission: "accounts.manage" },
    { href: "/admin/token", label: "Token Log", code: "TK", permission: "token.manage" },
    { href: "/admin/correction-reasons", label: "Correction Reasons", code: "CR", permission: "correction_reasons.manage" },
    { href: "/admin/accounts", label: "Accounts", code: "AC", permission: "accounts.manage" },
    { href: "/admin/configuration", label: "Configuration", code: "CF", permission: "configuration.manage" },
    { href: "/admin/blindbox-log", label: "Blind Box Log", code: "BB", permission: "logs.blindbox" },
    { href: "/admin/nfc", label: "NFC", code: "NF", permission: "nfc.recovery" },
    { href: "/admin/audit", label: "Audit Log", code: "AU", permission: "logs.audit" },
    { href: "/timer", label: "Timer", code: "TM", permission: "timer.view" },
  ],
};

export function navigationFor(role: UserRole, permissions: readonly string[]) {
  return ROLE_NAVIGATION[role].filter(
    (item) => !item.permission || permissions.includes(item.permission)
  );
}
