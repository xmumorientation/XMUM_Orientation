// The Day 2 moments that pop up a notice (Day2Alerts): the game starting with
// blind boxes on (Challenge), the Hard stations opening, and the funfair
// opening. They are read from day2Now() (src/lib/day2.ts), so they follow
// Admin's segments and live flips, not fixed minutes: if Admin moves Hard
// to 50 min or opens it by hand, the notice comes then.
import { isChallengeMode, type Day2Now, type Day2State } from "@/lib/day2";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

export type Day2Moment = "challenge" | "hard" | "funfair";

/** Highest first: when two arrive together, only the first is shown. */
const ORDER: Day2Moment[] = ["funfair", "hard", "challenge"];

const running = (n: Day2Now) => n.segment !== "off";

/** The funfair is open: the final stretch (ticker, heartbeat, red phase card). */
export function isFinalStretch(n: Day2Now): boolean {
  return running(n) && n.switches.funfair;
}

/** The Hard stations are open now and were closed earlier in this game (or Admin opened them by hand). */
function hardOpened(n: Day2Now, state: Day2State | null): boolean {
  if (!running(n) || !n.switches.hard) return false;
  if (n.flipped.hard === true) return true;
  return (state?.segments ?? []).slice(0, Math.max(0, n.index)).some((g) => !g.hard);
}

/** What a page shows when it loads mid-game: the latest moment that holds now. A reload shows it again. */
export function momentOnLoad(n: Day2Now, state: Day2State | null): Day2Moment | null {
  if (!running(n)) return null;
  if (n.switches.funfair) return "funfair";
  if (hardOpened(n, state)) return "hard";
  if (n.switches.blindbox) return "challenge";
  return null;
}

/** What changed between two readings on an open page: the moment to show, or null. */
export function momentBetween(prev: Day2Now, next: Day2Now, state: Day2State | null): Day2Moment | null {
  if (!running(next)) return null;
  // The game just started (or Admin held a segment): the same as opening the page now.
  if (!running(prev)) return momentOnLoad(next, state);
  const found: Day2Moment[] = [];
  if (isFinalStretch(next) && !isFinalStretch(prev)) found.push("funfair");
  if (!prev.switches.hard && next.switches.hard) found.push("hard");
  if (isChallengeMode(next) && !isChallengeMode(prev)) found.push("challenge");
  return ORDER.find((m) => found.includes(m)) ?? null;
}

/**
 * How strongly the screen edges beat in the final stretch: 1 faint, 2 once the
 * first projector is lit, 3 once the second is. 0 when the funfair is not
 * open, or every projector is lit (the race is over).
 */
export function heartbeatLevel(finalStretch: boolean, lit: number): 0 | 1 | 2 | 3 {
  if (!finalStretch || lit >= PROJECTOR_LOCATIONS.length) return 0;
  return Math.min(3, Math.max(0, lit) + 1) as 1 | 2 | 3;
}

/** Projectors lit in `next` that were not in `prev`, in map order. */
export function newlyLit(prev: ProjectorLocation[], next: ProjectorLocation[]): ProjectorLocation[] {
  return PROJECTOR_LOCATIONS.filter((loc) => next.includes(loc) && !prev.includes(loc));
}
