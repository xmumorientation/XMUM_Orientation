// The Day 2 game's inner schedule (migration 0102). fn_day2_state() returns
// the raw state; day2Now() works out the segment and switches from it, so a
// page changes segment on time without asking the server again. The server
// does the same sum (fn_day2_segment / fn_day2_allows) before it lets a
// fee, a piece, a blind box or a map light through.

export type Day2Segment = "normal1" | "challenge" | "normal2" | "funfair";
export type Day2Switch = "station" | "blindbox" | "funfair";

export interface Day2State {
  /** The Day 2 game is running (phases day2 active). */
  game_on: boolean;
  game_started_at: string | null;
  game_ends_at: string | null;
  /** Minutes from the game's start. */
  challenge_start_min: number;
  challenge_end_min: number;
  funfair_start_min: number;
  /** Set by a segment's Start button; null = follow the clock. */
  manual_segment: Day2Segment | null;
  /** Admin's switch flips, kept only while `override_segment` is on. */
  overrides: Partial<Record<Day2Switch, boolean>>;
  override_segment: Day2Segment | "off" | null;
  server_now: string;
}

export const SEGMENTS: { key: Day2Segment; label: string }[] = [
  { key: "normal1", label: "Normal" },
  { key: "challenge", label: "Challenge Mode" },
  { key: "normal2", label: "Normal" },
  { key: "funfair", label: "Funfair" },
];

export const SWITCHES: { key: Day2Switch; label: string }[] = [
  { key: "station", label: "Station Game" },
  { key: "blindbox", label: "Blind Box" },
  { key: "funfair", label: "Funfair" },
];

export const SEGMENT_DEFAULTS: Record<Day2Segment | "off", Record<Day2Switch, boolean>> = {
  off: { station: true, blindbox: false, funfair: false },
  normal1: { station: true, blindbox: false, funfair: false },
  challenge: { station: true, blindbox: true, funfair: false },
  normal2: { station: true, blindbox: true, funfair: false },
  funfair: { station: true, blindbox: true, funfair: true },
};

export interface Day2Now {
  /** "off": no Day 2 game and no segment started by hand. */
  segment: Day2Segment | "off";
  manual: boolean;
  switches: Record<Day2Switch, boolean>;
  /** Switches Admin flipped for this segment. */
  flipped: Partial<Record<Day2Switch, boolean>>;
  /** When each segment starts (ms), while the game runs. */
  starts: Record<Day2Segment, number> | null;
}

export function day2Now(s: Day2State | null, nowMs: number): Day2Now {
  const starts =
    s?.game_on && s.game_started_at
      ? (() => {
          const t0 = new Date(s.game_started_at).getTime();
          const at = (m: number) => t0 + m * 60_000;
          return {
            normal1: t0,
            challenge: at(s.challenge_start_min),
            normal2: at(s.challenge_end_min),
            funfair: at(s.funfair_start_min),
          };
        })()
      : null;
  let segment: Day2Segment | "off" = "off";
  if (s?.manual_segment) segment = s.manual_segment;
  else if (starts) {
    segment =
      nowMs >= starts.funfair ? "funfair" : nowMs >= starts.normal2 ? "normal2" : nowMs >= starts.challenge ? "challenge" : "normal1";
  }
  const flipped = s && s.override_segment === segment ? s.overrides : {};
  return { segment, manual: !!s?.manual_segment, switches: { ...SEGMENT_DEFAULTS[segment], ...flipped }, flipped, starts };
}

/** Why the blind box QR is grey, or null when it is open. */
export function blindBoxReason(n: Day2Now): string | null {
  if (n.switches.blindbox) return null;
  return n.flipped.blindbox === false ? "Switched off by Admin" : "Opens in challenge mode";
}
