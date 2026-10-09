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
  /** False until an admin approves a Google sign-in. Existing accounts stay true. */
  approved?: boolean;
  /** Role chosen on the login page. Applied only when an admin approves. */
  requested_role?: UserRole | null;
}

export interface Group {
  id: number;
  /** Group number label, for example "Group 1". Not the name the group chooses. */
  name: string;
  token_balance: number;
  /** Freshie accent. Null until migration 0031 is applied. */
  color?: string | null;
  /** Name the facilitator chose. Null until they save one. */
  display_name?: string | null;
  slogan?: string | null;
}

export type RiskTier = "low" | "medium" | "high";

export interface Station {
  id: number;
  code: string;
  name: string;
  /** A1–A5, B1, or Track & Field. */
  area: string;
  /** Game or purpose set by an admin. Empty until one is chosen. */
  purpose: string;
  status: StationStatus;
  map_x: number;
  map_y: number;
  risk_tier: RiskTier;
  entry_cost: number;
  day: 1 | 2;
  /** How many groups fit at once. When full, status becomes In progress. */
  max_groups: number | null;
  /** Real-world position, used only to warn a far-away check-in. */
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  /** An admin or GM forced In progress. Cleared when the station is cleared. */
  status_override: boolean;
}

export interface StationPurpose {
  id: number;
  name: string;
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

/** Admin-defined blind box type (migration 0054). */
export interface BlindBoxType {
  id: number;
  name: string;
  min_tokens: number;
  max_tokens: number;
  price: number;
  /** Total boxes of this type that exist. Assignments are drawn from it. */
  stock: number;
  is_special: boolean;
  archived: boolean;
}

/** A box type handed to one seller: an account OR a station (shared pool). */
export interface BlindBoxAssignment {
  id: number;
  type_id: number;
  profile_id: string | null;
  station_id: number | null;
  /** Total assigned, including boxes already opened. */
  quantity: number;
  opened: number;
  qr_version: number;
  active: boolean;
}

export interface BlindBoxClaim {
  id: number;
  assignment_id: number | null;
  type_id: number;
  type_name: string;
  seller_name: string;
  seller_profile_id: string | null;
  seller_station_id: number | null;
  group_id: number;
  price: number;
  tokens: number;
  special: boolean;
  created_at: string;
}

/** What a Freshie sees after scanning, before opening (fn_bb_preview). */
export type BlindBoxPreviewStatus =
  | "ok"
  | "disabled"
  | "frozen"
  | "sold_out"
  | "already_from_seller"
  | "cap_reached"
  | "insufficient";

export interface BlindBoxPreview {
  status: BlindBoxPreviewStatus;
  seller_name: string;
  type_name: string;
  price: number;
  special: boolean;
  balance: number;
  group_claims: number;
  cap: number;
}

export interface BlindBoxResult {
  ok: boolean;
  duplicate: boolean;
  tokens: number;
  price: number;
  special: boolean;
  seller_name: string;
  type_name: string;
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

export type TimerState = "idle" | "running" | "paused" | "ended";

export interface ScheduleItem {
  id: number;
  day_label: string;
  time_label: string;
  title: string;
  location: string;
  description: string;
  sort_order: number;
  // Planned times (migration 0049): what the countdown counts to before the
  // item starts. A live timer never moves them.
  starts_at: string | null;
  ends_at: string | null;
  // Attendance session, created the first time Admin opens it.
  session_id: number | null;
  // Live timer, run from Live control. It counts to timer_end_override if
  // Admin changed the end there, else to the planned end (ends_at).
  timer_end_override: string | null;
  timer_state: TimerState;
  timer_started_at: string | null;
  timer_ends_at: string | null;
  timer_paused_remaining: number | null;
}

export interface FaqItem {
  id: number;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  // Roles that can see the entry. Empty means everyone.
  roles: UserRole[];
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

export interface GpsLocation {
  group_id: number;
  group_name: string;
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

/** Roles that can hold blind boxes: everyone except Facilitator and Freshie.
 *  Mirrors bb_holder_role() in migration 0054. */
export const BLINDBOX_HOLDER_ROLES: UserRole[] = [
  "gm",
  "guardian_gm",
  "committee",
  "hof",
  "hogm",
  "admin",
];


