// Shared domain types mirroring the Supabase schema (migration 0001).

export type UserRole =
  | "freshie"
  | "faci"
  | "gm"
  | "guardian_gm"
  | "hof"
  | "hogm"
  | "committee"
  | "admin";

export type StationStatus = "available" | "in_progress" | "closed";
export type PhaseState = "pending" | "active" | "paused" | "ended";
export type ProjectorLocation = "B1" | "A3" | "TF";
export type ItemType = "puzzle" | "facility_card";
export type AttendanceStatus = "present" | "absent";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  student_id: string | null;
  email: string | null;
  phone: string | null;
  group_id: number | null;
  station_id: number | null;
}

export interface Group {
  id: number;
  name: string;
  token_balance: number;
}

export interface Station {
  id: number;
  code: string;
  name: string;
  area: string;
  status: StationStatus;
  map_x: number;
  map_y: number;
}

export interface Projector {
  location: ProjectorLocation;
  name: string;
  map_x: number;
  map_y: number;
  activated_by_group: number | null;
  activated_at: string | null;
  activated_manually: boolean;
}

export interface TokenTransaction {
  id: number;
  group_id: number;
  delta: number;
  reason: string;
  actor: string | null;
  station_id: number | null;
  created_at: string;
}

export interface Item {
  id: number;
  type: ItemType;
  name: string;
  description: string;
  puzzle_location: ProjectorLocation | null;
  puzzle_index: number | null;
  is_gala: boolean;
}

export interface InventoryEntry {
  id: number;
  group_id: number;
  item_id: number;
  item_type: ItemType;
  source: string;
  created_at: string;
  items?: Item;
}

export interface Phase {
  id: number;
  key: string;
  name: string;
  duration_minutes: number;
  state: PhaseState;
  started_at: string | null;
  ends_at: string | null;
  paused_remaining: number | null;
  is_endgame: boolean;
  sort_order: number;
}

export interface AttendanceSession {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  closed: boolean;
}

export interface GachaPool {
  id: number;
  key: string;
  name: string;
  description: string;
  cost_tokens: number;
  bonus_tokens: number;
  enabled: boolean;
  allowed_roles: UserRole[];
}

export interface GachaPoolEntry {
  id: number;
  pool_id: number;
  label: string;
  kind: "facility_card" | "tokens" | "clue" | "nothing";
  item_id: number | null;
  token_amount: number;
  weight: number;
  remaining: number | null;
}

export interface GachaResult {
  ok: boolean;
  duplicate: boolean;
  draw_id: number;
  kind: string;
  label: string;
  token_amount: number;
  bonus_tokens: number;
  is_gala: boolean;
  balance: number;
}

export interface LatestLocation {
  group_id: number;
  group_name: string;
  source: "gps" | "manual";
  station_id: number | null;
  station_name: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  reported_at: string;
}

export interface AuditEntry {
  id: number;
  actor: string | null;
  actor_role: UserRole | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export const PROJECTOR_LOCATIONS: ProjectorLocation[] = ["B1", "A3", "TF"];

export const PROJECTOR_LABELS: Record<ProjectorLocation, string> = {
  B1: "B1 Basement",
  A3: "A3 Building",
  TF: "Track & Field",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  freshie: "Freshie",
  faci: "Facilitator",
  gm: "Game Master",
  guardian_gm: "Guardian GM",
  hof: "Head of Facilitators",
  hogm: "Head of Game Masters",
  committee: "Committee",
  admin: "Admin",
};

export const COMMITTEE_TIER: UserRole[] = ["hof", "hogm", "committee", "admin"];
