"use client";

import { useEffect, useState } from "react";

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

/**
 * Public Orientation 2026 homepage. One coherent neon world:
 *   - cinematic "Enter the Park" entry (emotional layer, reused from /park)
 *   - functional content sections adapted from the Figma Make prototype
 * Unauthenticated — Login is reachable from the nav but never forced.
 */
export default function OrientationHome() {
  const [revealed, setRevealed] = useState(false);

  // Reveal the nav once the intro finishes; also fall back on first scroll or a
  // timeout so the nav can never get stuck hidden.
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 40) setRevealed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(() => setRevealed(true), 4500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div className="nexus relative min-h-dvh bg-black text-white" style={{ fontFamily: FONT.body }}>
      <SiteNav revealed={revealed} />

      {/* Emotional layer: cinematic entry */}
      <CinematicHero onRevealed={() => setRevealed(true)} />

      {/* Functional layer: homepage content. Opaque so it covers the fixed
          WebGL layer as it scrolls up into view. */}
      <main style={{ position: "relative", zIndex: 20, background: "#05010c" }}>
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
