import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
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
  GACHA_DISABLED: "The gacha is currently disabled by Admin.",
  POOL_NOT_FOUND: "Gacha pool not found or disabled.",
  POOL_EMPTY: "This gacha pool is empty.",
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
  SESSION_CLOSED: "This attendance session is closed.",
  NOT_YOUR_GROUP: "That student is not in your group.",
  FRESHIE_HAS_NO_GROUP: "That student hasn't been assigned to a group.",
  NOTHING_TO_UNDO: "No recent transaction to undo.",
  UNDO_WINDOW_EXPIRED: "The 2-minute undo window has passed.",
  UNDO_WOULD_GO_NEGATIVE: "Undo rejected: it would make the balance negative.",
  NOT_ACTIVE: "The phase is not active.",
  NOT_PAUSED: "The phase is not paused.",
  PHASE_NOT_FOUND: "Phase not found.",
  USER_NOT_FOUND: "User not found.",
};

export function friendlyError(err: unknown): string {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (msg.includes(code)) return ERROR_MESSAGES[code];
  }
  return msg || "Something went wrong. Please try again.";
}
