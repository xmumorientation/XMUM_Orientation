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
  /** A1–A5, B1, Track & Field, Tennis Court, Volleyball Court, or TBD. */
  area: string;
  /** Game or purpose set by an admin. Empty until one is chosen. */
  purpose: string;
  status: StationStatus;
  map_x: number;
  map_y: number;
  risk_tier: RiskTier;
  entry_cost: number;
  day: 1 | 2;
  /** How many groups fit at once. A full station refuses more check-ins; its status is not changed. */
  max_groups: number | null;
  /** Real-world position, used only to warn a far-away check-in. */
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  /** Unused since 0078 (status is manual only). */
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
  /** The seller's row: one per account or station, and it holds the one QR version. */
  seller_id: number;
  profile_id: string | null;
  station_id: number | null;
  /** Total assigned, including boxes already sold. */
  quantity: number;
  /** Boxes sold (bought) so far. Opened or not. */
  opened: number;
  qr_version: number;
  active: boolean;
}

/** A box a group has BOUGHT: owned until it is opened from the Items page. */
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
  /** Null until the box is opened. */
  tokens: number | null;
  special: boolean;
  status: "owned" | "opened";
  /** When the box was bought. */
  created_at: string;
  opened_at: string | null;
}

/** What a Freshie sees after scanning a seller's QR, before buying (fn_bb_seller_preview). */
export type BlindBoxPageStatus =
  | "ok"
  | "disabled"
  | "frozen"
  | "sold_out"
  | "already_from_seller"
  | "cap_reached";

export type BlindBoxOptionStatus = "ok" | "sold_out" | "insufficient";

export interface BlindBoxOption {
  assignment_id: number;
  type_name: string;
  price: number;
  special: boolean;
  left: number;
  status: BlindBoxOptionStatus;
}

export interface BlindBoxPreview {
  status: BlindBoxPageStatus;
  seller_name: string;
  group_name: string;
  balance: number;
  group_claims: number;
  cap: number;
  options: BlindBoxOption[];
}

/** fn_bb_buy result. */
export interface BlindBoxBuyResult {
  ok: boolean;
  duplicate: boolean;
  claim_id: number;
  price: number;
  special: boolean;
  seller_name: string;
  type_name: string;
  balance: number;
}

/** fn_bb_open result. */
export interface BlindBoxResult {
  ok: boolean;
  duplicate: boolean;
  claim_id: number;
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

/** One row of fn_group_positions(): a group's best GPS fix and its station check-in. */
export interface GroupPosition {
  group_id: number;
  group_name: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  gps_at: string | null;
  /** Facis whose phone reported in the last 2 minutes. */
  facis_reporting: number;
  facis_total: number;
  checkin_station_id: number | null;
  checkin_station_code: string | null;
  checkin_station_name: string | null;
  checkin_at: string | null;
}

/** One row of fn_group_faci_status(). phone is only filled in for Committee tier. */
export interface FaciStatus {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  last_gps_at: string | null;
  last_accuracy_m: number | null;
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

/** Code names used until the full map unlocks, so a page never gives a location away. */
export const PROJECTOR_CODE_NAMES: Record<ProjectorLocation, string> = {
  B1: "Star",
  A3: "Wheel",
  TF: "Orbit",
};

/** A saved map anchor (map_anchors): a real GPS point and the same spot on the art. */
export interface MapAnchor {
  id: number;
  lat: number;
  lng: number;
  x: number;
  y: number;
  accuracy_m: number | null;
  fixes: number | null;
  created_by: string | null;
  created_at: string;
}

/** One row of fn_admin_check_locations(): an Admin's live position in Accuracy check. */
export interface AdminCheckLocation {
  user_id: string;
  full_name: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  reported_at: string;
}

/** One row of fn_map_lightbulbs(): a lightbulb the viewer may see on the map. */
export interface MapLightbulb {
  location: ProjectorLocation;
  name: string;
  map_x: number;
  map_y: number;
  activated_by_group: number | null;
  group_name: string | null;
  activated_at: string | null;
  activated_manually: boolean;
}

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

/** Event operations crew: the Vortexa staff home, the Ops tab bar and the Welcome page colours. */
export const OPS_ROLES: UserRole[] = ["hof", "hogm", "committee"];

/** Roles with no group whose pages use the Welcome page colours: the ops crew and
 *  Game Masters. Same Vortexa home, tab bar and subpage look; a GM's center tab is
 *  Station (/gm) instead of Ops. */
export const VORTEXA_ROLES: UserRole[] = [...OPS_ROLES, "gm"];

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


