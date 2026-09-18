"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type Props = {
  reduced?: boolean;
  onDone?: () => void;
};

/**
 * The opening beat: a full-black screen that cinematically dissolves to reveal
 * the park behind it while the title typography rises. Purely time-based (not
 * scroll-based) so it plays once on load, then hands control to the scroll story.
 */
export function LoadingReveal({ reduced = false, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const line1 = useRef<HTMLDivElement>(null);
  const line2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const finish = () => {
        if (root.current) root.current.style.pointerEvents = "none";
        onDone?.();
      };

      if (reduced) {
        // Simplified but still a reveal: quick title, quick dissolve.
        gsap.set([line1.current, line2.current], { opacity: 1, y: 0 });
        gsap.set(glow.current, { opacity: 0.5 });
        gsap
          .timeline({ onComplete: finish })
          .to({}, { duration: 1.2 })
          .to([line1.current, line2.current], { opacity: 0, duration: 0.4 })
          .to(overlay.current, { opacity: 0, duration: 0.6 }, "<");
        return;
      }

      const tl = gsap.timeline({ onComplete: finish });
      // 0.5s: subtle neon glow begins
      tl.to(glow.current, { opacity: 0.35, duration: 0.6 }, 0.5);
      // 1.0s: faint silhouettes appear (overlay lifts slightly)
      tl.to(overlay.current, { opacity: 0.9, duration: 0.6 }, 1.0);
      tl.to(glow.current, { opacity: 0.55, duration: 0.5 }, 1.0);
      // 1.5s: neon lights illuminate, wheel partially visible
      tl.to(overlay.current, { opacity: 0.68, duration: 0.6 }, 1.5);
      tl.to(glow.current, { opacity: 0.8, duration: 0.6 }, 1.5);
      // 2.0s: main typography rises
      tl.fromTo(
        line1.current,
        { opacity: 0, y: 24, filter: "blur(8px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7 },
        2.0
      );
      tl.fromTo(
        line2.current,
        { opacity: 0, y: 28, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8 },
        2.35
      );
      // 2.6s+: black overlay dissolves fully, titles fade so the story can begin
      tl.to(overlay.current, { opacity: 0, duration: 1.0 }, 2.9);
      tl.to(glow.current, { opacity: 0, duration: 1.0 }, 2.9);
      tl.to([line1.current, line2.current], { opacity: 0, y: -20, duration: 0.7 }, 3.4);
    }, root);

    return () => ctx.revert();
  }, [reduced, onDone]);

  return (
    <div
      ref={root}
      className="fixed inset-0 z-40 flex items-center justify-center"
      aria-hidden="true"
    >
      {/* Solid black that dissolves to reveal the scene */}
      <div ref={overlay} className="absolute inset-0 bg-black" />
      {/* Soft neon aura behind the titles */}
      <div
        ref={glow}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 55%, rgba(18,230,255,0.28), rgba(164,55,255,0.18) 40%, rgba(5,1,12,0) 72%)",
        }}
      />
      <div className="relative z-10 px-6 text-center">
        <div
          ref={line1}
          className="font-mono text-sm tracking-[0.5em] text-[#12e6ff] opacity-0 sm:text-base"
          style={{ textShadow: "0 0 18px rgba(18,230,255,0.8)" }}
        >
          ORIENTATION&nbsp;2026
        </div>
        <div
          ref={line2}
          className="mt-4 font-display text-4xl font-bold uppercase tracking-tight text-white opacity-0 sm:text-6xl md:text-7xl"
          style={{ textShadow: "0 0 40px rgba(164,55,255,0.7)" }}
        >
          Welcome to the Park
        </div>
      </div>
    </div>
  );
}
