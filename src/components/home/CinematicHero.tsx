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
 * The cinematic "Enter the Park" flight — the first section of the homepage.
 * A single fixed WebGL layer + caption overlay sit behind a tall scroll spacer;
 * scroll progress along that spacer drives the camera. Once the user scrolls
 * past the section into the content, the layer is hidden and its render loop
 * paused to free the GPU — but it is never unmounted and the page layout never
 * changes, so scrolling stays continuous with a single canvas.
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

  // Toggle the WebGL layer only while the hero region is on screen. This pauses
  // the render loop when the park is off-screen without unmounting the canvas.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = spacerRef.current?.offsetHeight ?? window.innerHeight;
      setHeroActive(window.scrollY < h - 2);
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

  // The opening reveal has finished (either the full first-visit sequence or the
  // quick returning-visitor fade): remember it and reveal the nav.
  const handleRevealed = useCallback(() => {
    markSeen();
    onRevealed?.();
  }, [markSeen, onRevealed]);

  // Hero scroll length: long on desktop for the flight, short for reduced motion.
  const heroHeight = reduced ? "110vh" : mobile ? "360vh" : "480vh";

  return (
    <>
      <div className="fixed inset-0 z-0" style={{ display: heroActive ? "block" : "none" }}>
        {mounted && <CinematicScene mobile={mobile} reduced={reduced} paused={!heroActive} />}
      </div>

      {mounted && <CinematicTypography scrollRef={spacerRef} reduced={reduced} active={heroActive} />}

      {/* Opening title card. Rendered only once `seen` is decided so we know
          whether to play the full sequence or a quick fade for returning
          visitors — never gating layout, only the animation. */}
      {mounted && seen !== null && (
        <LoadingReveal reduced={reduced} skip={seen} onDone={handleRevealed} />
      )}

      {/* Scroll length for the cinematic camera flight. */}
      <div ref={spacerRef} aria-hidden="true" className="relative z-10" style={{ height: heroHeight }} />
    </>
  );
}
