"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { scroll } from "./scrollStore";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  scrollRef: RefObject<HTMLDivElement | null>;
  reduced?: boolean;
  active?: boolean;
};

const capBase =
  "pointer-events-none absolute inset-x-0 px-6 text-center font-display font-bold uppercase text-white";

export function CinematicTypography({ scrollRef, reduced = false, active = true }: Props) {
  const hint = useRef<HTMLDivElement>(null);
  const journey = useRef<HTMLDivElement>(null);
  const meet = useRef<HTMLDivElement>(null);
  const explore = useRef<HTMLDivElement>(null);
  const experience = useRef<HTMLDivElement>(null);
  const open = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced || !scrollRef.current) return;

    const ctx = gsap.context(() => {
      gsap.set(hint.current, { autoAlpha: 1 });
      gsap.set(
        [journey.current, meet.current, explore.current, experience.current, open.current],
        { autoAlpha: 0, y: 24 }
      );

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scrollRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          onUpdate: (self) => {
            const span = self.end - self.start;
            scroll.target =
              span > 0 ? Math.min(Math.max((self.scroll() - self.start) / span, 0), 1) : 0;
          },
        },
      });

      tl.to({}, { duration: 1 }, 0);
      tl.to(hint.current, { autoAlpha: 0, y: -12, duration: 0.05 }, 0.03);

      const beat = (
        el: HTMLDivElement | null,
        appear: number,
        disappear?: number
      ) => {
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 24, filter: "blur(8px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.05, ease: "power2.out" },
          appear
        );
        if (disappear !== undefined) {
          tl.to(
            el,
            { autoAlpha: 0, y: -16, filter: "blur(8px)", duration: 0.05, ease: "power2.in" },
            disappear
          );
        }
      };

      beat(journey.current, 0.1, 0.26);
      beat(meet.current, 0.36, 0.48);
      beat(explore.current, 0.52, 0.63);
      beat(experience.current, 0.67, 0.8);
      beat(open.current, 0.84, 0.93);
    });

    return () => ctx.revert();
  }, [reduced, scrollRef]);

  if (reduced) {
    return (
      <div
        className={`pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 px-6 text-center ${
          active ? "" : "hidden"
        }`}
      >
        <p
          className="font-display text-3xl font-bold uppercase text-white sm:text-5xl"
          style={{ textShadow: "0 0 30px rgba(164,55,255,0.6)" }}
        >
          Your journey starts here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-sm tracking-[0.4em] text-[#12e6ff]">
          <span>MEET.</span>
          <span>EXPLORE.</span>
          <span>EXPERIENCE.</span>
        </div>
        <p
          className="font-display text-4xl font-bold uppercase text-white sm:text-6xl"
          style={{ textShadow: "0 0 40px rgba(18,230,255,0.7)" }}
        >
          Vortexa awaits.
        </p>
      </div>
    );
  }

  return (
    <div className={`pointer-events-none fixed inset-0 z-30 ${active ? "" : "hidden"}`}>
      <div
        ref={hint}
        className="pointer-events-none absolute inset-x-0 bottom-16 text-center font-mono text-sm tracking-[0.4em] text-[#12e6ff]"
        style={{ textShadow: "0 0 16px rgba(18,230,255,0.8)" }}
      >
        SCROLL TO ENTER <span className="inline-block animate-bounce">↓</span>
      </div>

      <div
        ref={journey}
        className={`${capBase} top-1/2 -translate-y-1/2 text-3xl tracking-tight sm:text-5xl`}
        style={{ textShadow: "0 0 34px rgba(164,55,255,0.7)" }}
      >
        Your journey<br />starts here.
      </div>

      <div
        ref={meet}
        className={`${capBase} top-1/2 -translate-y-1/2 text-6xl tracking-[0.15em] sm:text-8xl`}
        style={{ textShadow: "0 0 40px rgba(18,230,255,0.8)" }}
      >
        Meet.
      </div>

      <div
        ref={explore}
        className={`${capBase} top-1/2 -translate-y-1/2 text-6xl tracking-[0.15em] sm:text-8xl`}
        style={{ textShadow: "0 0 40px rgba(164,55,255,0.8)" }}
      >
        Explore.
      </div>

      <div
        ref={experience}
        className={`${capBase} top-1/2 -translate-y-1/2 text-6xl tracking-[0.15em] sm:text-8xl`}
        style={{ textShadow: "0 0 40px rgba(255,46,139,0.8)" }}
      >
        Experience.
      </div>

      <div
        ref={open}
        className={`${capBase} top-1/2 -translate-y-1/2 text-5xl tracking-tight sm:text-7xl`}
        style={{ textShadow: "0 0 48px rgba(18,230,255,0.9)" }}
      >
        The park is open.
      </div>
    </div>
  );
}
