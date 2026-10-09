import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// "#0891b2" -> "8 145 178", for CSS vars consumed as
// rgb(var(--x-rgb) / <alpha-value>) so Tailwind opacity modifiers work
// against a runtime-set brand color. Falls back to a mid-gray triple on
// anything that isn't a valid 6-digit hex (defensive: this reads directly
// from Admin-editable config).
export function hexToRgbChannels(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "115 115 115";
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r} ${g} ${b}`;
}

export function initialsFrom(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();
  return letters.slice(0, 2) || "OR";
}

// Client-generated idempotency key (FR-5.7)
export function idemKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function timeAgo(iso: string, nowMs?: number): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, (nowMs ?? Date.now()) - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// FR-3.3: data older than 10 min is stale
export function isStale(iso: string, nowMs?: number): boolean {
  return (nowMs ?? Date.now()) - new Date(iso).getTime() > 10 * 60 * 1000;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Human-readable messages for RPC error codes raised in 0003_functions.sql
const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to do that.",
  TOKENS_FROZEN: "Token operations are currently frozen by Admin.",
  INVALID_DELTA: "Invalid token amount.",
  PHASE_LOCKED: "This action isn't available in the current game phase.",
  INSUFFICIENT_BALANCE: "Not enough tokens — the balance can't go negative.",
  GROUP_NOT_FOUND: "Group not found.",
  ITEM_NOT_FOUND: "Item not found.",
  DUPLICATE_PUZZLE_PIECE: "This group already owns that puzzle piece.",
  BLINDBOX_DISABLED: "Blind box is currently disabled by Admin.",
  SET_INCOMPLETE: "The puzzle set is not complete yet.",
  PROJECTOR_ALREADY_ACTIVATED: "This projector has already been revived!",
  ALREADY_REDEEMED: "This set has already been redeemed.",
  NFC_DISABLED: "NFC activation is currently disabled by Admin.",
  NOT_IN_GROUP: "Your account isn't assigned to a group yet.",
  NOT_ENDGAME: "Projector activation is only possible during the Endgame.",
  TOKEN_UNKNOWN: "This activation code isn't recognised.",
  TOKEN_USED: "This activation code has already been used.",
  SET_NOT_REDEEMED: "Your group's puzzle set hasn't been verified by a Guardian yet.",
  ALREADY_ACTIVATED: "This projector has already been revived!",
  GROUP_ALREADY_ACTIVATED_ONE: "Your group has already revived a projector.",
  NOT_YOUR_STATION: "You can only update your own station.",
  STATION_NOT_FOUND: "Station not found.",
  STATION_FULL: "This station is full. Pick another one.",
  STATION_CLOSED: "This station is closed.",
  NOT_CHECKED_IN: "Your group isn't checked in at a station.",
  SESSION_CLOSED: "This attendance session is closed.",
  NOT_YOUR_GROUP: "That student is not in your group.",
  FRESHIE_HAS_NO_GROUP: "That student hasn't been assigned to a group.",
  NOTHING_TO_UNDO: "No recent transaction to undo.",
  UNDO_WINDOW_EXPIRED: "The 2-minute undo window has passed.",
  UNDO_WOULD_GO_NEGATIVE: "Undo rejected: it would make the balance negative.",
  NO_STATION_ASSIGNED: "Your account has no station assigned — ask Admin.",
  SESSION_NOT_OPEN: "This session hasn't been opened yet.",
  NO_END_TIME: "Set an end time first (here, or the planned end on the Schedule page).",
  END_TIME_PASSED: "That end time has already passed. Pick a later time.",
  TIMER_ALREADY_RUNNING: "This timer is already running.",
  ANOTHER_TIMER_RUNNING: "Another timer is running. End it first.",
  WRONG_DAY_STATION: "Your station isn't set up for this day — ask Admin.",
  INVALID_RESULT: "Pick Win or Lose.",
  NEED_TWO_LOCATIONS: "Pick exactly 2 locations for a medium-risk station.",
  NEED_ONE_LOCATION: "Pick exactly 1 location for a high-risk station.",
  POOL_EXHAUSTED:
    "This group already owns every piece available from that choice — pick differently.",
  FRESHIE_ONLY: "Only Freshie accounts can open blind boxes.",
  BOX_UNKNOWN: "This blind box code isn't active.",
  BOXES_SOLD_OUT: "All blind boxes here have been given out!",
  BB_ALREADY_FROM_SELLER: "Your group has already opened a box from this seller.",
  BB_GROUP_CAP: "Your group has used all its blind box opens.",
  BB_TYPE_NAME_MISSING: "Enter a name for the box type.",
  BB_RANGE_INVALID: "Check the numbers: max must be at least min, and nothing can be negative.",
  BB_TYPE_EXISTS: "A box type with that name already exists.",
  BB_TYPE_NOT_FOUND: "Box type not found.",
  BB_TYPE_ARCHIVED: "That box type is archived.",
  BB_TARGET_INVALID: "Pick who the boxes go to (an eligible account, role or station).",
  BB_NO_TARGETS: "Nobody matches that choice yet.",
  TOKEN_RESET_LOCKED:
    "Reset is locked. Turn on Rehearsal mode in Live control first; it only works while testing.",
  BB_RESET_LOCKED: "Turn on Rehearsal mode in Live control first. The reset only works while testing.",
  BB_RESET_CONFIRM: "Type RESET (capitals) to confirm.",
  BB_RESET_SCOPE: "Pick what to reset.",
  NOT_ACTIVE: "The phase is not active.",
  NOT_PAUSED: "The phase is not paused.",
  PHASE_NOT_FOUND: "Phase not found.",
  USER_NOT_FOUND: "User not found.",
  NAME_REQUIRED: "Full name is required.",
  GROUP_NAME_REQUIRED: "Enter a group name.",
  NAME_TAKEN: "Another group already uses that name.",
  NAME_TOO_LONG: "Keep the group name to 40 characters.",
  SLOGAN_TOO_LONG: "Keep the slogan to 80 characters.",
  FACI_ONLY: "Only a facilitator can save this.",
  NO_GROUPS_CONFIGURED: "No groups configured yet — set the total number of groups first.",
  INVALID_COUNT: "Enter a group count between 1 and 200.",
  FRESHIE_NOT_FOUND: "Freshie not found.",
};


export function friendlyError(err: unknown): string {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  // These blind-box errors carry numbers worth showing, so keep the detail.
  const detailed = /(BB_NOT_ENOUGH_STOCK|BB_STOCK_BELOW_ASSIGNED|BB_QTY_BELOW_OPENED): ([^\n]+)/.exec(msg);
  if (detailed) {
    const lead =
      detailed[1] === "BB_NOT_ENOUGH_STOCK"
        ? "Not enough stock"
        : detailed[1] === "BB_STOCK_BELOW_ASSIGNED"
          ? "Stock can't go below what's assigned"
          : "Can't go below what's already opened";
    return `${lead} — ${detailed[2]}.`;
  }
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (msg.includes(code)) return ERROR_MESSAGES[code];
  }
  return msg || "Something went wrong. Please try again.";
}
