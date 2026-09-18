"use client";

import { useCallback, useEffect, useState } from "react";

import { CinematicHero } from "./CinematicHero";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";
import { FONT } from "./data";
import { HomeContent } from "./sections/HomeContent";
import { Scoreboard } from "./sections/Scoreboard";
import { Games } from "./sections/Games";
import { CampusMap } from "./sections/CampusMap";
import { Schedule } from "./sections/Schedule";
import { Committees } from "./sections/Committees";

// Content world background: the same near-black the 3D fog uses (#05010c) with
// cyan/purple/pink ambient glow, and a transparent top edge so the content
// dissolves out of the cinematic park rather than starting at a hard seam.
const CONTENT_BG =
  "radial-gradient(70% 42% at 50% -6%, rgba(18,230,255,0.12), transparent 60%)," +
  "radial-gradient(55% 40% at 100% 8%, rgba(164,55,255,0.12), transparent 55%)," +
  "radial-gradient(50% 40% at 0% 30%, rgba(255,46,139,0.08), transparent 55%)," +
  "linear-gradient(to bottom, rgba(5,1,12,0) 0px, #05010c 260px)";

/**
 * Public Orientation 2026 homepage — one continuous, scrollable neon world:
 *   - the cinematic "Enter the Park" flight is the FIRST SECTION (emotional
 *     layer), always structurally present, driven by scroll progress;
 *   - the functional content sections (adapted from the Figma Make prototype)
 *     flow naturally below it.
 *
 * There is no intro→content phase swap: the user simply scrolls from the park
 * into the content. `orientation_intro_seen` only softens the opening title
 * animation for returning visitors; it never mounts/unmounts anything.
 * Unauthenticated — Login is reachable from the nav but never forced.
 */
export default function OrientationHome() {
  const [revealed, setRevealed] = useState(false);

  // Own scroll restoration only while the homepage is mounted, and always start
  // at the top of the cinematic section. The layout is identical every load
  // (cinematic first, content below), so this just guarantees the entrance
  // reads the same each time and a reload never drops the user mid-flight.
  // Restored on unmount so /login, /dashboard, etc. keep default behavior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "scrollRestoration" in window.history;
    const previous = supported ? window.history.scrollRestoration : null;
    if (supported) window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => {
      if (supported && previous) window.history.scrollRestoration = previous;
    };
  }, []);

  // Reveal the nav once the opening beat finishes; fall back to scroll/timeout
  // so it can never get stuck hidden if the reveal is skipped or interrupted.
  const handleRevealed = useCallback(() => setRevealed(true), []);
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 40) setRevealed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(() => setRevealed(true), 6000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div className="nexus relative min-h-dvh bg-[#05010c] text-white" style={{ fontFamily: FONT.body }}>
      <SiteNav revealed={revealed} />

      {/* Emotional layer: the cinematic entry is the first section of the page. */}
      <CinematicHero onRevealed={handleRevealed} />

      {/* Functional layer: homepage content flows directly below the cinematic.
          Neon-atmosphere background with a dissolving top edge continues the
          park world into the content — no hard seam, no handoff. */}
      <main style={{ position: "relative", zIndex: 20, background: CONTENT_BG }}>
        <HomeContent />
        <Scoreboard />
        <Games />
        <CampusMap />
        <Schedule />
        <Committees />
        <SiteFooter />
      </main>
    </div>
  );
}
