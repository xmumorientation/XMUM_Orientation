"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type Props = {
  reduced?: boolean;
  /**
   * Returning visitor: skip the full title sequence and just dissolve the black
   * cover quickly to reveal the park. Keeps the cinematic section intact while
   * avoiding a repeat of the expensive opening animation.
   */
  skip?: boolean;
  onDone?: () => void;
};

/**
 * The opening beat: a full-black screen that cinematically dissolves to reveal
 * the park behind it while the title typography rises. Purely time-based (not
 * scroll-based) so it plays once on load, then hands control to the scroll story.
 */
export function LoadingReveal({ reduced = false, skip = false, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLDivElement>(null);
  const line1 = useRef<HTMLDivElement>(null);
  const line2 = useRef<HTMLDivElement>(null);

  // Keep the latest onDone without making it an effect dependency — otherwise a
  // new callback identity from the parent would re-run the effect and replay the
  // entire intro. The timeline must build exactly once.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ctx = gsap.context(() => {
      const finish = () => {
        if (root.current) root.current.style.pointerEvents = "none";
        onDoneRef.current?.();
      };

      if (skip) {
        // Returning visitor: no title cards, just a quick dissolve of the black
        // cover into the already-familiar park. The scroll-driven cinematic
        // section itself is unchanged.
        gsap.set([brand.current, line1.current, line2.current], { opacity: 0 });
        gsap.set(glow.current, { opacity: 0 });
        gsap
          .timeline({ onComplete: finish })
          .to(overlay.current, { opacity: 0, duration: 0.45, ease: "power2.out" }, 0.05);
        return;
      }

      if (reduced) {
        // Simplified but still a reveal: quick title, quick dissolve.
        gsap.set([brand.current, line1.current, line2.current], { opacity: 1, y: 0 });
        gsap.set(glow.current, { opacity: 0.5 });
        gsap
          .timeline({ onComplete: finish })
          .to({}, { duration: 1.2 })
          .to([brand.current, line1.current, line2.current], { opacity: 0, duration: 0.4 })
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
      // 1.9s: NEXUS '26 brand rises first
      tl.fromTo(
        brand.current,
        { opacity: 0, y: 26, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7 },
        1.9
      );
      // 2.25s: ORIENTATION 2026 kicker
      tl.fromTo(
        line1.current,
        { opacity: 0, y: 20, filter: "blur(8px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6 },
        2.25
      );
      // 2.5s: WELCOME TO THE PARK
      tl.fromTo(
        line2.current,
        { opacity: 0, y: 28, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8 },
        2.5
      );
      // 3.1s+: black overlay dissolves fully, titles fade so the story can begin
      tl.to(overlay.current, { opacity: 0, duration: 1.0 }, 3.2);
      tl.to(glow.current, { opacity: 0, duration: 1.0 }, 3.2);
      tl.to([brand.current, line1.current, line2.current], { opacity: 0, y: -20, duration: 0.7 }, 3.7);
    }, root);

    return () => ctx.revert();
  }, [reduced, skip]);

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
          ref={brand}
          className="font-display text-5xl font-black uppercase tracking-tight text-white opacity-0 sm:text-7xl md:text-8xl"
          style={{ textShadow: "0 0 44px rgba(18,230,255,0.75), 0 0 80px rgba(164,55,255,0.5)" }}
        >
          NEXUS <span className="text-[#12e6ff]">&apos;26</span>
        </div>
        <div
          ref={line1}
          className="mt-5 font-mono text-sm tracking-[0.5em] text-[#12e6ff] opacity-0 sm:text-base"
          style={{ textShadow: "0 0 18px rgba(18,230,255,0.8)" }}
        >
          ORIENTATION&nbsp;2026
        </div>
        <div
          ref={line2}
          className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-white/90 opacity-0 sm:text-5xl"
          style={{ textShadow: "0 0 40px rgba(164,55,255,0.7)" }}
        >
          Welcome to the Park
        </div>
      </div>
    </div>
  );
}
