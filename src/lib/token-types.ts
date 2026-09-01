// Domain types for the group-centric Token System & Scoreboard (strictly by group_id 1-10)

export type GameDifficulty = "NONE" | "EASY" | "MEDIUM" | "HARD";

export type TransactionType =
  | "DAY1_GAME"
  | "DAY2_ENTRY"
  | "MANUAL_GM_ADJUST"
  | "MANUAL_ADMIN_ADJUST"
  | "SYSTEM_RESET";

export interface TokenPreset {
  id: string;
  name: string;
  amount: number; // positive number (e.g. 1, 2, 4, 5, 6)
  action: "add" | "deduct";
  defaultNote: string;
  tag?: string; // e.g. "Day 1", "Day 2", "Bonus", "Penalty"
  icon?: string;
}

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

export const DEFAULT_TOKEN_PRESETS: TokenPreset[] = [
  {
    id: "preset_d1_win",
    name: "Day 1 Win Payout",
    amount: 2,
    action: "add",
    defaultNote: "Day 1 Station Win Payout",
    tag: "Day 1",
  },
  {
    id: "preset_d1_lose",
    name: "Day 1 Lose Payout",
    amount: 1,
    action: "add",
    defaultNote: "Day 1 Station Participation Payout",
    tag: "Day 1",
  },
  {
    id: "preset_d2_easy",
    name: "Day 2 Easy Entry",
    amount: 2,
    action: "deduct",
    defaultNote: "Day 2 Easy Station Entry Fee",
    tag: "Day 2",
  },
  {
    id: "preset_d2_med",
    name: "Day 2 Medium Entry",
    amount: 4,
    action: "deduct",
    defaultNote: "Day 2 Medium Station Entry Fee",
    tag: "Day 2",
  },
  {
    id: "preset_d2_hard",
    name: "Day 2 Hard Entry",
    amount: 6,
    action: "deduct",
    defaultNote: "Day 2 Hard Station Entry Fee",
    tag: "Day 2",
  },
  {
    id: "preset_bonus_cheer",
    name: "Cheer & Spirit Bonus",
    amount: 5,
    action: "add",
    defaultNote: "Orientation Cheer & Spirit Bonus",
    tag: "Bonus",
  },
  {
    id: "preset_penalty",
    name: "Rule Violation Penalty",
    amount: 2,
    action: "deduct",
    defaultNote: "Rule violation penalty",
    tag: "Penalty",
  },
];

export const LOCATION_NAMES: Record<number, { name: string; short: string; code: string }> = {
  1: { name: "B1 Basement", short: "B1", code: "LOC1" },
  2: { name: "A3 Building", short: "A3", code: "LOC2" },
  3: { name: "Track & Field", short: "TF", code: "LOC3" },
};
