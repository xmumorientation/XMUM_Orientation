"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type Props = {
  reduced?: boolean;
  skip?: boolean;
  onDone?: () => void;
};

export function LoadingReveal({ reduced = false, skip = false, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLDivElement>(null);
  const line1 = useRef<HTMLDivElement>(null);
  const line2 = useRef<HTMLDivElement>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ctx = gsap.context(() => {
      const finish = () => {
        if (root.current) root.current.style.pointerEvents = "none";
        onDoneRef.current?.();
      };

      if (skip) {
        gsap.set([brand.current, line1.current, line2.current], { opacity: 0 });
        gsap.set(glow.current, { opacity: 0 });
        gsap.timeline({ onComplete: finish })
          .to(overlay.current, { opacity: 0, duration: 0.45, ease: "power2.out" }, 0.05);
        return;
      }

      if (reduced) {
        gsap.set([brand.current, line1.current, line2.current], { opacity: 1, y: 0 });
        gsap.set(glow.current, { opacity: 0.5 });
        gsap.timeline({ onComplete: finish })
          .to({}, { duration: 1.2 })
          .to([brand.current, line1.current, line2.current], { opacity: 0, duration: 0.4 })
          .to(overlay.current, { opacity: 0, duration: 0.6 }, "<");
        return;
      }

      const tl = gsap.timeline({ onComplete: finish });
      tl.to(glow.current, { opacity: 0.35, duration: 0.6 }, 0.5);
      tl.to(overlay.current, { opacity: 0.9, duration: 0.6 }, 1.0);
      tl.to(glow.current, { opacity: 0.55, duration: 0.5 }, 1.0);
      tl.to(overlay.current, { opacity: 0.68, duration: 0.6 }, 1.5);
      tl.to(glow.current, { opacity: 0.8, duration: 0.6 }, 1.5);
      tl.fromTo(brand.current,
        { opacity: 0, y: 26, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7 }, 1.9);
      tl.fromTo(line1.current,
        { opacity: 0, y: 20, filter: "blur(8px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6 }, 2.25);
      tl.fromTo(line2.current,
        { opacity: 0, y: 28, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8 }, 2.5);
      tl.to(overlay.current, { opacity: 0, duration: 1.0 }, 3.2);
      tl.to(glow.current, { opacity: 0, duration: 1.0 }, 3.2);
      tl.to([brand.current, line1.current, line2.current], { opacity: 0, y: -20, duration: 0.7 }, 3.7);
    }, root);

    return () => ctx.revert();
  }, [reduced, skip]);

  return (
    <div ref={root} className="fixed inset-0 z-40 flex items-center justify-center" aria-hidden="true">
      <div ref={overlay} className="absolute inset-0 bg-black" />
      <div ref={glow} className="pointer-events-none absolute inset-0 opacity-0"
        style={{ background: "radial-gradient(60% 45% at 50% 55%, rgba(18,230,255,0.28), rgba(164,55,255,0.18) 40%, rgba(5,1,12,0) 72%)" }} />
      <div className="relative z-10 px-6 text-center">
        <div ref={brand}
          className="font-display text-5xl font-black uppercase tracking-tight text-white opacity-0 sm:text-7xl md:text-8xl"
          style={{ textShadow: "0 0 44px rgba(18,230,255,0.75), 0 0 80px rgba(164,55,255,0.5)" }}>
          VORTEXA
        </div>
        <div ref={line1}
          className="mt-5 font-mono text-sm tracking-[0.5em] text-[#12e6ff] opacity-0 sm:text-base"
          style={{ textShadow: "0 0 18px rgba(18,230,255,0.8)" }}>
          XMUM&nbsp;ORIENTATION&nbsp;2026
        </div>
        <div ref={line2}
          className="mt-3 font-display text-xl font-bold uppercase tracking-tight text-white/90 opacity-0 sm:text-3xl md:text-4xl"
          style={{ textShadow: "0 0 40px rgba(164,55,255,0.7)" }}>
          One ticket, One Ride, Discover adventure Inside.
        </div>
      </div>
    </div>
  );
}
