"use client";

import { useDay2State } from "@/components/useDay2State";

import "@/components/challenge-banner.css";

/** Big red blinking "CHALLENGE MODE" while the Day 2 game is in it (0102). No timer. */
export function ChallengeBanner({ className }: { className?: string }) {
  const { segment } = useDay2State();
  if (segment !== "challenge") return null;
  return (
    <div className={`challenge-banner${className ? ` ${className}` : ""}`} role="status">
      CHALLENGE MODE
    </div>
  );
}
