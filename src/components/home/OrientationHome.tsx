"use client";

import { useCallback, useEffect, useState } from "react";

import { CinematicHero } from "./CinematicHero";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";
import { FONT } from "./data";
import { useIntro } from "./useIntro";
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
 * Public Orientation 2026 homepage. One coherent neon world:
 *   - cinematic "Enter the Park" entry (emotional layer, plays once per browser)
 *   - functional content sections adapted from the Figma Make prototype
 * Unauthenticated — Login is reachable from the nav but never forced.
 */
export default function OrientationHome() {
  const { phase, markSeen } = useIntro();
  const [revealed, setRevealed] = useState(false);

  // Take over scroll restoration only while the homepage is mounted, so a
  // reload never restores an old cinematic-layout scroll position into the
  // (shorter) content-only layout. Restored on unmount so navigation elsewhere
  // (e.g. /login, /dashboard) keeps the browser/Next.js default behavior.
  // Client-only effect → no hydration impact.
  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  // Returning/skip visitors: show the nav immediately and land at the top of the
  // homepage content (never a restored mid-content position).
  useEffect(() => {
    if (phase === "content") {
      setRevealed(true);
      window.scrollTo(0, 0);
    }
  }, [phase]);

  // Fallbacks so the nav can never get stuck hidden during the intro.
  useEffect(() => {
    if (phase !== "intro") return;
    const onScroll = () => {
      if (window.scrollY > 40) setRevealed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t = window.setTimeout(() => setRevealed(true), 6000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, [phase]);

  // Called only when the cinematic reveal has actually finished — this is where
  // the "intro seen" flag is persisted (never on mount).
  const handleIntroComplete = useCallback(() => {
    setRevealed(true);
    markSeen();
  }, [markSeen]);

  return (
    <div className="nexus relative min-h-dvh bg-[#05010c] text-white" style={{ fontFamily: FONT.body }}>
      <SiteNav revealed={revealed} />

      {/* Emotional layer: cinematic entry — mounted only on first visit so there
          is never a second WebGL scene or a replayed reveal. */}
      {phase === "intro" && <CinematicHero onRevealed={handleIntroComplete} />}

      {/* Functional layer: homepage content. Neon-atmosphere background with a
          dissolving top edge continues the park world into the content. */}
      <main
        style={{
          position: "relative",
          zIndex: 20,
          background: CONTENT_BG,
          paddingTop: phase === "content" ? 56 : 0,
        }}
      >
        <HomeContent />
        <Scoreboard />
        <Games />
        <CampusMap />
        <Schedule />
        <Committees />
        <SiteFooter />
      </main>

      {/* Deterministic black cover until the client decides intro vs content —
          avoids a content flash and hands seamlessly to the cinematic's own
          black opening on first visit. */}
      {phase === "checking" && (
        <div className="fixed inset-0 z-[60] bg-black" aria-hidden="true" />
      )}
    </div>
  );
}
