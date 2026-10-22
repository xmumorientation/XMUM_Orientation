import type { Phase } from "./types";

export function activeMapDay(phases: Pick<Phase, "key" | "state">[]): 1 | 2 {
  const running = phases.find((p) => (p.key === "day1" || p.key === "day2") && (p.state === "active" || p.state === "paused"));
  if (running) return running.key === "day2" ? 2 : 1;
  return phases.some((p) => p.key === "day2" && p.state === "ended") ||
    phases.some((p) => p.key === "day1" && p.state === "ended") ? 2 : 1;
}
