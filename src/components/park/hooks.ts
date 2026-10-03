"use client";

import { useEffect, useState } from "react";

/** Tracks a media query, SSR-safe (starts false, syncs on mount). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True when the user has requested reduced motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** True on narrow / touch-first viewports — drives the simplified mobile scene. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}

/** Avoids rendering the WebGL canvas until mounted on the client. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
