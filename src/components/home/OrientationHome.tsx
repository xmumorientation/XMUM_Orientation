"use client";

import { useCallback, useEffect, useState } from "react";

import { CinematicHero } from "./CinematicHero";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";
import { FONT } from "./data";
import { WelcomeSection } from "./sections/WelcomeSection";
import { OverviewSection } from "./sections/OverviewSection";
import { Games } from "./sections/Games";
import { Scoreboard } from "./sections/Scoreboard";
import { Schedule } from "./sections/Schedule";
import { Committees } from "./sections/Committees";
import { JoinSection } from "./sections/JoinSection";

/**
 * Public Orientation 2026 homepage — ONE continuous, unified Vortexa world:
 *   - the persistent 3D WebGL environment (CinematicHero) runs at z-0 across the
 *     entire page, providing the living atmosphere, lighting, depth, and world;
 *   - the functional HTML content sections (Welcome, Overview, Games, Scoreboard,
 *     Schedule, Committees, Join) sit naturally inside this single world at z-20,
 *     using transparent section backgrounds and subtle translucent glass surfaces
 *     for readability without ever creating a separate opaque "content layer".
 *
 * There is no intro→content phase swap, no route transition, and no artificial
 * background barrier. The user smoothly journeys through one continuous park.
 */
export default function OrientationHome() {
  const [revealed, setRevealed] = useState(false);

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
    <div className="nexus relative min-h-dvh text-white" style={{ fontFamily: FONT.body, backgroundColor: "#05010c" }}>
      <SiteNav revealed={revealed} />

      {/* World layer: Persistent 3D WebGL environment across the entire page */}
      <CinematicHero onRevealed={handleRevealed} />

      {/* Content layer: Transparent sections floating inside the 3D world */}
      <main style={{ position: "relative", zIndex: 20 }}>
        <WelcomeSection />
        <OverviewSection />
        <Games />
        <Scoreboard />
        <Schedule />
        <Committees />
        <JoinSection />
        <SiteFooter />
      </main>
    </div>
  );
}
