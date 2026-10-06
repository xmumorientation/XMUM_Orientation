// Domain types for the group-centric Token System & Scoreboard (strictly by group_id 1-10)

export type GameDifficulty = "NONE" | "EASY" | "MEDIUM" | "HARD";

export type TransactionType =
  | "DAY1_GAME"
  | "DAY2_ENTRY"
  | "MANUAL_GM_ADJUST"
  | "MANUAL_ADMIN_ADJUST"
  | "SYSTEM_RESET";

export interface TokenGroup {
  group_id: number;
  group_name: string;
  current_tokens: number;
  puzzles_count?: number;
  location_pieces?: Record<number, string[]>; // location_id (1,2,3) -> piece_ids
}

export interface StationItem {
  station_id: number;
  day: number;
  station_name: string;
  difficulty: GameDifficulty;
  token_cost: number;
}

export interface GameConfigRule {
  rule_id: number;
  day: number;
  rule_key: string;
  rule_value: number;
  description?: string;
  updated_at?: string;
}

export interface TokenLog {
  log_id: string;
  group_id: number;
  amount: number;
  transaction_type: TransactionType;
  station_id: number | null;
  notes: string | null;
  created_at: string;
}

export interface PuzzleInventoryItem {
  inventory_id: number;
  group_id: number;
  location_id: number; // 1, 2, or 3
  piece_id: string; // e.g. "LOC1_P1", "LOC2_P3"
  station_id: number | null;
  created_at: string;
}

export const DIFFICULTY_COST_DEFAULTS: Record<GameDifficulty, number> = {
  NONE: 0,
  EASY: 2,
  MEDIUM: 4,
  HARD: 6,
};

export const DEFAULT_RULES: GameConfigRule[] = [
  { rule_id: 1, day: 1, rule_key: "DAY1_WIN_TOKENS", rule_value: 2, description: "Tokens awarded to WIN group in Day 1" },
  { rule_id: 2, day: 1, rule_key: "DAY1_LOSE_TOKENS", rule_value: 1, description: "Tokens awarded to LOSE group in Day 1" },
  { rule_id: 3, day: 2, rule_key: "EASY_COST", rule_value: 2, description: "Entry fee for Easy station in Day 2" },
  { rule_id: 4, day: 2, rule_key: "MEDIUM_COST", rule_value: 4, description: "Entry fee for Medium station in Day 2" },
  { rule_id: 5, day: 2, rule_key: "HARD_COST", rule_value: 6, description: "Entry fee for Hard station in Day 2" },
];

// The five token rules (game_config_rules). Admin sets them on the Token
// page; the GM Station page and the database read them. Day 2 fees are per
// station tier (stations.risk_tier), kept in stations.entry_cost.
export type TokenRuleKey =
  | "DAY1_WIN_TOKENS"
  | "DAY1_LOSE_TOKENS"
  | "EASY_COST"
  | "MEDIUM_COST"
  | "HARD_COST";

export const TOKEN_RULES: {
  key: TokenRuleKey;
  day: 1 | 2;
  label: string;
  hint: string;
  sign: 1 | -1;
  min: number;
  fallback: number;
}[] = [
  { key: "DAY1_WIN_TOKENS", day: 1, label: "Win", hint: "GM Day 1 Win button", sign: 1, min: 1, fallback: 2 },
  { key: "DAY1_LOSE_TOKENS", day: 1, label: "Lose / participation", hint: "GM Day 1 Participation button", sign: 1, min: 1, fallback: 1 },
  { key: "EASY_COST", day: 2, label: "Easy entry", hint: "Low risk stations", sign: -1, min: 0, fallback: 2 },
  { key: "MEDIUM_COST", day: 2, label: "Medium entry", hint: "Medium risk stations", sign: -1, min: 0, fallback: 4 },
  { key: "HARD_COST", day: 2, label: "Hard entry", hint: "High risk stations", sign: -1, min: 0, fallback: 6 },
];

export const LOCATION_NAMES: Record<number, { name: string; short: string; code: string }> = {
  1: { name: "B1 Basement", short: "B1", code: "LOC1" },
  2: { name: "A3 Building", short: "A3", code: "LOC2" },
  3: { name: "Track & Field", short: "TF", code: "LOC3" },
};
