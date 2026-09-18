"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { CinematicTypography } from "./CinematicTypography";
import { LoadingReveal } from "./LoadingReveal";
import { useIsMobile, useMounted, useReducedMotion } from "./hooks";
import { resetScroll } from "./scrollStore";

// The WebGL scene touches browser-only APIs, so never render it on the server.
const CinematicScene = dynamic(() => import("./CinematicScene"), { ssr: false });

/**
 * Top-level client orchestrator for the "Enter the Park" prototype.
 *
 * Layout is three stacked layers plus an invisible scroll spacer:
 *   - fixed WebGL canvas (z-0)
 *   - fixed HTML typography overlay (z-30)
 *   - fixed loading reveal overlay (z-40, dissolves once)
 *   - a tall in-flow spacer that gives the page its scrollable length
 */
export default function EnterThePark() {
  const reduced = useReducedMotion();
  const mobile = useIsMobile();
  const mounted = useMounted();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setRevealDone] = useState(false);

  // Always begin at the top so the cinematic sequence starts from frame one.
  useEffect(() => {
    resetScroll();
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="relative w-full bg-black text-white">
      {/* WebGL layer */}
      <div className="fixed inset-0 z-0">
        {mounted && <CinematicScene mobile={mobile} reduced={reduced} />}
      </div>

      {/* Cinematic captions */}
      {mounted && <CinematicTypography scrollRef={scrollRef} reduced={reduced} />}

      {/* Opening reveal */}
      {mounted && <LoadingReveal reduced={reduced} onDone={() => setRevealDone(true)} />}

      {/* Scroll length. In reduced-motion mode there is no long scroll. */}
      <div
        ref={scrollRef}
        aria-hidden="true"
        className="relative z-10"
        style={{ height: reduced ? "100vh" : "600vh" }}
      />

      {/* Accessible, always-present description of the experience. */}
      <div className="sr-only">
        <h1>Orientation 2026 — Enter the Park</h1>
        <p>
          A cinematic prototype for the university orientation website. Welcome to
          the Park: your journey starts here. Meet, explore, and experience a
          futuristic neon carnival. The park is open.
        </p>
      </div>
    </main>
  );
}
