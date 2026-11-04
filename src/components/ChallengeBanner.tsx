"use client";

import { useDay2State } from "@/components/useDay2State";
import { isChallengeMode } from "@/lib/day2";

import "@/components/challenge-banner.css";

/** Big red blinking "CHALLENGE MODE" while the Day 2 game runs with blind boxes on (0115). No timer. */
export function ChallengeBanner({ className }: { className?: string }) {
  const day2 = useDay2State();
  if (!isChallengeMode(day2)) return null;
  return (
    <div className={`challenge-banner${className ? ` ${className}` : ""}`} role="status">
      CHALLENGE MODE
    </div>
  );
}
