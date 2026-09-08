// Shared domain types mirroring the Supabase schema (migration 0001).

export type UserRole = "freshie" | "faci" | "gm" | "admin";

export type AdminTeam = "HOF" | "HOGM" | "TECH";

export interface CurrentUserContext {
  userId: string;
  role: UserRole;
  groupId: number | null;
  stationId: number | null;
  day: 1 | 2 | null;
  adminTeam: AdminTeam | null;
  permissions: string[];
}

export type StationStatus = "available" | "in_progress" | "closed";
export type GameDay = 1 | 2;
export type PhaseState = "pending" | "active" | "paused" | "ended";
export type ProjectorLocation = "B1" | "A3" | "TF";
export type ItemType = "puzzle" | "facility_card";
export type AttendanceStatus = "present" | "absent" | "late";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  student_id: string | null;
  email: string | null;
  phone: string | null;
  group_id: number | null;
  station_id: number | null;
  username?: string | null;
  admin_team?: AdminTeam | null;
}

export interface Group {
  id: number;
  name: string;
  token_balance: number;
}

export type RiskTier = "low" | "medium" | "high";

export interface Station {
  id: number;
  code: string;
  name: string;
  area: string;
  status: StationStatus;
  map_x: number;
  map_y: number;
  risk_tier: RiskTier;
  entry_cost: number;
}

export const RISK_TIER_META: Record<
  RiskTier,
  { label: string; pick: number; desc: string }
> = {
  low: { label: "Low Risk", pick: 0, desc: "Random piece from any location" },
  medium: { label: "Medium Risk", pick: 2, desc: "Pick 2 locations, random piece from them" },
  high: { label: "High Risk", pick: 1, desc: "Pick 1 location, guaranteed piece for it" },
};

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

export interface BlindBoxAllocation {
  id: number;
  profile_id: string;
  box_type: "normal" | "special";
  min_tokens: number;
  max_tokens: number;
  total_boxes: number;
  used_boxes: number;
  active: boolean;
}

export interface BlindBoxResult {
  ok: boolean;
  tokens: number;
  special: boolean;
  member_name: string | null;
  balance: number;
}

export interface Day2Result {
  ok: boolean;
  duplicate: boolean;
  balance: number;
  success: boolean;
  cost: number;
  piece_name: string | null;
  piece_location: ProjectorLocation | null;
  piece_index: number | null;
}

export interface ScheduleItem {
  id: number;
  day_label: string;
  time_label: string;
  title: string;
  location: string;
  description: string;
  sort_order: number;
}

export interface FaqItem {
  id: number;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
}

export const PIECES_PER_SET = 5;

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
  admin: "Admin",
};

export const ADMIN_TIER: UserRole[] = ["admin"];

// ── Freshie Registration & Group Assignment (D-Day desk) ─────────────────
// Freshies have no authentication accounts. Their roster and group allocation
// are stored separately from the Faci, GM, and Admin `profiles`.

export type FreshieGender = "Male" | "Female";
export type FreshieNationality = "Local" | "International";

export interface Freshie {
  id: number;
  full_name: string;
  phone: string | null;
  gender: FreshieGender;
  nationality: FreshieNationality;
  student_id: string | null;
  group_id: number | null;
  created_at: string;
}

export interface FreshieGroupStats {
  group_id: number;
  group_name: string;
  headcount: number;
  male_count: number;
  female_count: number;
  local_count: number;
  international_count: number;
}

export interface RegisterFreshieResult {
  ok: boolean;
  freshie_id: number;
  group_id: number;
  group_name: string;
}


