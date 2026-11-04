// The Day 2 game's inner schedule (migration 0115). fn_day2_state() returns
// the raw state; day2Now() works out the segment and switches from it, so a
// page changes segment on time without asking the server again. The server
// does the same sum (fn_day2_segment / fn_day2_off_reason) before it lets a
// fee, a piece, a blind box or a map light through.
import type { RiskTier } from "@/lib/types";

export type Day2Switch = "easy" | "medium" | "hard" | "blindbox" | "funfair";

/** A switch for each station risk tier: low = Easy, medium = Medium, high = Hard. */
export type Day2Tier = "easy" | "medium" | "hard";
export const TIER_SWITCH: Record<RiskTier, Day2Tier> = { low: "easy", medium: "medium", high: "hard" };

export const MAX_SEGMENTS = 8;

export interface Day2SegmentDef extends Record<Day2Switch, boolean> {
  /** Stable id (not the position), so a hold or a flip survives edits to other segments. */
  id: string;
  label: string;
  /** Minutes from the game's real start. The first is always 0. */
  start_min: number;
}

export interface Day2State {
  /** The Day 2 game is running (phases day2 active). */
  game_on: boolean;
  game_started_at: string | null;
  game_ends_at: string | null;
  segments: Day2SegmentDef[];
  /** Set by a segment's Start button (a segment id); null = follow the clock. */
  manual_segment: string | null;
  /** Admin's live flips, kept only while `override_segment` is on. */
  overrides: Partial<Record<Day2Switch, boolean>>;
  override_segment: string | null;
  server_now: string;
}

export const SWITCHES: { key: Day2Switch; label: string }[] = [
  { key: "easy", label: "Easy Station" },
  { key: "medium", label: "Medium Station" },
  { key: "hard", label: "Hard Station" },
  { key: "blindbox", label: "Blind Box" },
  { key: "funfair", label: "Funfair" },
];

/** Outside the game with no segment held: stations open, blind box and funfair closed. */
export const OFF_SWITCHES: Record<Day2Switch, boolean> = {
  easy: true,
  medium: true,
  hard: true,
  blindbox: false,
  funfair: false,
};

export interface Day2Now {
  /** The segment's id, or "off": no Day 2 game and no segment held. */
  segment: string;
  /** Index into state.segments, -1 when "off". */
  index: number;
  label: string;
  manual: boolean;
  switches: Record<Day2Switch, boolean>;
  /** Switches Admin flipped for this segment. */
  flipped: Partial<Record<Day2Switch, boolean>>;
  /** When each segment starts (ms), while the game runs. */
  starts: number[] | null;
}

export function day2Now(s: Day2State | null, nowMs: number): Day2Now {
  const segs = s?.segments ?? [];
  const starts =
    s?.game_on && s.game_started_at
      ? (() => {
          const t0 = new Date(s.game_started_at).getTime();
          return segs.map((g) => t0 + g.start_min * 60_000);
        })()
      : null;
  let index = -1;
  const held = s?.manual_segment ? segs.findIndex((g) => g.id === s.manual_segment) : -1;
  if (held >= 0) index = held;
  else if (starts) {
    for (let i = 0; i < starts.length; i++) if (nowMs >= starts[i]) index = i;
  }
  const def = index >= 0 ? segs[index] : null;
  const segment = def ? def.id : "off";
  const flipped = s && s.override_segment === segment ? s.overrides : {};
  const base: Record<Day2Switch, boolean> = def
    ? { easy: def.easy, medium: def.medium, hard: def.hard, blindbox: def.blindbox, funfair: def.funfair }
    : OFF_SWITCHES;
  return {
    segment,
    index,
    label: def?.label || (def ? `Segment ${index + 1}` : ""),
    manual: held >= 0,
    switches: { ...base, ...flipped },
    flipped,
    starts,
  };
}

/** Why the blind box QR is grey, or null when it is open. */
export function blindBoxReason(n: Day2Now): string | null {
  if (n.switches.blindbox) return null;
  return n.flipped.blindbox === false ? "Switched off by Admin" : "Opens when the Day 2 game starts";
}

/** Challenge Mode: the Day 2 game is running and blind boxes are on. */
export function isChallengeMode(n: Day2Now): boolean {
  return n.segment !== "off" && n.switches.blindbox;
}

/**
 * Whether a station tier is open now, and when it reopens by the clock
 * (ms, null when no later segment opens it, or a segment is held by hand).
 */
export function tierStatus(n: Day2Now, tier: RiskTier, state: Day2State | null): { open: boolean; reopenAt: number | null } {
  const sw = TIER_SWITCH[tier];
  if (n.switches[sw]) return { open: true, reopenAt: null };
  if (n.manual || !n.starts || !state) return { open: false, reopenAt: null };
  for (let i = n.index + 1; i < state.segments.length; i++) {
    if (state.segments[i][sw]) return { open: false, reopenAt: n.starts[i] };
  }
  return { open: false, reopenAt: null };
}

/** "Closed", "Opens at 60 min" style text for a closed tier. */
export function tierClosedText(
  n: Day2Now,
  tier: RiskTier,
  state: Day2State | null
): string | null {
  const t = tierStatus(n, tier, state);
  if (t.open) return null;
  if (n.flipped[TIER_SWITCH[tier]] === false) return "Closed by Admin";
  if (t.reopenAt !== null && state?.game_started_at) {
    const min = Math.round((t.reopenAt - new Date(state.game_started_at).getTime()) / 60_000);
    return `Closed until ${min} min`;
  }
  return "Closed";
}

/** The Day 2 segments: end minute of each (the next start, or the game's length). */
export function segmentEnds(segments: Day2SegmentDef[], length: number): number[] {
  return segments.map((g, i) => (i + 1 < segments.length ? segments[i + 1].start_min : Math.max(length, g.start_min)));
}

/** A new segment id that no other segment uses. */
export function newSegmentId(segments: Day2SegmentDef[]): string {
  const used = new Set(segments.map((g) => g.id));
  let n = segments.length + 1;
  while (used.has(`s${n}`)) n++;
  return `s${n}`;
}
