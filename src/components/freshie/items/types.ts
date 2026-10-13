import type { ProjectorLocation } from "@/lib/types";

// What the Items page needs to draw. The page only reads this shape, so the
// data source (sample data today, the bonding-session RPCs later) can change
// without touching the components.

export type GamePhase = "day1" | "day2" | "endgame" | "done";

export type LitBy = {
  groupId: number;
  name: string;
  color: string;
  /** True when the viewer's own group lit it. */
  isUs: boolean;
};

/** Key of a box group on the shelf. Live boxes are grouped by type name. */
export type BoxKind = string;

/** The group's boxes of one type: how many are still sealed, and what opened ones gave. */
export type BoxGroup = {
  key: BoxKind;
  /** e.g. "Gold box". */
  name: string;
  /** Short name used in tags, e.g. "Gold". */
  label: string;
  /** Special boxes get the gold look. */
  special: boolean;
  /** What it can give. Only the sample knows; real prizes stay hidden until opened. */
  range?: string;
  /** Whether it may give a puzzle piece (sample only; real boxes give tokens). */
  mayGivePiece?: boolean;
  /** Bought but not opened yet. */
  unopened: number;
  /** Tokens each opened box gave, oldest first (0 for a box that gave a piece). */
  opened: number[];
};

/** What one opened box gave: tokens, or a puzzle piece. */
export type BoxReward =
  | {
      type: "tokens";
      amount: number;
      /** Set for a real (bought) box: it opens with the full-screen opening clip, then the prize screen. */
      real?: { special: boolean; seller: string; balance: number };
    }
  | { type: "piece"; loc: ProjectorLocation; piece: number };

export type HistoryKind = "game" | "entry" | "piece" | "box" | "fix" | "lit";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  day: 1 | 2;
  /** May contain {B1}, {A3} or {TF}; shown as the code name until the map unlocks. */
  title: string;
  detail: string;
  /** Token change. 0 for entries that only move pieces or light a projector. */
  amount: number;
  /** Display time, e.g. "14:22". */
  time: string;
};

export type GuardianSpot = {
  /** Where the Guardian stands, in words. */
  place: string;
  /** Extra direction, e.g. "Look for the light-blue vest". */
  hint: string;
  /** Photo of the spot. Null until Admin uploads one. */
  photoUrl: string | null;
};

export type ItemsData = {
  phase: GamePhase;
  /** Remaining time on the current phase, e.g. "1:05:12". Null when not running. */
  timeLeft: string | null;
  group: { id: number; name: string };
  /** False until the full map unlocks: locations show as code names and the Guardian spot stays hidden. */
  mapUnlocked: boolean;
  tokens: { balance: number };
  /** Day 2 entry costs by risk tier. */
  costs: { low: number; medium: number; high: number };
  /** Who lit each projector. Null while it is dark. */
  projectors: Record<ProjectorLocation, LitBy | null>;
  /** Piece numbers (1–5) the group owns, per location. */
  pieces: Record<ProjectorLocation, number[]>;
  guardian: Record<ProjectorLocation, GuardianSpot>;
  boxes: BoxGroup[];
  history: HistoryEntry[];
};
