"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { CinematicTypography } from "@/components/park/CinematicTypography";
import { LoadingReveal } from "@/components/park/LoadingReveal";
import { useIsMobile, useMounted, useReducedMotion } from "@/components/park/hooks";
import { resetScroll } from "@/components/park/scrollStore";
import { useIntroSeen } from "./useIntro";

const CinematicScene = dynamic(() => import("@/components/park/CinematicScene"), { ssr: false });

/**
 * The cinematic "Enter the Park" flight — the visual backbone of the homepage.
 * A single fixed WebGL canvas sits permanently at z-0 behind the entire page.
 * During the initial spacer, scroll progress drives the camera flight and
 * synchronized typography captions. Once the user scrolls past into the HTML
 * content, the canvas remains continuously visible as the living 3D environment
 * (with slowly rotating Ferris wheel, neon grid, stars, and atmospheric lights),
 * providing the real world within which all content sections naturally float.
 */
export function CinematicHero({ onRevealed }: { onRevealed?: () => void }) {
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const mounted = useMounted();
  const { seen, markSeen } = useIntroSeen();
  const spacerRef = useRef<HTMLDivElement>(null);
  const [heroActive, setHeroActive] = useState(true);

  useEffect(() => {
    resetScroll();
    window.scrollTo(0, 0);
  }, []);

  // Track when the opening captions region is in view vs scrolled past.
  // The 3D canvas stays permanently visible; only the Opening typography overlay
  // is hidden once the user enters the Welcome section.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = spacerRef.current?.offsetHeight ?? window.innerHeight;
      const y = window.scrollY;
      setHeroActive(y < h - 2);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const handleRevealed = useCallback(() => {
    markSeen();
    onRevealed?.();
  }, [markSeen, onRevealed]);

  const heroHeight = reduced ? "110vh" : mobile ? "360vh" : "480vh";

  return (
    <>
      {/* Persistent WebGL canvas: fixed full-viewport at z-0, visible across all sections */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        {mounted && <CinematicScene mobile={mobile} reduced={reduced} paused={reduced} />}
      </div>

      {/* Opening captions overlay: active only during the initial flight */}
      {mounted && <CinematicTypography scrollRef={spacerRef} reduced={reduced} active={heroActive} />}

      {/* Initial cinematic reveal title card: fades once on first visit */}
      {mounted && seen !== null && (
        <LoadingReveal reduced={reduced} skip={seen} onDone={handleRevealed} />
      )}

      {/* Scroll length for the camera flight */}
      <div ref={spacerRef} aria-hidden="true" className="relative z-10" style={{ height: heroHeight }} />
    </>
  );
}
