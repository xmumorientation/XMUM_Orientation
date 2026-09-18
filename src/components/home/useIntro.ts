"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "orientation_intro_seen";

/**
 * "checking" — pre-mount / SSR state (render deterministically to avoid
 *              hydration mismatches; localStorage is browser-only).
 * "intro"    — first visit: play the cinematic entrance once.
 * "content"  — intro already seen: land directly on the homepage content.
 */
export type IntroPhase = "checking" | "intro" | "content";

export function useIntro() {
  const [phase, setPhase] = useState<IntroPhase>("checking");

  // Decide on the client only. Server and first client render both use
  // "checking", so hydration stays consistent.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(KEY) === "1";
    } catch {
      // Private mode / storage disabled — treat as first visit.
    }
    setPhase(seen ? "content" : "intro");
  }, []);

  // Persisted ONLY after the cinematic has actually completed (never on mount).
  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Ignore storage failures; the intro simply plays again next time.
    }
  }, []);

  return { phase, markSeen };
}
