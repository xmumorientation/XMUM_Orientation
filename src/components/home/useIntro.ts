"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "orientation_intro_seen";

/**
 * Tracks whether the opening title-card animation has already played in this
 * browser. This ONLY influences the initial reveal animation (returning
 * visitors get a quick fade instead of the full title sequence) — it never
 * changes the page layout or mounts/unmounts the cinematic section. The
 * cinematic is always structurally the first section of the homepage.
 *
 * `seen` is `null` until decided on the client (localStorage is browser-only),
 * so the reveal is rendered only once we know which variant to play. Server and
 * first client render agree, so there is no hydration mismatch.
 */
export function useIntroSeen() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let value = false;
    try {
      value = window.localStorage.getItem(KEY) === "1";
    } catch {
      // Private mode / storage disabled — treat as first visit.
    }
    setSeen(value);
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Ignore storage failures; the full reveal simply plays again next time.
    }
  }, []);

  return { seen, markSeen };
}
